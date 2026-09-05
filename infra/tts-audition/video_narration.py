"""Generate the reviewed five-scene narration using the existing offline runtime."""
import json
import resource
import time
from pathlib import Path

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

from audition import CONVERSATIONAL_INSTRUCT, MODEL_ROOT, validate_waveform

TEXTS = (
    "你想过吗，光也能认数字。这项研究，让光穿过五层精心设计的薄片。",
    "先用计算机训练出每层的结构，再把薄片制造出来。之后，光通过它们，就能完成分类。",
    "每过一层，光的相位都会改变。衍射和干涉，让光在不同位置增强或减弱。",
    "最后，看十个探测区域哪里最亮。比如，代表七的区域最亮，就把它认作七。",
    "这里展示的是原理，不是实验录像。实验用的是太赫兹波，制造和对准误差也会影响结果。",
)


def main():
    output = Path('/output')
    if not output.is_dir() or any(output.iterdir()):
        raise ValueError('Use a new empty output directory; previous evidence is retained')
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    started = time.perf_counter()
    model = Qwen3TTSModel.from_pretrained(
        str(MODEL_ROOT), device_map='cpu', dtype=torch.bfloat16,
        attn_implementation='sdpa', local_files_only=True,
    )
    scenes = []
    for index, text in enumerate(TEXTS):
        torch.manual_seed(42)
        tick = time.perf_counter()
        print(json.dumps({'phase': 'generating', 'scene': index}), flush=True)
        with torch.inference_mode():
            waves, rate = model.generate_custom_voice(
                text=text, language='Chinese', speaker='Serena',
                instruct=CONVERSATIONAL_INSTRUCT,
            )
        wave = validate_waveform(waves[0], rate)
        duration = len(wave) / rate
        with (output / f'voice-{index}.wav').open('xb') as stream:
            sf.write(stream, wave, rate, format='WAV', subtype='PCM_16')
        scenes.append({'text': text, 'cues': [{'start': 0, 'end': duration, 'text': text}]})
        metrics = {'scene': index, 'durationSeconds': duration,
                   'generationSeconds': time.perf_counter() - tick,
                   'maxRssBytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024}
        with (output / f'voice-{index}.metrics.json').open('x') as stream:
            json.dump(metrics, stream)
        print(json.dumps(metrics), flush=True)
    with (output / 'narration.json').open('x', encoding='utf-8') as stream:
        json.dump({'provider': 'Qwen3-TTS 1.7B CustomVoice / CPU offline',
                   'speaker': 'Serena', 'scenes': scenes}, stream, ensure_ascii=False, indent=2)
    print(json.dumps({'phase': 'complete', 'seconds': time.perf_counter() - started}), flush=True)


if __name__ == '__main__':
    main()
