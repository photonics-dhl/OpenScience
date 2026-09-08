"""Offline continuous Serena narration for an approved five-scene storyboard."""
import json
import numpy as np
import resource
import re
import time
from pathlib import Path

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel
ROLES = ('driver_signal', 'tip_enhancement', 'emission_collection', 'delay_scan', 'field_reconstruction')
INSTRUCTION = '用自然平实的普通话连贯地解释，语气放松，语速适中。'
MODEL_ROOT = Path('/models/qwen3-tts-12hz-1.7b-customvoice')


def validate_waveform(waveform, sample_rate):
    samples = np.asarray(waveform, dtype=np.float32)
    if samples.ndim != 1 or samples.size == 0 or not np.all(np.isfinite(samples)):
        raise ValueError('invalid waveform')
    if not np.any(np.abs(samples) > 1e-7):
        raise ValueError('silent waveform')
    if not isinstance(sample_rate, (int, np.integer)) or sample_rate <= 0:
        raise ValueError('invalid sample rate')
    return samples


def main():
    source = json.loads(Path('/input/storyboard.json').read_text(encoding='utf-8'))
    scenes = source.get('scenes')
    if source.get('schemaVersion') != 1 or not isinstance(scenes, list) or len(scenes) != 5:
        raise ValueError('invalid storyboard')
    texts = []
    for scene in scenes:
        text = scene.get('narration') if isinstance(scene, dict) else None
        if not isinstance(text, str) or not text.strip() or len(text) > 120:
            raise ValueError('invalid narration')
        texts.append(text.strip())
    output = Path('/output')
    if not output.is_dir() or any(output.iterdir()):
        raise ValueError('use a new empty output')
    torch.set_num_threads(4); torch.set_num_interop_threads(1); torch.manual_seed(42)
    started = time.perf_counter()
    model = Qwen3TTSModel.from_pretrained(
        str(MODEL_ROOT), device_map='cpu', dtype=torch.bfloat16,
        attn_implementation='sdpa', local_files_only=True,
    )
    full_text = ''.join(texts)
    if len(full_text) > 450:
        raise ValueError('narration exceeds fixed 90-second preflight bound')
    with torch.inference_mode():
        waves, rate = model.generate_custom_voice(
            text=full_text, language='Chinese', speaker='Serena', instruct=INSTRUCTION, max_new_tokens=2048,
        )
    wave = validate_waveform(waves[0], rate)
    duration = len(wave) / rate
    with (output / 'narration.wav').open('xb') as stream:
        sf.write(stream, wave, rate, format='WAV', subtype='PCM_16')
    weights = [max(1, len(text)) for text in texts]
    total_weight = sum(weights); cursor = 0.0; timeline = []
    for index, (text, weight) in enumerate(zip(texts, weights)):
        start = cursor
        cursor = duration if index == 4 else cursor + duration * weight / total_weight
        parts = []
        for sentence in filter(None, re.split(r'(?<=[。！？；,.!?;])', text)):
            parts.extend(sentence[offset:offset + 80] for offset in range(0, len(sentence), 80))
        part_weight = sum(len(part) for part in parts); cue_cursor = 0.0; cues = []
        scene_duration = cursor - start
        for part_index, part in enumerate(parts):
            cue_start = cue_cursor
            cue_cursor = scene_duration if part_index == len(parts) - 1 else cue_cursor + scene_duration * len(part) / part_weight
            cues.append({'start': cue_start, 'end': cue_cursor, 'text': part})
        timeline.append({'role': ROLES[index], 'text': text, 'start': start, 'cues': cues})
    metadata = {
        'schemaVersion': 1, 'provider': 'Qwen3-TTS 1.7B CustomVoice / CPU offline', 'speaker': 'Serena',
        'timingStatus': 'estimated_requires_review', 'durationSeconds': duration, 'scenes': timeline,
        'generationSeconds': time.perf_counter() - started,
        'maxRssBytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024,
    }
    (output / 'narration.json').write_text(json.dumps(metadata, ensure_ascii=False), encoding='utf-8')
    print(json.dumps(metadata, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
