"""Fail-closed validation for the ScanSci legal-only boundary."""

from __future__ import annotations

from dataclasses import dataclass
import json
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
ALLOWED_SOURCES = frozenset({"Unpaywall", "Crossref", "Zhejiang University CARSI"})


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
    if source not in ALLOWED_SOURCES:
        raise PolicyError("source label is not allowlisted")
    return LegalSourceResult(True, route, source)


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
