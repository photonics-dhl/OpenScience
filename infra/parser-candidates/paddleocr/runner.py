from __future__ import annotations

import hashlib
import json
import logging
import math
from numbers import Real
from pathlib import Path
import sys
import time
from typing import Any, Mapping, Sequence


MAX_MANIFEST_BYTES = 1_048_576
MAX_SOURCE_BYTES = 50 * 1024 * 1024
LOCK_ROOT = Path("/opt/paddleocr-lock")
PAGE_WIDTH = 612.0
PAGE_HEIGHT = 792.0


def _finite_number(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ValueError("coordinate must be numeric")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("coordinate must be finite")
    return result


def _intersects(left: Sequence[float], right: Sequence[float]) -> bool:
    return min(left[2], right[2]) > max(left[0], right[0]) and min(left[3], right[3]) > max(left[1], right[1])


def _pdf_bbox(
    left: Any,
    top: Any,
    right: Any,
    bottom: Any,
    image_width: float,
    image_height: float,
) -> tuple[float, float, float, float]:
    left, top, right, bottom = (_finite_number(value) for value in (left, top, right, bottom))
    if image_width <= 0 or image_height <= 0:
        raise ValueError("invalid OCR image dimensions")
    if not (0 <= left < right <= image_width and 0 <= top < bottom <= image_height):
        raise ValueError("OCR box is outside image bounds")
    normalized = (
        left * PAGE_WIDTH / image_width,
        PAGE_HEIGHT - bottom * PAGE_HEIGHT / image_height,
        right * PAGE_WIDTH / image_width,
        PAGE_HEIGHT - top * PAGE_HEIGHT / image_height,
    )
    if not (
        0 <= normalized[0] < normalized[2] <= PAGE_WIDTH
        and 0 <= normalized[1] < normalized[3] <= PAGE_HEIGHT
        and all(math.isfinite(value) for value in normalized)
    ):
        raise ValueError("normalized OCR box is outside page bounds")
    return normalized


def _page_text(page: Mapping[str, Any]) -> str:
    return " ".join(str(item.get("text", "")).strip() for item in page.get("items", []) if str(item.get("text", "")).strip())


def evaluate_locators(pages: Mapping[int, Mapping[str, Any]], locators: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    matches = 0
    for locator in locators:
        page_number = locator.get("page") if isinstance(locator, Mapping) else None
        page = pages.get(page_number) if isinstance(page_number, int) and not isinstance(page_number, bool) else None
        matched = False
        if page is not None and locator.get("kind") == "page-text":
            quote = " ".join(str(locator.get("quote", "")).split())
            matched = bool(quote) and quote in " ".join(_page_text(page).split())
        elif page is not None and locator.get("kind") == "page-region":
            region = locator.get("bbox")
            if isinstance(region, Sequence) and not isinstance(region, (str, bytes)) and len(region) == 4:
                try:
                    bounded_region = tuple(_finite_number(value) for value in region)
                    matched = any(
                        isinstance(item, Mapping)
                        and isinstance(item.get("bbox"), Sequence)
                        and len(item["bbox"]) == 4
                        and _intersects(item["bbox"], bounded_region)
                        for item in page.get("items", [])
                    )
                except ValueError:
                    matched = False
        if matched:
            matches += 1
    if matches == len(locators):
        return {"status": "succeeded", "locatorMatches": matches}
    return {"status": "needs_review", "locatorMatches": matches, "errorCode": "locator_miss"}


def _result_mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    serialized = getattr(value, "json", None)
    if callable(serialized):
        serialized = serialized()
    if isinstance(serialized, str):
        serialized = json.loads(serialized)
    if isinstance(serialized, Mapping):
        return serialized
    raise ValueError("invalid PaddleOCR result")


def _array_values(value: Any) -> Sequence[Any]:
    if value is None:
        return []
    tolist = getattr(value, "tolist", None)
    if callable(tolist):
        value = tolist()
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return value
    return []


def _pages_from_results(results: Sequence[Any]) -> dict[int, dict[str, Any]]:
    pages: dict[int, dict[str, Any]] = {}
    for fallback_index, raw_result in enumerate(results):
        raw = _result_mapping(raw_result)
        payload = raw.get("res") if isinstance(raw.get("res"), Mapping) else raw
        page_index = payload.get("page_index", fallback_index)
        page_number = int(page_index) + 1
        texts = _array_values(payload.get("rec_texts"))
        raw_boxes = payload.get("rec_boxes")
        if raw_boxes is None:
            raw_boxes = payload.get("rec_polys")
        boxes = _array_values(raw_boxes)
        input_image = raw.get("input_img")
        shape = getattr(input_image, "shape", None)
        image_height = _finite_number(shape[0]) if isinstance(shape, Sequence) and len(shape) >= 2 else PAGE_HEIGHT
        image_width = _finite_number(shape[1]) if isinstance(shape, Sequence) and len(shape) >= 2 else PAGE_WIDTH
        if image_height <= 0 or image_width <= 0:
            raise ValueError("invalid OCR image dimensions")
        items = []
        for text, raw_box in zip(texts, boxes):
            box = _array_values(raw_box)
            if not isinstance(text, str) or not text.strip() or not box:
                continue
            try:
                if len(box) == 4 and all(isinstance(value, Real) and not isinstance(value, bool) for value in box):
                    left, top, right, bottom = box
                else:
                    points = [_array_values(point) for point in box]
                    if len(points) < 4 or not all(len(point) >= 2 for point in points):
                        continue
                    xs = [_finite_number(point[0]) for point in points]
                    ys = [_finite_number(point[1]) for point in points]
                    left, top, right, bottom = min(xs), min(ys), max(xs), max(ys)
                normalized_bbox = _pdf_bbox(left, top, right, bottom, image_width, image_height)
            except (TypeError, ValueError, OverflowError):
                continue
            items.append({
                "text": " ".join(text.split()),
                "bbox": normalized_bbox,
            })
        pages[page_number] = {"width": PAGE_WIDTH, "height": PAGE_HEIGHT, "items": items}
    return pages


def _safe_case(manifest_path: Path, case_id: str) -> tuple[Path, list[Mapping[str, Any]]]:
    if case_id != "scan-pdf-image-only" or not manifest_path.is_file() or manifest_path.is_symlink():
        raise ValueError("invalid scan case")
    if manifest_path.stat().st_size > MAX_MANIFEST_BYTES:
        raise ValueError("invalid manifest")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    cases = manifest.get("cases") if isinstance(manifest, Mapping) else None
    if not isinstance(manifest, Mapping) or manifest.get("schemaVersion") != 2 or not isinstance(cases, list) or len(cases) != 16:
        raise ValueError("invalid evaluation corpus")
    item = next((value for value in cases if isinstance(value, Mapping) and value.get("id") == case_id), None)
    if item is None or item.get("filename") != "scan.pdf" or not isinstance(item.get("expectedLocators"), list):
        raise ValueError("invalid scan case")
    source_path = manifest_path.parent / "scan.pdf"
    if not source_path.is_file() or source_path.is_symlink() or source_path.stat().st_size > MAX_SOURCE_BYTES:
        raise ValueError("invalid scan source")
    if hashlib.sha256(source_path.read_bytes()).hexdigest() != item.get("sha256"):
        raise ValueError("scan source hash mismatch")
    return source_path, item["expectedLocators"]


def _candidate_peak_rss_bytes(own_peak_rss_bytes: int, cgroup_peak_text: str | None, require_container_peak: bool = False) -> int:
    own_peak = own_peak_rss_bytes if isinstance(own_peak_rss_bytes, int) and own_peak_rss_bytes >= 0 else 0
    normalized = cgroup_peak_text.strip() if isinstance(cgroup_peak_text, str) else ""
    container_peak = int(normalized) if normalized.isdigit() else None
    if container_peak is None and require_container_peak:
        raise ValueError("container peak RSS is unavailable")
    return max(own_peak, container_peak) if container_peak is not None else own_peak


def _peak_rss_bytes(require_container_peak: bool = False) -> int:
    import resource

    cgroup_peak_text = None
    for path in (Path("/sys/fs/cgroup/memory.peak"), Path("/sys/fs/cgroup/memory/memory.max_usage_in_bytes")):
        try:
            cgroup_peak_text = path.read_text(encoding="ascii")
            break
        except OSError:
            continue
    own_peak = max(0, int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024)
    return _candidate_peak_rss_bytes(own_peak, cgroup_peak_text, require_container_peak)


def _write_json(value: Mapping[str, Any]) -> None:
    encoded = json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    if len(encoded) > 65_536:
        raise ValueError("bounded output exceeded")
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _print_lock() -> None:
    from importlib.metadata import distributions
    import paddle

    package_freeze = LOCK_ROOT / "package-freeze.txt"
    model_manifest = LOCK_ROOT / "model-sha256.txt"
    if not package_freeze.is_file() or not model_manifest.is_file():
        raise ValueError("candidate lock is missing")
    gpu_prefixes = ("cuda-", "nvidia-", "paddlepaddle-gpu", "tensorrt")
    gpu_packages = [
        distribution.metadata["Name"].lower()
        for distribution in distributions()
        if distribution.metadata.get("Name", "").lower().startswith(gpu_prefixes)
    ]
    if paddle.is_compiled_with_cuda() or gpu_packages:
        raise ValueError("GPU dependency detected in CPU candidate")
    model_file_count = sum(1 for line in model_manifest.read_text(encoding="utf-8").splitlines() if line)
    _write_json({
        "schemaVersion": 1,
        "candidate": "paddleocr",
        "version": "3.7.0",
        "computePlatform": "cpu",
        "gpuPackageCount": 0,
        "packageFreezeSha256": _file_sha256(package_freeze),
        "modelManifestSha256": _file_sha256(model_manifest),
        "modelFileCount": model_file_count,
    })


def run() -> None:
    logging.disable(logging.CRITICAL)
    if sys.argv[1:] == ["--print-lock"]:
        _print_lock()
        return
    started_at = time.monotonic()
    try:
        if len(sys.argv) != 3:
            raise ValueError("expected manifest and case ID")
        source_path, locators = _safe_case(Path(sys.argv[1]).resolve(strict=True), sys.argv[2])
        from paddleocr import PaddleOCR

        pipeline = PaddleOCR(
            device="cpu",
            lang="ch",
            ocr_version="PP-OCRv5",
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="PP-OCRv5_mobile_rec",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
        outcome = evaluate_locators(_pages_from_results(list(pipeline.predict(str(source_path)))), locators)
        _write_json({
            **outcome,
            "elapsedMs": max(0, round((time.monotonic() - started_at) * 1000)),
            "peakRssBytes": _peak_rss_bytes(True),
        })
    except Exception:
        _write_json({
            "status": "failed",
            "locatorMatches": 0,
            "elapsedMs": max(0, round((time.monotonic() - started_at) * 1000)),
            "peakRssBytes": _peak_rss_bytes(),
            "errorCode": "parser_exit",
        })
        raise SystemExit(1)


if __name__ == "__main__":
    run()
