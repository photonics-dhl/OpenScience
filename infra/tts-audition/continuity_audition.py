"""Offline full-script comparison; run with the existing bounded audition container."""
import argparse
import json
import resource
import time
from pathlib import Path

import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

from audition import MODEL_ROOT, CONVERSATIONAL_INSTRUCT, validate_waveform
from video_narration import TEXTS


RELAXED_TEXT = '光也能用来认数字。这项研究的做法，是让光依次穿过五层薄片。薄片的结构要先在计算机上训练好，再制造出来。光穿过每一层时，相位都会改变，经过衍射和干涉，有些位置的光就会增强，有些会减弱。这样，到了最后，只要比较十个探测区域的亮度，就能得到分类结果。比如代表七的区域最亮，就把它认作七。不过，这里画的是原理。实际实验用的是太赫兹波，薄片的制造和对准误差，也会影响识别效果。'
PLAIN_INSTRUCT = "用自然平实的普通话连贯地解释，语气放松，语速适中。"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", choices=("comparison", "relaxed"), default="comparison")
    args = parser.parse_args()
    output = Path('/output')
    if not output.is_dir() or any(output.iterdir()):
        raise ValueError('Use a new empty output directory; keep previous auditions')
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    model = Qwen3TTSModel.from_pretrained(
        str(MODEL_ROOT), device_map='cpu', dtype=torch.bfloat16,
        attn_implementation='sdpa', local_files_only=True,
    )
    variants = [('relaxed', PLAIN_INSTRUCT)] if args.variant == 'relaxed' else [
        ('continuous', CONVERSATIONAL_INSTRUCT), ('plain', PLAIN_INSTRUCT),
    ]
    text = RELAXED_TEXT if args.variant == 'relaxed' else ''.join(TEXTS)
    for name, instruction in variants:
        torch.manual_seed(42)
        started = time.perf_counter()
        print(name, flush=True)
        with torch.inference_mode():
            waves, rate = model.generate_custom_voice(
                text=text, language='Chinese', speaker='Serena',
                instruct=instruction, max_new_tokens=2048,
            )
        wave = validate_waveform(waves[0], rate)
        with (output / f'{name}.wav').open('xb') as stream:
            sf.write(stream, wave, rate, format='WAV', subtype='PCM_16')
        metrics = {
            'speaker': 'Serena', 'seed': 42, 'sampleRate': rate, 'sampleCount': len(wave),
            'variant': name, 'duration': len(wave) / rate,
            'generationSeconds': time.perf_counter() - started,
            'text': text, 'instruction': instruction,
            'maxRssBytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024,
        }
        with (output / f'{name}.json').open('x', encoding='utf-8') as stream:
            json.dump(metrics, stream, ensure_ascii=False)
        print(json.dumps(metrics, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
