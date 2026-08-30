"""Legal-only ScanSci acquisition boundary."""

from .policy import LegalDownloadRequest, LegalSourceResult, PolicyError, SourceLock, load_source_lock, validate_request, validate_source_result

__all__ = [
    "LegalDownloadRequest",
    "LegalSourceResult",
    "PolicyError",
    "SourceLock",
    "load_source_lock",
    "validate_request",
    "validate_source_result",
]
