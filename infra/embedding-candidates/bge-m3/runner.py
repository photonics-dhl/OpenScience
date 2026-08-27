from __future__ import annotations

import base64
import hashlib
from importlib.metadata import distributions
import json
import math
from pathlib import Path
import struct
import sys
import time
from typing import Any, Mapping, Sequence


MODEL_REVISION = "5617a9f61b028005a4858fdac845db406aefb181"
MODEL_ROOT = Path("/opt/bge-m3-seed")
LOCK_ROOT = Path("/opt/bge-m3-lock")
MAX_INPUT_BYTES = 131_072
MAX_OUTPUT_BYTES = 65_536
MAX_BATCH_SIZE = 8
MAX_TEXT_CHARACTERS = 16_384
EXPECTED_DIMENSION = 1024


def validate_embed_request(value: Any) -> tuple[str, list[str]]:
    if not isinstance(value, Mapping) or set(value) != {"kind", "texts"}:
        raise ValueError("invalid embed request")
    kind = value.get("kind")
    texts = value.get("texts")
    if (
        kind not in {"query", "corpus"}
        or
        not isinstance(texts, list)
        or not 1 <= len(texts) <= MAX_BATCH_SIZE
        or any(not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT_CHARACTERS for text in texts)
    ):
        raise ValueError("invalid embed request")
    return kind, texts


def encode_dense_vectors(vectors: Sequence[Sequence[Any]]) -> dict[str, Any]:
    if not isinstance(vectors, Sequence) or isinstance(vectors, (str, bytes)) or not vectors:
        raise ValueError("invalid dense vectors")
    dimension: int | None = None
    encoded: list[str] = []
    for vector in vectors:
        if not isinstance(vector, Sequence) or isinstance(vector, (str, bytes)) or not vector:
            raise ValueError("invalid dense vector")
        values: list[float] = []
        for raw_value in vector:
            if isinstance(raw_value, bool) or not isinstance(raw_value, (int, float)):
                raise ValueError("invalid dense vector value")
            value = float(raw_value)
            if not math.isfinite(value):
                raise ValueError("invalid dense vector value")
            values.append(value)
        if dimension is None:
            dimension = len(values)
        elif dimension != len(values):
            raise ValueError("inconsistent dense dimensions")
        payload = struct.pack(f"<{len(values)}f", *values)
        encoded.append(base64.b64encode(payload).decode("ascii"))
    return {
        "schemaVersion": 1,
        "dimension": dimension,
        "encoding": "base64-f32le",
        "vectors": encoded,
    }


def compute_retrieval_metrics(
    rankings: Mapping[str, Sequence[str]],
    judgments: Mapping[str, Sequence[str]],
    cutoff: int = 10,
) -> dict[str, float]:
    if not isinstance(cutoff, int) or isinstance(cutoff, bool) or cutoff < 1 or cutoff > 100:
        raise ValueError("invalid retrieval cutoff")
    if not judgments or set(rankings) != set(judgments):
        raise ValueError("rankings and judgments differ")
    ndcg_values: list[float] = []
    recall_values: list[float] = []
    for query_id, raw_relevant in judgments.items():
        relevant = set(raw_relevant)
        ranked = list(rankings[query_id])[:cutoff]
        if not relevant or len(ranked) != len(set(ranked)):
            raise ValueError("invalid retrieval judgment")
        dcg = sum(
            1.0 / math.log2(rank + 2)
            for rank, chunk_id in enumerate(ranked)
            if chunk_id in relevant
        )
        ideal_dcg = sum(
            1.0 / math.log2(rank + 2)
            for rank in range(min(len(relevant), cutoff))
        )
        hits = len(relevant.intersection(ranked))
        ndcg_values.append(dcg / ideal_dcg)
        recall_values.append(hits / len(relevant))
    return {
        "ndcgAt10": round(sum(ndcg_values) / len(ndcg_values), 6),
        "recallAt10": round(sum(recall_values) / len(recall_values), 6),
    }


def _cosine(left: Sequence[Any], right: Sequence[Any]) -> float:
    if len(left) != len(right) or not left:
        raise ValueError("invalid vector dimensions")
    dot = 0.0
    left_norm = 0.0
    right_norm = 0.0
    for raw_left, raw_right in zip(left, right):
        left_value = float(raw_left)
        right_value = float(raw_right)
        if not math.isfinite(left_value) or not math.isfinite(right_value):
            raise ValueError("invalid vector value")
        dot += left_value * right_value
        left_norm += left_value * left_value
        right_norm += right_value * right_value
    if left_norm <= 0 or right_norm <= 0:
        raise ValueError("zero vector is not rankable")
    return dot / math.sqrt(left_norm * right_norm)


def _percentile_nearest_rank(values: Sequence[int], percentile: float) -> int:
    if not values or not 0 < percentile <= 1 or any(value < 0 for value in values):
        raise ValueError("invalid latency samples")
    ordered = sorted(values)
    return ordered[max(0, math.ceil(percentile * len(ordered)) - 1)]


def build_evaluation_report(
    corpus: Mapping[str, Any],
    chunk_vectors: Sequence[Sequence[Any]],
    query_vectors: Sequence[Sequence[Any]],
    query_elapsed_ms: Sequence[int],
    peak_rss_bytes: int,
    corpus_sha256: str,
) -> dict[str, Any]:
    chunks = corpus.get("chunks")
    queries = corpus.get("queries")
    if not isinstance(chunks, list) or not isinstance(queries, list):
        raise ValueError("invalid evaluation corpus")
    if len(chunks) != len(chunk_vectors) or len(queries) != len(query_vectors) or len(queries) != len(query_elapsed_ms):
        raise ValueError("evaluation cardinality mismatch")
    chunk_ids = [item.get("id") for item in chunks if isinstance(item, Mapping)]
    query_ids = [item.get("id") for item in queries if isinstance(item, Mapping)]
    if len(chunk_ids) != len(chunks) or len(set(chunk_ids)) != len(chunks):
        raise ValueError("invalid chunk IDs")
    if len(query_ids) != len(queries) or len(set(query_ids)) != len(queries):
        raise ValueError("invalid query IDs")
    rankings: dict[str, list[str]] = {}
    judgments: dict[str, Sequence[str]] = {}
    for query, query_vector in zip(queries, query_vectors):
        query_id = query["id"]
        scored = [
            (chunk_id, _cosine(query_vector, chunk_vector))
            for chunk_id, chunk_vector in zip(chunk_ids, chunk_vectors)
        ]
        rankings[query_id] = [item[0] for item in sorted(scored, key=lambda item: (-item[1], item[0]))]
        relevant = query.get("relevantChunkIds")
        if not isinstance(relevant, list) or not relevant or not set(relevant).issubset(set(chunk_ids)):
            raise ValueError("invalid relevance judgment")
        judgments[query_id] = relevant
    metrics = compute_retrieval_metrics(rankings, judgments, cutoff=10)
    return {
        "schemaVersion": 1,
        "candidate": "bge-m3",
        "modelRevision": MODEL_REVISION,
        "corpusSha256": corpus_sha256,
        "chunkCount": len(chunks),
        "queryCount": len(queries),
        **metrics,
        "p50Ms": _percentile_nearest_rank(query_elapsed_ms, 0.5),
        "p95Ms": _percentile_nearest_rank(query_elapsed_ms, 0.95),
        "peakRssBytes": peak_rss_bytes,
        "dimension": len(chunk_vectors[0]),
    }


def _file_sha256(path: Path) -> str:
    if not path.is_file() or path.is_symlink() or path.stat().st_size > 16 * 1024 * 1024:
        raise ValueError("invalid candidate lock file")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_candidate_lock(
    lock_root: Path,
    gpu_package_count: int,
    model_root: Path = MODEL_ROOT,
) -> dict[str, Any]:
    if gpu_package_count != 0:
        raise ValueError("GPU dependency detected in CPU candidate")
    return {
        "schemaVersion": 1,
        "candidate": "bge-m3",
        "modelRevision": MODEL_REVISION,
        "modelManifestSha256": _file_sha256(model_root / "openscience-model-manifest.json"),
        "packageFreezeSha256": _file_sha256(lock_root / "package-freeze.txt"),
        "dimension": EXPECTED_DIMENSION,
        "computePlatform": "cpu",
        "gpuPackageCount": 0,
    }


def _gpu_package_count() -> int:
    prefixes = ("cuda-", "nvidia-", "rocm", "triton")
    names = [
        distribution.metadata.get("Name", "").lower()
        for distribution in distributions()
    ]
    return sum(1 for name in names if name.startswith(prefixes))


def _write_json(value: Mapping[str, Any]) -> None:
    payload = json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    if len(payload) > MAX_OUTPUT_BYTES:
        raise ValueError("bounded output exceeded")
    sys.stdout.buffer.write(payload)
    sys.stdout.buffer.flush()


def _print_lock() -> None:
    import torch

    gpu_package_count = _gpu_package_count()
    if torch.version.cuda is not None:
        gpu_package_count += 1
    _write_json(build_candidate_lock(LOCK_ROOT, gpu_package_count))


def _load_model():
    from FlagEmbedding import FlagAutoModel

    return FlagAutoModel.from_finetuned(
        str(MODEL_ROOT),
        model_class="encoder-only-m3",
        devices="cpu",
        use_fp16=False,
    )


def _model_encode(model: Any, texts: Sequence[str], batch_size: int, kind: str) -> list[list[float]]:
    if kind == "query":
        encode = model.encode_queries
    elif kind == "corpus":
        encode = model.encode_corpus
    else:
        raise ValueError("invalid embedding kind")
    result = encode(
        list(texts),
        batch_size=min(batch_size, MAX_BATCH_SIZE),
        max_length=1024,
        return_dense=True,
        return_sparse=False,
        return_colbert_vecs=False,
    )
    vectors = result.get("dense_vecs") if isinstance(result, Mapping) else None
    if vectors is None:
        raise ValueError("dense output missing")
    normalized = vectors.tolist() if hasattr(vectors, "tolist") else vectors
    if not isinstance(normalized, Sequence) or len(normalized) != len(texts):
        raise ValueError("dense output cardinality mismatch")
    if any(not isinstance(vector, Sequence) or len(vector) != EXPECTED_DIMENSION for vector in normalized):
        raise ValueError("unexpected dense dimension")
    return [list(vector) for vector in normalized]


def _embed() -> None:
    raw_request = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    if len(raw_request) > MAX_INPUT_BYTES:
        raise ValueError("bounded input exceeded")
    kind, texts = validate_embed_request(json.loads(raw_request.decode("utf-8")))

    output = encode_dense_vectors(_model_encode(_load_model(), texts, len(texts), kind))
    if output["dimension"] != EXPECTED_DIMENSION:
        raise ValueError("unexpected dense dimension")
    _write_json(output)


def _evaluate(corpus_path: Path) -> None:
    import resource
    import signal

    if (
        corpus_path.parent != Path("/corpus")
        or not corpus_path.is_file()
        or corpus_path.is_symlink()
        or corpus_path.stat().st_size > 2 * 1024 * 1024
    ):
        raise ValueError("invalid evaluation corpus path")
    raw_corpus = corpus_path.read_bytes()
    corpus = json.loads(raw_corpus.decode("utf-8"))
    if not isinstance(corpus, Mapping) or corpus.get("schemaVersion") != 1 or corpus.get("rights") != "self-authored":
        raise ValueError("invalid evaluation corpus")
    chunks = corpus.get("chunks")
    queries = corpus.get("queries")
    if not isinstance(chunks, list) or len(chunks) < 16 or not isinstance(queries, list) or len(queries) < 24:
        raise ValueError("evaluation corpus is incomplete")
    chunk_texts = [item.get("text") for item in chunks if isinstance(item, Mapping)]
    query_texts = [item.get("text") for item in queries if isinstance(item, Mapping)]
    if len(chunk_texts) != len(chunks) or len(query_texts) != len(queries):
        raise ValueError("evaluation corpus text is invalid")
    validate_embed_request({"kind": "corpus", "texts": chunk_texts[:MAX_BATCH_SIZE]})
    if any(not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT_CHARACTERS for text in chunk_texts + query_texts):
        raise ValueError("evaluation corpus text is invalid")

    model = _load_model()

    def encode_with_timeout(
        texts: Sequence[str],
        batch_size: int,
        seconds: int,
        kind: str,
    ) -> list[list[float]]:
        previous_handler = signal.getsignal(signal.SIGALRM)

        def raise_timeout(_signum, _frame):
            raise TimeoutError("embedding timeout")

        signal.signal(signal.SIGALRM, raise_timeout)
        signal.setitimer(signal.ITIMER_REAL, seconds)
        try:
            return _model_encode(model, texts, batch_size, kind)
        finally:
            signal.setitimer(signal.ITIMER_REAL, 0)
            signal.signal(signal.SIGALRM, previous_handler)

    chunk_vectors: list[list[float]] = []
    for index in range(0, len(chunk_texts), MAX_BATCH_SIZE):
        batch = chunk_texts[index:index + MAX_BATCH_SIZE]
        chunk_vectors.extend(encode_with_timeout(batch, MAX_BATCH_SIZE, 300, "corpus"))
    query_vectors: list[list[float]] = []
    elapsed_ms: list[int] = []
    for text in query_texts:
        started = time.monotonic()
        query_vectors.extend(encode_with_timeout([text], 1, 120, "query"))
        elapsed_ms.append(max(0, round((time.monotonic() - started) * 1000)))
    peak_rss_bytes = max(0, int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024)
    _write_json(build_evaluation_report(
        corpus,
        chunk_vectors,
        query_vectors,
        elapsed_ms,
        peak_rss_bytes,
        hashlib.sha256(raw_corpus).hexdigest(),
    ))


def run() -> None:
    try:
        if sys.argv[1:] == ["--print-lock"]:
            _print_lock()
            return
        if sys.argv[1:] == ["--embed"]:
            _embed()
            return
        if len(sys.argv) == 3 and sys.argv[1] == "--evaluate":
            _evaluate(Path(sys.argv[2]))
            return
        raise ValueError("unsupported command")
    except Exception:
        _write_json({"schemaVersion": 1, "status": "failed", "errorCode": "candidate_exit"})
        raise SystemExit(1)


if __name__ == "__main__":
    run()
