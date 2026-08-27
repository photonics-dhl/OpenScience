import base64
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest


RUNNER_PATH = Path(__file__).with_name("runner.py")


def load_runner():
    if not RUNNER_PATH.is_file():
        raise AssertionError("BGE-M3 runner API is missing")
    spec = importlib.util.spec_from_file_location("bge_m3_candidate_runner", RUNNER_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("BGE-M3 runner API cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BgeM3RunnerTest(unittest.TestCase):
    def test_default_model_root_matches_inherited_runtime_seed(self):
        runner = load_runner()
        self.assertEqual(runner.MODEL_ROOT, Path("/opt/bge-m3-seed"))

    def test_validates_bounded_dense_only_requests(self):
        runner = load_runner()

        self.assertEqual(
            runner.validate_embed_request({"kind": "query", "texts": ["carrier cooling", "载流子冷却"]}),
            ("query", ["carrier cooling", "载流子冷却"]),
        )
        for invalid in (
            {},
            {"kind": "query", "texts": []},
            {"kind": "query", "texts": [""]},
            {"kind": "query", "texts": ["ok"] * 9},
            {"kind": "query", "texts": ["x" * 16_385]},
            {"kind": "invalid", "texts": ["ok"]},
            {"kind": "corpus", "texts": ["ok"], "returnSparse": True},
        ):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    runner.validate_embed_request(invalid)

    def test_encodes_little_endian_float32_without_echoing_text(self):
        runner = load_runner()
        output = runner.encode_dense_vectors([[0.5, -1.25], [2.0, 0.0]])

        self.assertEqual(output["schemaVersion"], 1)
        self.assertEqual(output["dimension"], 2)
        self.assertEqual(output["encoding"], "base64-f32le")
        self.assertEqual(len(output["vectors"]), 2)
        self.assertEqual(
            struct.unpack("<2f", base64.b64decode(output["vectors"][0])),
            (0.5, -1.25),
        )
        self.assertNotIn("carrier cooling", json.dumps(output))

    def test_builds_content_free_exact_candidate_lock(self):
        runner = load_runner()
        with tempfile.TemporaryDirectory() as temporary_directory:
            lock_root = Path(temporary_directory)
            (lock_root / "package-freeze.txt").write_text("flagembedding==1.4.2\n", encoding="utf-8")
            (lock_root / "openscience-model-manifest.json").write_text(
                '{"files":[],"modelRevision":"5617a9f61b028005a4858fdac845db406aefb181","schemaVersion":1}',
                encoding="ascii",
            )

            lock = runner.build_candidate_lock(lock_root, gpu_package_count=0, model_root=lock_root)

        self.assertEqual(
            set(lock),
            {
                "schemaVersion",
                "candidate",
                "modelRevision",
                "modelManifestSha256",
                "packageFreezeSha256",
                "dimension",
                "computePlatform",
                "gpuPackageCount",
            },
        )
        self.assertEqual(lock["modelRevision"], "5617a9f61b028005a4858fdac845db406aefb181")
        self.assertEqual(lock["dimension"], 1024)
        self.assertEqual(lock["computePlatform"], "cpu")

    def test_computes_binary_relevance_metrics_without_content(self):
        runner = load_runner()
        metrics = runner.compute_retrieval_metrics(
            {
                "q1": ["a", "b", "c"],
                "q2": ["b", "a", "c"],
            },
            {
                "q1": ["a"],
                "q2": ["a"],
            },
            cutoff=10,
        )

        self.assertAlmostEqual(metrics["ndcgAt10"], 0.815465, places=6)
        self.assertEqual(metrics["recallAt10"], 1.0)
        self.assertNotIn("q1", json.dumps(metrics))

    def test_builds_content_free_evaluation_report(self):
        runner = load_runner()
        corpus = {
            "schemaVersion": 1,
            "rights": "self-authored",
            "chunks": [
                {"id": "a", "text": "secret evidence a", "locator": {"page": 1}},
                {"id": "b", "text": "secret evidence b", "locator": {"page": 2}},
            ],
            "queries": [
                {"id": "q", "text": "secret question", "relevantChunkIds": ["a"]},
            ],
        }
        report = runner.build_evaluation_report(
            corpus,
            [[1.0, 0.0], [0.0, 1.0]],
            [[1.0, 0.0]],
            [17],
            peak_rss_bytes=1234,
            corpus_sha256="a" * 64,
        )

        self.assertEqual(report["ndcgAt10"], 1.0)
        self.assertEqual(report["recallAt10"], 1.0)
        self.assertEqual(report["p50Ms"], 17)
        self.assertEqual(report["p95Ms"], 17)
        self.assertEqual(report["peakRssBytes"], 1234)
        self.assertNotIn("secret", json.dumps(report))


if __name__ == "__main__":
    unittest.main()
