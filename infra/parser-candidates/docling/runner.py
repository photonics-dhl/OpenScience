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
MAX_LOCATORS = 64
MODELS_ROOT = Path("/opt/docling-models")
LOCK_ROOT = Path("/opt/docling-lock")


def _field(value: Any, name: str) -> Any:
    if isinstance(value, Mapping):
        return value.get(name)
    return getattr(value, name, None)


def _finite_number(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be numeric")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{name} must be finite")
    return result


def bbox_to_top_left(value: Any, page_height: Any) -> tuple[float, float, float, float]:
    height = _finite_number(page_height, "page height")
    if height <= 0:
        raise ValueError("page height must be positive")
    left = _finite_number(_field(value, "l"), "bbox left")
    top = _finite_number(_field(value, "t"), "bbox top")
    right = _finite_number(_field(value, "r"), "bbox right")
    bottom = _finite_number(_field(value, "b"), "bbox bottom")
    origin = _field(value, "coord_origin")
    origin = getattr(origin, "value", origin)
    origin = str(origin).upper()

    x1, x2 = sorted((left, right))
    if origin.endswith("BOTTOMLEFT"):
        y1, y2 = sorted((height - top, height - bottom))
    elif origin.endswith("TOPLEFT"):
        y1, y2 = sorted((top, bottom))
    else:
        raise ValueError("unsupported bbox coordinate origin")
    if x1 < 0 or y1 < 0 or x2 > 1_000_000 or y2 > height + 1:
        raise ValueError("bbox is outside bounded page geometry")
    return (x1, max(0.0, y1), x2, min(height, y2))


def _normalized_text(value: Any) -> str:
    return " ".join(str(value or "").split())


def _intersects(left: Sequence[float], right: Sequence[float]) -> bool:
    return min(left[2], right[2]) > max(left[0], right[0]) and min(left[3], right[3]) > max(left[1], right[1])


def _page_text(page: Mapping[str, Any], region: Sequence[float] | None = None) -> str:
    texts: list[str] = []
    for item in page.get("items", []):
        if not isinstance(item, Mapping):
            continue
        text = _normalized_text(item.get("text"))
        if not text:
            continue
        bbox = item.get("bbox")
        if region is not None and (not isinstance(bbox, Sequence) or len(bbox) != 4 or not _intersects(bbox, region)):
            continue
        texts.append(text)
    return _normalized_text(" ".join(texts))


def _valid_region(value: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)) or len(value) != 4:
        return None
    try:
        region = tuple(_finite_number(item, "region coordinate") for item in value)
    except ValueError:
        return None
    if region[0] < 0 or region[1] < 0 or region[2] <= region[0] or region[3] <= region[1]:
        return None
    return region


def evaluate_locators(pages: Mapping[int, Mapping[str, Any]], locators: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    matches = 0
    for locator in locators:
        kind = locator.get("kind") if isinstance(locator, Mapping) else None
        page_number = locator.get("page") if isinstance(locator, Mapping) else None
        page = pages.get(page_number) if isinstance(page_number, int) and not isinstance(page_number, bool) else None
        matched = False
        if page is not None and kind == "page-text":
            quote = _normalized_text(locator.get("quote"))
            matched = bool(quote) and quote in _page_text(page)
        elif page is not None and kind == "page-text-order":
            quotes = locator.get("quotes")
            if isinstance(quotes, Sequence) and not isinstance(quotes, (str, bytes)) and quotes:
                text = _page_text(page)
                cursor = 0
                matched = True
                for raw_quote in quotes:
                    quote = _normalized_text(raw_quote)
                    index = text.find(quote, cursor) if quote else -1
                    if index < 0:
                        matched = False
                        break
                    cursor = index + len(quote)
        elif page is not None and kind == "page-region-text":
            region = _valid_region(locator.get("bbox"))
            quote = _normalized_text(locator.get("quote"))
            matched = region is not None and bool(quote) and quote in _page_text(page, region)
        elif page is not None and kind == "page-region":
            region = _valid_region(locator.get("bbox"))
            if region is not None:
                matched = any(
                    isinstance(item, Mapping)
                    and isinstance(item.get("bbox"), Sequence)
                    and len(item["bbox"]) == 4
                    and _intersects(item["bbox"], region)
                    for item in page.get("items", [])
                )
        if matched:
            matches += 1

    if matches == len(locators):
        return {"status": "succeeded", "locatorMatches": matches}
    return {"status": "needs_review", "locatorMatches": matches, "errorCode": "locator_miss"}


def _page_size(page: Any) -> tuple[float, float]:
    size = _field(page, "size")
    width = _finite_number(_field(size, "width"), "page width")
    height = _finite_number(_field(size, "height"), "page height")
    if width <= 0 or height <= 0 or width > 1_000_000 or height > 1_000_000:
        raise ValueError("invalid page geometry")
    return width, height


def _document_pages(document: Any) -> dict[int, dict[str, Any]]:
    pages: dict[int, dict[str, Any]] = {}
    raw_pages = _field(document, "pages")
    if not isinstance(raw_pages, Mapping):
        raise ValueError("Docling document has no page map")
    for raw_number, raw_page in raw_pages.items():
        page_number = int(raw_number)
        width, height = _page_size(raw_page)
        pages[page_number] = {"width": width, "height": height, "items": []}

    def append_item(page_number: int, text: Any, bbox: Any) -> None:
        page = pages.get(page_number)
        normalized = _normalized_text(text)
        if page is None or not normalized:
            return
        normalized_bbox = None if bbox is None else bbox_to_top_left(bbox, page["height"])
        page["items"].append({"text": normalized, "bbox": normalized_bbox})

    for item, _level in document.iterate_items(with_groups=False):
        text = _field(item, "text") or _field(item, "orig")
        provenance = _field(item, "prov") or []
        for prov in provenance:
            append_item(int(_field(prov, "page_no")), text, _field(prov, "bbox"))

        data = _field(item, "data")
        table_cells = _field(data, "table_cells") or []
        if table_cells and provenance:
            page_number = int(_field(provenance[0], "page_no"))
            for cell in table_cells:
                append_item(page_number, _field(cell, "text"), _field(cell, "bbox"))
    return pages


def _safe_manifest_case(manifest_path: Path, case_id: str) -> tuple[Path, list[Mapping[str, Any]]]:
    if not manifest_path.is_file() or manifest_path.is_symlink() or manifest_path.stat().st_size > MAX_MANIFEST_BYTES:
        raise ValueError("invalid manifest")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, Mapping) or not {"schemaVersion", "locatorContract", "cases"}.issubset(manifest):
        raise ValueError("invalid manifest schema")
    cases = manifest.get("cases")
    if manifest.get("schemaVersion") != 2 or not isinstance(cases, list) or len(cases) != 16:
        raise ValueError("invalid evaluation corpus")
    item = next((entry for entry in cases if isinstance(entry, Mapping) and entry.get("id") == case_id), None)
    if item is None:
        raise ValueError("unknown corpus case")
    filename = item.get("filename")
    expected_hash = item.get("sha256")
    locators = item.get("expectedLocators")
    if (
        not isinstance(filename, str)
        or Path(filename).name != filename
        or not isinstance(expected_hash, str)
        or len(expected_hash) != 64
        or not isinstance(locators, list)
        or len(locators) > MAX_LOCATORS
    ):
        raise ValueError("invalid corpus case")
    source_path = manifest_path.parent / filename
    if source_path.suffix.lower() != ".pdf" or not source_path.is_file() or source_path.is_symlink():
        raise ValueError("unsupported source")
    source_size = source_path.stat().st_size
    if source_size <= 0 or source_size > MAX_SOURCE_BYTES:
        raise ValueError("invalid source")
    digest = hashlib.sha256(source_path.read_bytes()).hexdigest()
    if digest != expected_hash:
        raise ValueError("source hash mismatch")
    return source_path, locators


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
    package_freeze = LOCK_ROOT / "package-freeze.txt"
    model_manifest = LOCK_ROOT / "model-sha256.txt"
    if not package_freeze.is_file() or not model_manifest.is_file():
        raise ValueError("candidate lock is missing")
    model_file_count = sum(1 for line in model_manifest.read_text(encoding="utf-8").splitlines() if line)
    _write_json({
        "schemaVersion": 1,
        "candidate": "docling",
        "version": "2.123.0",
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
        manifest_path = Path(sys.argv[1]).resolve(strict=True)
        source_path, locators = _safe_manifest_case(manifest_path, sys.argv[2])

        from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption

        options = PdfPipelineOptions(
            artifacts_path=MODELS_ROOT,
            do_ocr=False,
            do_table_structure=True,
            enable_remote_services=False,
            allow_external_plugins=False,
            accelerator_options=AcceleratorOptions(device=AcceleratorDevice.CPU, num_threads=2),
            generate_page_images=False,
            generate_picture_images=False,
            generate_table_images=False,
        )
        converter = DocumentConverter(
            allowed_formats=[InputFormat.PDF],
            format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)},
        )
        result = converter.convert(source_path)
        conversion_status = str(getattr(getattr(result, "status", None), "value", getattr(result, "status", ""))).lower()
        if "failure" in conversion_status:
            raise ValueError("Docling conversion failed")
        outcome = evaluate_locators(_document_pages(result.document), locators)
        _write_json({
            **outcome,
            "elapsedMs": max(0, round((time.monotonic() - started_at) * 1000)),
            "peakRssBytes": _peak_rss_bytes(),
        })
    except Exception:
        try:
            _write_json({
                "status": "failed",
                "locatorMatches": 0,
                "elapsedMs": max(0, round((time.monotonic() - started_at) * 1000)),
                "peakRssBytes": _peak_rss_bytes(),
                "errorCode": "parser_exit",
            })
        finally:
            raise SystemExit(1)


if __name__ == "__main__":
    run()
