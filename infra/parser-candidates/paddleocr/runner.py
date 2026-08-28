from __future__ import annotations

import hashlib
import json
import logging
import math
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
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("coordinate must be numeric")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("coordinate must be finite")
    return result


def _intersects(left: Sequence[float], right: Sequence[float]) -> bool:
    return min(left[2], right[2]) > max(left[0], right[0]) and min(left[3], right[3]) > max(left[1], right[1])


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


def _pages_from_results(results: Sequence[Any]) -> dict[int, dict[str, Any]]:
    pages: dict[int, dict[str, Any]] = {}
    for fallback_index, raw_result in enumerate(results):
        raw = _result_mapping(raw_result)
        payload = raw.get("res") if isinstance(raw.get("res"), Mapping) else raw
        page_index = payload.get("page_index", fallback_index)
        page_number = int(page_index) + 1
        texts = payload.get("rec_texts") or []
        boxes = payload.get("rec_boxes") or payload.get("rec_polys") or []
        input_image = raw.get("input_img")
        shape = getattr(input_image, "shape", None)
        image_height = _finite_number(shape[0]) if isinstance(shape, Sequence) and len(shape) >= 2 else PAGE_HEIGHT
        image_width = _finite_number(shape[1]) if isinstance(shape, Sequence) and len(shape) >= 2 else PAGE_WIDTH
        items = []
        for text, box in zip(texts, boxes):
            if not isinstance(text, str) or not text.strip() or not isinstance(box, Sequence):
                continue
            if len(box) == 4 and all(isinstance(value, (int, float)) for value in box):
                left, top, right, bottom = (_finite_number(value) for value in box)
            elif len(box) >= 4 and all(isinstance(point, Sequence) and len(point) >= 2 for point in box):
                xs = [_finite_number(point[0]) for point in box]
                ys = [_finite_number(point[1]) for point in box]
                left, top, right, bottom = min(xs), min(ys), max(xs), max(ys)
            else:
                continue
            items.append({
                "text": " ".join(text.split()),
                "bbox": (
                    left * PAGE_WIDTH / image_width,
                    top * PAGE_HEIGHT / image_height,
                    right * PAGE_WIDTH / image_width,
                    bottom * PAGE_HEIGHT / image_height,
                ),
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


def _peak_rss_bytes() -> int:
    import resource

    return max(0, int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024)


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
            "peakRssBytes": _peak_rss_bytes(),
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
