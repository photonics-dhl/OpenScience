"""Download only the pinned Q4 evaluation set; never touch production runtimes."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import time
import urllib.request
import zipfile

ROOT = Path('/eval')
FILES = [
    ('runtime.zip', 'https://github.com/leejet/stable-diffusion.cpp/releases/download/master-841-6b3edaa/sd-master-6b3edaa-bin-Linux-Ubuntu-24.04-x86_64.zip', 32984499, '66998807a8b21b6d00358310a23791c67d2e68f7e1820d99d5c9ac12738d882e'),
    ('flux-2-klein-4b-Q4_0.gguf', 'https://huggingface.co/leejet/FLUX.2-klein-4B-GGUF/resolve/3b1f5a9dc3abb32238b053aeb3d823c30afdacbd/flux-2-klein-4b-Q4_0.gguf', 2460378560, 'd1023499ef3f2f82ff7c50e6778495195c1b6cc34835741778868428111f9ff4'),
    ('Qwen3-4B-Q4_K_M.gguf', 'https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/22c9fc8a8c7700b76a1789366280a6a5a1ad1120/Qwen3-4B-Q4_K_M.gguf', 2497281312, 'f6f851777709861056efcdad3af01da38b31223a3ba26e61a4f8bf3a2195813a'),
    ('full_encoder_small_decoder.safetensors', 'https://huggingface.co/black-forest-labs/FLUX.2-small-decoder/resolve/a3efc24f613ef42d9428af62fdbd6f5fd8856c4a/full_encoder_small_decoder.safetensors', 249519092, 'ea4273f02d1fafbf8e1d1c2cf6018ed8748652eb0bf34f2dd91171f16f15ab62'),
]

def valid(path, size, digest):
    if not path.is_file() or path.is_symlink() or path.stat().st_size != size:
        return False
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest() == digest


def main():
    if not ROOT.is_dir() or ROOT.is_symlink():
        raise RuntimeError('evaluation root is required')
    deadline = time.monotonic() + 1200
    for name, url, size, digest in FILES:
        dest = ROOT / name
        if valid(dest, size, digest):
            print(json.dumps({'file': name, 'verified': True, 'reused': True}), flush=True)
            continue
        if dest.exists() or dest.is_symlink():
            raise RuntimeError('existing artifact does not match upstream')
        if shutil.disk_usage(ROOT).free - size < 70 * 1024**3:
            raise RuntimeError('disk reserve would be exceeded')
        part = ROOT / (name + '.part')
        # Keep incomplete evidence; do not overwrite a previous partial download.
        with part.open('xb') as target:
            request = urllib.request.Request(url, headers={'User-Agent': 'OpenScience-local-image-eval'})
            with urllib.request.urlopen(request, timeout=60) as response:
                count = 0
                while chunk := response.read(4 * 1024**2):
                    count += len(chunk)
                    if count > size or time.monotonic() > deadline:
                        raise RuntimeError('download exceeded size or time budget')
                    target.write(chunk)
        if not valid(part, size, digest):
            raise RuntimeError('download failed upstream integrity check')
        os.chmod(part, 0o444)
        part.rename(dest)
        print(json.dumps({'file': name, 'bytes': size, 'verified': True}), flush=True)
    runtime = ROOT / 'runtime'
    if not runtime.exists():
        with zipfile.ZipFile(ROOT / 'runtime.zip') as archive:
            entries = archive.infolist()
            if sum(x.file_size for x in entries) > 512 * 1024**2:
                raise RuntimeError('runtime archive too large')
            for entry in entries:
                target = (runtime / entry.filename).resolve()
                if not target.is_relative_to(runtime.resolve()) or stat.S_ISLNK(entry.external_attr >> 16):
                    raise RuntimeError('unsafe archive entry')
            runtime.mkdir(mode=0o755)
            archive.extractall(runtime)
        for binary in runtime.rglob('*'):
            if binary.is_file():
                binary.chmod(0o555)
    print(json.dumps({'prepared': True, 'totalDownloadBytes': sum(x[2] for x in FILES)}), flush=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'prepared': False, 'errorType': type(error).__name__}), flush=True)
        raise SystemExit(1) from None
