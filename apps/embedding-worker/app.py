from __future__ import annotations

import base64
from collections.abc import Callable, Mapping, Sequence
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import struct
import sys
import threading
from typing import Any


MODEL_REVISION = "5617a9f61b028005a4858fdac845db406aefb181"
MODEL_ROOT = Path("/models/bge-m3")
LOCK_ROOT = Path("/opt/bge-m3-lock")
DIMENSION = 1024
MAX_BATCH_SIZE = 16
MAX_TEXT_CHARACTERS = 20_000
MAX_REQUEST_BYTES = 256 * 1024
MAX_QUERY_TOKENS = 512
MAX_CHUNK_TOKENS = 1024
MAX_CONNECTIONS = 4
SOCKET_TIMEOUT_SECONDS = 10
HASH_FIELDS = {"sourceSha256", "packageFreezeSha256", "modelManifestSha256"}


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_sha256() -> str:
    digest = hashlib.sha256()
    sources = (
        ("app.py", Path(__file__)),
        ("model-init.py", Path(__file__).with_name("model-init.py")),
        ("requirements.lock", LOCK_ROOT / "requirements.lock"),
    )
    for label, path in sources:
        payload = path.read_bytes()
        digest.update(label.encode("ascii"))
        digest.update(b"\0")
        digest.update(len(payload).to_bytes(8, "big"))
        digest.update(payload)
    return digest.hexdigest()


def load_runtime_identity(trusted_manifest: bytes) -> dict[str, str]:
    calculated_source = source_sha256()
    locked_source = (LOCK_ROOT / "source-sha256.txt").read_text(encoding="ascii").strip()
    if len(locked_source) != 64 or not hmac.compare_digest(calculated_source, locked_source):
        raise ValueError("runtime_identity_invalid")
    return {
        "sourceSha256": calculated_source,
        "packageFreezeSha256": _file_sha256(LOCK_ROOT / "package-freeze.txt"),
        "modelManifestSha256": hashlib.sha256(trusted_manifest).hexdigest(),
    }


def validate_request(value: Any, token_counter: Callable[[list[str]], list[int]]) -> tuple[str, list[str], list[int]]:
    if not isinstance(value, Mapping) or set(value) != {"schemaVersion", "purpose", "texts"}:
        raise ValueError("request_invalid")
    purpose = value.get("purpose")
    texts = value.get("texts")
    if type(value.get("schemaVersion")) is not int or value.get("schemaVersion") != 1 or purpose not in {"query", "chunk"}:
        raise ValueError("request_invalid")
    if not isinstance(texts, list) or not 1 <= len(texts) <= MAX_BATCH_SIZE:
        raise ValueError("batch_invalid")
    if any(not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT_CHARACTERS for text in texts):
        raise ValueError("text_limit_exceeded")
    counts = token_counter(texts)
    if (
        not isinstance(counts, list)
        or len(counts) != len(texts)
        or any(not isinstance(count, int) or isinstance(count, bool) or count < 1 for count in counts)
    ):
        raise ValueError("tokenization_invalid")
    limit = MAX_QUERY_TOKENS if purpose == "query" else MAX_CHUNK_TOKENS
    if any(count > limit for count in counts):
        raise ValueError("token_limit_exceeded")
    return purpose, texts, counts


def encode_vectors(vectors: Any) -> list[str]:
    if not isinstance(vectors, Sequence) or isinstance(vectors, (str, bytes)) or not vectors:
        raise ValueError("vector_invalid")
    result: list[str] = []
    for raw_vector in vectors:
        if not isinstance(raw_vector, Sequence) or isinstance(raw_vector, (str, bytes)) or len(raw_vector) != DIMENSION:
            raise ValueError("vector_invalid")
        vector: list[float] = []
        squared_norm = 0.0
        for raw_value in raw_vector:
            if isinstance(raw_value, bool) or not isinstance(raw_value, (int, float)):
                raise ValueError("vector_invalid")
            value = float(raw_value)
            if not math.isfinite(value):
                raise ValueError("vector_invalid")
            vector.append(value)
            squared_norm += value * value
        if not math.isfinite(squared_norm) or abs(math.sqrt(squared_norm) - 1.0) > 1e-4:
            raise ValueError("vector_invalid")
        result.append(base64.b64encode(struct.pack(f"<{DIMENSION}f", *vector)).decode("ascii"))
    return result


def _decode_body(body: bytes) -> Any:
    if len(body) > MAX_REQUEST_BYTES:
        raise ValueError("request_too_large")
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError("request_invalid") from error


class EmbeddingApplication:
    def __init__(self, model: Any, model_revision: str, runtime_identity: Mapping[str, str]) -> None:
        if model_revision != MODEL_REVISION:
            raise ValueError("model_revision_invalid")
        if (
            not isinstance(runtime_identity, Mapping)
            or set(runtime_identity) != HASH_FIELDS
            or any(
                not isinstance(value, str)
                or len(value) != 64
                or any(character not in "0123456789abcdef" for character in value)
                for value in runtime_identity.values()
            )
        ):
            raise ValueError("runtime_identity_invalid")
        self.model = model
        self.model_revision = model_revision
        self.runtime_identity = dict(runtime_identity)
        self.inference_slot = threading.BoundedSemaphore(value=1)

    def handle(self, method: str, path: str, body: bytes) -> tuple[int, dict[str, Any]]:
        if method == "GET" and path == "/health":
            return 200, {
                "schemaVersion": 1,
                "status": "ready",
                "modelRevision": self.model_revision,
                **self.runtime_identity,
                "dimension": DIMENSION,
                "computePlatform": "cpu",
            }
        if method != "POST" or path not in {"/v1/tokenize", "/v1/embeddings"}:
            return 404, {"schemaVersion": 1, "error": "not_found"}
        if not self.inference_slot.acquire(blocking=False):
            return 503, {"schemaVersion": 1, "error": "worker_busy"}
        try:
            return self._handle_model_request(path, body)
        finally:
            self.inference_slot.release()

    def _handle_model_request(self, path: str, body: bytes) -> tuple[int, dict[str, Any]]:
        purpose, texts, token_counts = validate_request(_decode_body(body), self.model.token_counts)
        if path == "/v1/tokenize":
            return 200, {"schemaVersion": 1, "tokenCounts": token_counts}

        encode = self.model.encode_queries if purpose == "query" else self.model.encode_corpus
        raw_result = encode(
            texts,
            batch_size=min(len(texts), MAX_BATCH_SIZE),
            max_length=MAX_QUERY_TOKENS if purpose == "query" else MAX_CHUNK_TOKENS,
            return_dense=True,
            return_sparse=False,
            return_colbert_vecs=False,
        )
        vectors = raw_result.get("dense_vecs") if isinstance(raw_result, Mapping) else None
        if hasattr(vectors, "tolist"):
            vectors = vectors.tolist()
        if not isinstance(vectors, Sequence) or len(vectors) != len(texts):
            raise ValueError("vector_invalid")
        return 200, {
            "schemaVersion": 1,
            "modelRevision": self.model_revision,
            **self.runtime_identity,
            "dimension": DIMENSION,
            "encoding": "base64-f32le",
            "vectors": encode_vectors(vectors),
        }


class BgeM3Model:
    def __init__(self, model: Any) -> None:
        self.model = model

    def token_counts(self, texts: list[str]) -> list[int]:
        tokenized = self.model.tokenizer(texts, add_special_tokens=True, truncation=False)
        input_ids = tokenized.get("input_ids") if isinstance(tokenized, Mapping) else None
        if not isinstance(input_ids, list) or len(input_ids) != len(texts):
            raise ValueError("tokenization_invalid")
        return [len(item) if isinstance(item, list) else 0 for item in input_ids]

    def encode_queries(self, texts: list[str], **kwargs: Any) -> Any:
        return self.model.encode_queries(texts, **kwargs)

    def encode_corpus(self, texts: list[str], **kwargs: Any) -> Any:
        return self.model.encode_corpus(texts, **kwargs)


class RequestHandler(BaseHTTPRequestHandler):
    application: EmbeddingApplication
    server_version = "OpenScienceEmbedding/1"
    sys_version = ""

    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def _respond(self, status: int, value: Mapping[str, Any]) -> None:
        payload = json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode("ascii")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        self._dispatch(b"")

    def do_POST(self) -> None:
        try:
            content_length = int(self.headers.get("content-length", "-1"))
        except ValueError:
            content_length = -1
        if content_length < 0 or content_length > MAX_REQUEST_BYTES:
            self._respond(413, {"schemaVersion": 1, "error": "request_too_large"})
            return
        try:
            body = self.rfile.read(content_length)
        except (TimeoutError, OSError):
            self.close_connection = True
            return
        if len(body) != content_length:
            self.close_connection = True
            return
        self._dispatch(body)

    def _dispatch(self, body: bytes) -> None:
        try:
            status, response = self.application.handle(self.command, self.path, body)
        except ValueError as error:
            safe_codes = {
                "request_invalid", "request_too_large", "batch_invalid", "text_limit_exceeded",
                "token_limit_exceeded", "tokenization_invalid", "vector_invalid",
            }
            code = str(error) if str(error) in safe_codes else "worker_unavailable"
            self._respond(422 if code != "worker_unavailable" else 503, {"schemaVersion": 1, "error": code})
            return
        except Exception:
            self._respond(503, {"schemaVersion": 1, "error": "worker_unavailable"})
            return
        self._respond(status, response)


class BoundedThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = MAX_CONNECTIONS * 2

    def __init__(self, server_address: tuple[str, int], handler: type[BaseHTTPRequestHandler]) -> None:
        self.connection_slots = threading.BoundedSemaphore(value=MAX_CONNECTIONS)
        super().__init__(server_address, handler)

    def get_request(self):
        request, client_address = super().get_request()
        request.settimeout(SOCKET_TIMEOUT_SECONDS)
        return request, client_address

    def process_request(self, request, client_address) -> None:
        if not self.connection_slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.connection_slots.release()
            raise

    def process_request_thread(self, request, client_address) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.connection_slots.release()


def load_application() -> EmbeddingApplication:
    from importlib.util import module_from_spec, spec_from_file_location

    spec = spec_from_file_location("embedding_model_init", Path(__file__).with_name("model-init.py"))
    if spec is None or spec.loader is None:
        raise RuntimeError("model_validation_unavailable")
    model_init = module_from_spec(spec)
    spec.loader.exec_module(model_init)
    trusted_manifest = (Path("/opt/bge-m3-seed") / model_init.MANIFEST_NAME).read_bytes()
    model_init.validate_model(MODEL_ROOT, trusted_manifest)
    runtime_identity = load_runtime_identity(trusted_manifest)

    from FlagEmbedding import FlagAutoModel

    model = FlagAutoModel.from_finetuned(str(MODEL_ROOT), devices="cpu", use_fp16=False)
    return EmbeddingApplication(BgeM3Model(model), MODEL_REVISION, runtime_identity)


def main() -> None:
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    RequestHandler.application = load_application()
    server = BoundedThreadingHTTPServer(("0.0.0.0", 8080), RequestHandler)
    server.serve_forever()


if __name__ == "__main__":
    if sys.argv[1:] == ["--print-source-sha256"]:
        print(source_sha256())
    elif sys.argv[1:]:
        raise SystemExit(2)
    else:
        main()
