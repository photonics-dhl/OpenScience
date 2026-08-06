#!/usr/bin/env bash
# P1E-3: Build sandbox image on cloud server
# To be executed on cloud server where Docker is available

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="openscience-sandbox:latest"

echo "=== Building OpenScience Sandbox Image ==="
echo "Build directory: $SCRIPT_DIR"
echo "Image tag: $IMAGE_NAME"
echo

# Build image
echo "[1/3] Building Docker image..."
cd "$SCRIPT_DIR"
docker build -t "$IMAGE_NAME" .
echo "✓ Build complete"
echo

# Verify image
echo "[2/3] Verifying image..."
docker image inspect "$IMAGE_NAME" >/dev/null
echo "✓ Image created: $IMAGE_NAME"
echo

# Quick smoke test
echo "[3/3] Running smoke test..."
docker run --rm "$IMAGE_NAME" python3 -c "
import numpy, scipy, sympy, matplotlib, PIL
print('✓ All dependencies loaded')
print(f'  NumPy: {numpy.__version__}')
print(f'  SciPy: {scipy.__version__}')
print(f'  SymPy: {sympy.__version__}')
print(f'  Matplotlib: {matplotlib.__version__}')
print(f'  Pillow: {PIL.__version__}')
"
echo

echo "=== Build successful ==="
echo "Run comprehensive tests with: ./test-sandbox.sh"
