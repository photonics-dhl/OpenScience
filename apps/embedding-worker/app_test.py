from __future__ import annotations

import base64
import importlib.util
import json
import math
from pathlib import Path
import struct
import tempfile
import threading
import unittest


ROOT = Path(__file__).resolve().parent
RUNTIME_IDENTITY = {
    "sourceSha256": "1" * 64,
    "packageFreezeSha256": "2" * 64,
    "modelManifestSha256": "3" * 64,
}


def load_module(filename: str, name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    if spec is None or spec.loader is None:
        raise AssertionError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeModel:
    def __init__(self) -> None:
        self.calls: list[tuple[str, list[str]]] = []

    def token_counts(self, texts: list[str]) -> list[int]:
        return [len(text.split()) for text in texts]

    def encode_queries(self, texts: list[str], **_kwargs):
        self.calls.append(("query", texts))
        return {"dense_vecs": [[1.0] + [0.0] * 1023 for _ in texts]}

    def encode_corpus(self, texts: list[str], **_kwargs):
        self.calls.append(("chunk", texts))
        return {"dense_vecs": [[0.0, 1.0] + [0.0] * 1022 for _ in texts]}


class EmbeddingWorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.app = load_module("app.py", "embedding_worker_app")

    def test_rejects_unknown_fields_batch_and_token_limits_without_reflection(self) -> None:
        with self.assertRaisesRegex(ValueError, "request_invalid"):
            self.app.validate_request({"schemaVersion": 1, "purpose": "query", "texts": ["secret"], "extra": 1}, lambda _texts: [1])
        with self.assertRaisesRegex(ValueError, "batch_invalid"):
            self.app.validate_request({"schemaVersion": 1, "purpose": "query", "texts": ["x"] * 17}, lambda _texts: [1] * 17)
        with self.assertRaisesRegex(ValueError, "token_limit_exceeded") as error:
            self.app.validate_request({"schemaVersion": 1, "purpose": "query", "texts": ["secret"]}, lambda _texts: [513])
        self.assertNotIn("secret", str(error.exception))
        with self.assertRaisesRegex(ValueError, "request_invalid"):
            self.app.validate_request({"schemaVersion": True, "purpose": "query", "texts": ["secret"]}, lambda _texts: [1])

    def test_embeddings_endpoint_is_dense_normalized_and_purpose_specific(self) -> None:
        model = FakeModel()
        application = self.app.EmbeddingApplication(
            model=model, model_revision=self.app.MODEL_REVISION, runtime_identity=RUNTIME_IDENTITY,
        )

        status, response = application.handle("POST", "/v1/embeddings", json.dumps({
            "schemaVersion": 1,
            "purpose": "query",
            "texts": ["bounded query"],
        }).encode("utf-8"))

        self.assertEqual(status, 200)
        self.assertEqual(set(response), {
            "schemaVersion", "modelRevision", "sourceSha256", "packageFreezeSha256",
            "modelManifestSha256", "dimension", "encoding", "vectors",
        })
        self.assertRegex(response["sourceSha256"], r"^[0-9a-f]{64}$")
        self.assertRegex(response["packageFreezeSha256"], r"^[0-9a-f]{64}$")
        self.assertRegex(response["modelManifestSha256"], r"^[0-9a-f]{64}$")
        self.assertEqual(response["dimension"], 1024)
        raw = base64.b64decode(response["vectors"][0], validate=True)
        vector = struct.unpack("<1024f", raw)
        self.assertTrue(all(math.isfinite(value) for value in vector))
        self.assertAlmostEqual(math.sqrt(sum(value * value for value in vector)), 1.0, places=6)
        self.assertEqual(model.calls, [("query", ["bounded query"])])

    def test_health_and_tokenize_contracts_are_strict(self) -> None:
        application = self.app.EmbeddingApplication(
            model=FakeModel(), model_revision=self.app.MODEL_REVISION, runtime_identity=RUNTIME_IDENTITY,
        )
        health_status, health = application.handle("GET", "/health", b"")
        token_status, tokens = application.handle("POST", "/v1/tokenize", json.dumps({
            "schemaVersion": 1,
            "purpose": "chunk",
            "texts": ["two tokens"],
        }).encode("utf-8"))
        self.assertEqual((health_status, health), (200, {
            "schemaVersion": 1,
            "status": "ready",
            "modelRevision": self.app.MODEL_REVISION,
            **RUNTIME_IDENTITY,
            "dimension": 1024,
            "computePlatform": "cpu",
        }))
        self.assertEqual((token_status, tokens), (200, {"schemaVersion": 1, "tokenCounts": [2]}))

    def test_vector_validation_rejects_nonfinite_wrong_dimension_and_denormalized(self) -> None:
        for vector in ([1.0], [float("nan")] + [0.0] * 1023, [2.0] + [0.0] * 1023):
            with self.subTest(length=len(vector)):
                with self.assertRaisesRegex(ValueError, "vector_invalid"):
                    self.app.encode_vectors([vector])

    def test_runtime_identity_is_derived_and_source_locked(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            original_lock_root = self.app.LOCK_ROOT
            try:
                lock_root = Path(temporary)
                self.app.LOCK_ROOT = lock_root
                (lock_root / "requirements.lock").write_text("bounded==1\n", encoding="ascii")
                (lock_root / "package-freeze.txt").write_text("bounded==1\n", encoding="ascii")
                source_hash = self.app.source_sha256()
                (lock_root / "source-sha256.txt").write_text(source_hash + "\n", encoding="ascii")
                identity = self.app.load_runtime_identity(b"trusted-model-manifest")
                self.assertEqual(identity["sourceSha256"], source_hash)
                self.assertRegex(identity["packageFreezeSha256"], r"^[0-9a-f]{64}$")
                self.assertRegex(identity["modelManifestSha256"], r"^[0-9a-f]{64}$")
                (lock_root / "source-sha256.txt").write_text("0" * 64, encoding="ascii")
                with self.assertRaisesRegex(ValueError, "runtime_identity_invalid"):
                    self.app.load_runtime_identity(b"trusted-model-manifest")
            finally:
                self.app.LOCK_ROOT = original_lock_root

    def test_allows_only_one_model_operation_at_a_time(self) -> None:
        entered = threading.Event()
        release = threading.Event()

        class BlockingModel(FakeModel):
            def token_counts(self, texts: list[str]) -> list[int]:
                entered.set()
                release.wait(timeout=2)
                return super().token_counts(texts)

        application = self.app.EmbeddingApplication(
            model=BlockingModel(), model_revision=self.app.MODEL_REVISION, runtime_identity=RUNTIME_IDENTITY,
        )
        body = json.dumps({"schemaVersion": 1, "purpose": "query", "texts": ["bounded"]}).encode("utf-8")
        first_result: list[tuple[int, dict]] = []
        first = threading.Thread(target=lambda: first_result.append(application.handle("POST", "/v1/tokenize", body)))
        first.start()
        self.assertTrue(entered.wait(timeout=1))
        self.assertEqual(application.handle("POST", "/v1/tokenize", body), (503, {
            "schemaVersion": 1,
            "error": "worker_busy",
        }))
        release.set()
        first.join(timeout=2)
        self.assertFalse(first.is_alive())
        self.assertEqual(first_result, [(200, {"schemaVersion": 1, "tokenCounts": [1]})])


class ModelInitializationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.model_init = load_module("model-init.py", "embedding_model_init")

    def test_initializes_empty_volume_and_rejects_existing_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            seed = root / "seed"
            target = root / "target"
            seed.mkdir()
            target.mkdir()
            (seed / "weights.bin").write_bytes(b"bounded-model")
            self.model_init.write_manifest(seed, self.model_init.MODEL_REVISION)

            self.model_init.initialize_model(seed, target)
            self.assertEqual((target / "weights.bin").read_bytes(), b"bounded-model")
            self.model_init.initialize_model(seed, target)
            (target / "weights.bin").write_bytes(b"mismatch")
            with self.assertRaisesRegex(ValueError, "model_volume_mismatch"):
                self.model_init.initialize_model(seed, target)
            self.assertEqual((target / "weights.bin").read_bytes(), b"mismatch")

            alternate = root / "alternate"
            alternate.mkdir()
            (alternate / "weights.bin").write_bytes(b"alternate-model")
            self.model_init.write_manifest(alternate, self.model_init.MODEL_REVISION)
            with self.assertRaisesRegex(ValueError, "model_volume_mismatch"):
                self.model_init.initialize_model(seed, alternate)
            self.assertEqual((alternate / "weights.bin").read_bytes(), b"alternate-model")

    def test_docker_build_inputs_are_pinned_and_consumed(self) -> None:
        dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
        self.assertRegex(dockerfile.splitlines()[0], r"^FROM python:3\.12-slim@sha256:[0-9a-f]{64}$")
        self.assertNotRegex(dockerfile, r"(?m)^ADD --checksum=")
        self.assertIn("35e33a08e8ed5e299eabbe3bc23518eb66a424dd29ee08fb3802bf9aef9e9bf2  /tmp/flagembedding-1.4.2-py3-none-any.whl", dockerfile)
        self.assertIn("sha256sum --check", dockerfile)
        self.assertIn("--requirement /tmp/requirements.lock", dockerfile)
        self.assertIn("--print-source-sha256", dockerfile)
        self.assertLess(dockerfile.index("snapshot_download"), dockerfile.index("COPY apps/embedding-worker/app.py"))
        self.assertIn("USER 10001:10001", dockerfile)
        self.assertNotIn("COPY --chmod", dockerfile)


if __name__ == "__main__":
    unittest.main()
