#!/usr/bin/env python3
"""One-shot TTS audition.

Publishing the WAV and metrics cannot be atomic across a process kill. After an
interrupted trial, operators must mount a fresh output directory for the retry.
"""
import argparse
import json
import math
import os
import time
from pathlib import Path

import numpy as np


MODEL_ROOT = Path("/models/qwen3-tts-12hz-1.7b-customvoice")
OUTPUT_ROOT = Path("/output")
PACKAGE_FREEZE = Path("/opt/tts-lock/package-freeze.txt")
SPEAKERS = ("Serena", "Uncle_Fu", "Vivian")
OUTPUT_NAMES = {
    "Serena": "serena",
    "Uncle_Fu": "uncle_fu",
    "Vivian": "vivian",
}
TEXT = (
    "这篇研究没有让电子芯片逐层计算，而是让一束光穿过五层精心设计的衍射结构。"
    "光在传播中不断改变形状，最后照亮对应的探测区域，用一次传播完成图像分类。"
)
INSTRUCT = "像向朋友讲一个有趣的科学发现，放松自然，有好奇感；重点处稍作停顿，避免广告腔和夸张播音腔。"
SPOKEN_TEXT = (
    "你想过吗，光也能用来认数字。"
    "这篇研究里，研究人员设计了五层薄片，让光依次穿过去。"
    "每过一层，光的分布就变一次。"
    "最后，只要比较几个探测区域的亮度，就能得到分类结果。"
    "当然，薄片的结构得先在计算机上训练好，再制造出来。"
)
CONVERSATIONAL_INSTRUCT = (
    "用日常聊天的普通话说给身边一个朋友听，声音轻松、亲近，语速中等。"
    "开头带一点真实的好奇，解释过程时平实清楚，结尾自然收住。"
    "一句话里只突出最重要的一两个词，短句连贯，长句按意思轻轻换气。"
    "不要每个词都重读，不要每句话都用相同的抑扬顿挫，不用主持人或广告配音的腔调。"
)
SEED = 42
THREADS = 4


def log_phase(phase, **fields):
    print(
        json.dumps({"phase": phase, **fields}, ensure_ascii=False, separators=(",", ":")),
        flush=True,
    )


def parse_args():
    parser = argparse.ArgumentParser(description="Generate one Qwen3-TTS CPU audition clip")
    parser.add_argument("--speaker", choices=SPEAKERS, default="Serena")
    parser.add_argument("--script", choices=("original", "spoken"), default="original")
    parser.add_argument("--delivery", choices=("original", "conversational"), default="original")
    return parser.parse_args()


def output_paths(output_root, speaker):
    stem = OUTPUT_NAMES[speaker]
    return output_root / f"{stem}.wav", output_root / f"{stem}.metrics.json"


def ensure_output_available(output_root, speaker):
    if not output_root.is_dir():
        raise NotADirectoryError(f"output directory is unavailable: {output_root}")
    paths = output_paths(output_root, speaker)
    existing = [str(path) for path in paths if path.exists()]
    if existing:
        raise FileExistsError(f"refusing to overwrite existing output: {', '.join(existing)}")
    return paths


def validate_waveform(waveform, sample_rate):
    samples = np.asarray(waveform, dtype=np.float32)
    if samples.ndim != 1 or samples.size == 0:
        raise ValueError("waveform must be a non-empty one-dimensional array")
    if not np.all(np.isfinite(samples)):
        raise ValueError("waveform samples must be finite")
    if not np.any(np.abs(samples) > 1e-7):
        raise ValueError("waveform is silent")
    if not isinstance(sample_rate, (int, np.integer)) or sample_rate <= 0:
        raise ValueError("sample rate must be a positive integer")
    return samples


def publish_exclusive(temporary_path, destination_path):
    source_stat = temporary_path.stat()
    try:
        os.link(temporary_path, destination_path)
    except FileExistsError as error:
        raise FileExistsError(f"refusing to overwrite existing output: {destination_path}") from error
    finally:
        temporary_path.unlink(missing_ok=True)
    return source_stat.st_dev, source_stat.st_ino


def unlink_if_same_file(path, identity):
    try:
        current_stat = path.stat()
    except FileNotFoundError:
        return
    if (current_stat.st_dev, current_stat.st_ino) == identity:
        path.unlink()


def save_outputs(output_root, speaker, waveform, sample_rate, metrics, sound_writer):
    wav_path, metrics_path = ensure_output_available(output_root, speaker)
    wav_temporary = output_root / f".{wav_path.name}.{os.getpid()}.tmp"
    metrics_temporary = output_root / f".{metrics_path.name}.{os.getpid()}.tmp"
    try:
        sound_writer(
            str(wav_temporary),
            waveform,
            sample_rate,
            format="WAV",
            subtype="PCM_16",
        )
        metrics_temporary.write_text(
            json.dumps(metrics, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        wav_identity = publish_exclusive(wav_temporary, wav_path)
        try:
            publish_exclusive(metrics_temporary, metrics_path)
        except Exception:
            unlink_if_same_file(wav_path, wav_identity)
            raise
    finally:
        wav_temporary.unlink(missing_ok=True)
        metrics_temporary.unlink(missing_ok=True)
    return wav_path, metrics_path


def max_rss_bytes():
    import resource

    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024


def main():
    args = parse_args()
    text = SPOKEN_TEXT if args.script == "spoken" else TEXT
    instruct = CONVERSATIONAL_INSTRUCT if args.delivery == "conversational" else INSTRUCT
    ensure_output_available(OUTPUT_ROOT, args.speaker)
    if not MODEL_ROOT.is_dir():
        raise NotADirectoryError(f"model directory is unavailable: {MODEL_ROOT}")

    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel

    log_phase("imports_ready", speaker=args.speaker)
    torch.set_num_threads(THREADS)
    torch.set_num_interop_threads(1)
    torch.manual_seed(SEED)

    total_started = time.perf_counter()
    load_started = time.perf_counter()
    model = Qwen3TTSModel.from_pretrained(
        str(MODEL_ROOT),
        device_map="cpu",
        dtype=torch.bfloat16,
        attn_implementation="sdpa",
        local_files_only=True,
    )
    model_load_seconds = time.perf_counter() - load_started
    log_phase("model_loaded", speaker=args.speaker, seconds=round(model_load_seconds, 3))

    log_phase("generation_start", speaker=args.speaker)
    generation_started = time.perf_counter()
    with torch.inference_mode():
        waveforms, sample_rate = model.generate_custom_voice(
            text=text,
            language="Chinese",
            speaker=args.speaker,
            instruct=instruct,
        )
    generation_seconds = time.perf_counter() - generation_started
    waveform = waveforms[0]
    if hasattr(waveform, "detach"):
        waveform = waveform.detach().float().cpu().numpy()
    waveform = validate_waveform(waveform, sample_rate)

    metrics = {
        "schemaVersion": 1,
        "speaker": args.speaker,
        "text": text,
        "instruct": instruct,
        "script": args.script,
        "delivery": args.delivery,
        "modelPath": str(MODEL_ROOT),
        "device": "cpu",
        "dtype": "bfloat16",
        "attentionImplementation": "sdpa",
        "seed": SEED,
        "threads": THREADS,
        "sampleRate": int(sample_rate),
        "sampleCount": int(waveform.size),
        "durationSeconds": waveform.size / int(sample_rate),
        "modelLoadSeconds": model_load_seconds,
        "generationSeconds": generation_seconds,
        "totalSeconds": time.perf_counter() - total_started,
        "maxRssBytes": max_rss_bytes(),
        "finite": True,
        "nonzero": True,
        "packageFreeze": PACKAGE_FREEZE.read_text(encoding="utf-8").splitlines(),
    }
    if not all(math.isfinite(metrics[key]) for key in (
        "durationSeconds", "modelLoadSeconds", "generationSeconds", "totalSeconds"
    )):
        raise ValueError("timing metrics must be finite")

    wav_path, metrics_path = save_outputs(
        OUTPUT_ROOT,
        args.speaker,
        waveform,
        int(sample_rate),
        metrics,
        sf.write,
    )
    print(json.dumps({"wav": str(wav_path), "metrics": str(metrics_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
