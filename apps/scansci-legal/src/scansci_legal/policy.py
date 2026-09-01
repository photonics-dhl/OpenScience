"""Fail-closed validation for the ScanSci legal-only boundary."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import re
from typing import Any


MAX_REQUEST_BYTES = 4 * 1024
DOI_OR_ARXIV = re.compile(
    r"^(?:10\.\d{4,9}/[-._;()/:a-z0-9]+|(?:arxiv:)?\d{4}\.\d{4,5}(?:v\d+)?)$",
    re.IGNORECASE,
)
SUBJECT_ID = re.compile(r"^[0-9a-f]{64}$", re.IGNORECASE)
REQUEST_KEYS = frozenset({"identifier", "strategy", "scihub", "tor", "institutional", "subject_id"})
RESULT_KEYS = frozenset({"success", "route", "source"})
ALLOWED_ROUTES = frozenset({"open_access", "publisher_api", "institutional"})
SOURCE_ROUTES = {
    "oa_url": "open_access", "DOAJ": "open_access", "Unpaywall": "open_access",
    "EuropePMC": "open_access", "CORE": "open_access", "PMC": "open_access", "arXiv": "open_access",
    "CrossrefPage": "publisher_api", "elsevier_api": "publisher_api",
    "CARSI": "institutional", "CARSI-Browser": "institutional", "InstSci": "institutional",
}
INSTITUTIONAL_PREFIX = "institutional:"
SOURCE_LOCK = {
    "name": "scansci-pdf", "version": "1.11.0", "commit": "7017814758f826ea21470a609890a7d3ca374b8e",
    "archiveUrl": "https://github.com/Rimagination/scansci-pdf/archive/7017814758f826ea21470a609890a7d3ca374b8e.tar.gz",
    "archiveSha256": "db537914b9c149f2ef6ba148f47e316fddcfe350e4afe8f9fa88a2a1af9208b9",
    "strategy": "legal_only", "scihub": False, "tor": False,
    "install": "python -m pip install --require-hashes -r build-requirements.lock && python -m pip install --require-hashes --no-build-isolation -r requirements.lock",
}
INSTALL_COMMAND = SOURCE_LOCK["install"]
BUILD_REQUIREMENTS = ("setuptools==80.9.0", "pycryptodome==3.23.0")


class PolicyError(ValueError):
    """Raised whenever untrusted input falls outside the legal-only contract."""


@dataclass(frozen=True)
class LegalDownloadRequest:
    identifier: str
    strategy: str
    scihub: bool
    tor: bool
    institutional: bool
    subject_id: str


@dataclass(frozen=True)
class LegalSourceResult:
    success: bool
    route: str
    source: str


@dataclass(frozen=True)
class SourceLock:
    commit: str
    archive_sha256: str
    install_command: str


def validate_request(payload: object) -> LegalDownloadRequest:
    request = _strict_object(payload, REQUEST_KEYS, "request")
    _assert_canonical_json_bound(request)

    identifier = _required_string(request, "identifier")
    if len(identifier) > 300 or not DOI_OR_ARXIV.fullmatch(identifier):
        raise PolicyError("identifier must be a DOI or arXiv identifier")
    if request.get("strategy") != "legal_only":
        raise PolicyError("strategy must be legal_only")
    if request.get("scihub") is not False or request.get("tor") is not False:
        raise PolicyError("grey routes are forbidden")
    if request.get("institutional") is not True:
        raise PolicyError("institutional access is required")

    subject_id = _required_string(request, "subject_id")
    if not SUBJECT_ID.fullmatch(subject_id):
        raise PolicyError("subject_id must be 64 hexadecimal characters")

    return LegalDownloadRequest(identifier, "legal_only", False, False, True, subject_id.lower())


def validate_source_result(result: dict[str, Any]) -> LegalSourceResult:
    source_result = _strict_object(result, RESULT_KEYS, "source result")
    if source_result.get("success") is not True:
        raise PolicyError("source result must be successful")
    route = _required_string(source_result, "route")
    source = _required_string(source_result, "source")
    if route not in ALLOWED_ROUTES:
        raise PolicyError("source route is not allowlisted")
    if _source_route(source) != route:
        raise PolicyError("source label and route are not an allowlisted pair")
    return LegalSourceResult(True, route, source)


def load_source_lock(root: Path | None = None) -> SourceLock:
    app_root = root or Path(__file__).resolve().parents[2]
    try:
        metadata = json.loads((app_root / "upstream.lock.json").read_text(encoding="utf-8"))
        package = json.loads((app_root / "package.json").read_text(encoding="utf-8"))
        requirements_in = (app_root / "requirements.in").read_text(encoding="utf-8")
        build_requirements = (app_root / "build-requirements.in").read_text(encoding="utf-8")
        build_lock = (app_root / "build-requirements.lock").read_text(encoding="utf-8")
        requirements_lock = (app_root / "requirements.lock").read_text(encoding="utf-8")
    except (OSError, json.JSONDecodeError) as error:
        raise PolicyError("source lock cannot be read") from error
    if metadata != SOURCE_LOCK:
        raise PolicyError("source lock metadata drifted")
    if package.get("scripts", {}).get("install:locked") != INSTALL_COMMAND:
        raise PolicyError("locked install contract drifted")
    required_lines = (f"scansci-pdf @ {SOURCE_LOCK['archiveUrl']}#sha256={SOURCE_LOCK['archiveSha256']}",)
    if set(line.strip() for line in requirements_in.splitlines() if line.strip()) != set(required_lines) or set(line.strip() for line in build_requirements.splitlines() if line.strip()) != set(BUILD_REQUIREMENTS):
        raise PolicyError("source build requirements drifted")
    for requirement in BUILD_REQUIREMENTS:
        if requirement not in build_lock or "--hash=sha256:" not in build_lock: raise PolicyError("source build lock drifted")
    for requirement in required_lines:
        name = requirement.split(" @ ", 1)[0].split("==", 1)[0]
        locked_name = f"{name} @" if " @ " in requirement else f"{name}=="
        if requirement not in requirements_lock or locked_name not in requirements_lock or "--hash=sha256:" not in requirements_lock:
            raise PolicyError("source dependency lock drifted")
    return SourceLock(SOURCE_LOCK["commit"], SOURCE_LOCK["archiveSha256"], INSTALL_COMMAND)


def _strict_object(value: object, expected_keys: frozenset[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != expected_keys:
        raise PolicyError(f"{label} has invalid keys")
    return value


def _assert_canonical_json_bound(value: dict[str, Any]) -> None:
    try:
        encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise PolicyError("request must be JSON serializable") from error
    if len(encoded) > MAX_REQUEST_BYTES:
        raise PolicyError("request exceeds the 4 KiB JSON limit")


def _required_string(value: dict[str, Any], key: str) -> str:
    candidate = value.get(key)
    if not isinstance(candidate, str) or not candidate:
        raise PolicyError(f"{key} must be a non-empty string")
    return candidate


def _source_route(source: str) -> str:
    if source.startswith(INSTITUTIONAL_PREFIX) and len(source) > len(INSTITUTIONAL_PREFIX):
        return "institutional"
    try:
        return SOURCE_ROUTES[source]
    except KeyError as error:
        raise PolicyError("source label is not allowlisted") from error
