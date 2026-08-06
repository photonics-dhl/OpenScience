#!/usr/bin/env bash
# P1E-3: Sandbox image test script
# Tests fixed dependency versions, non-root user, and basic functionality

set -euo pipefail

IMAGE="openscience-sandbox:latest"

echo "=== Testing OpenScience Sandbox Image ==="
echo

# Test 1: Check image exists
echo "[1/5] Checking image exists..."
if docker image inspect "$IMAGE" &>/dev/null; then
  echo "✓ Image found: $IMAGE"
else
  echo "✗ Image not found. Build it first with: docker build -t $IMAGE ."
  exit 1
fi
echo

# Test 2: Check dependency versions
echo "[2/5] Checking dependency versions..."
docker run --rm "$IMAGE" python3 -c "
import numpy, scipy, sympy, matplotlib, PIL
print(f'NumPy: {numpy.__version__}')
print(f'SciPy: {scipy.__version__}')
print(f'SymPy: {sympy.__version__}')
print(f'Matplotlib: {matplotlib.__version__}')
print(f'Pillow: {PIL.__version__}')
"
echo

# Test 3: Check non-root user
echo "[3/5] Checking non-root user..."
USER=$(docker run --rm "$IMAGE" whoami)
if [ "$USER" = "sandbox" ]; then
  echo "✓ Running as non-root user: $USER"
else
  echo "✗ Unexpected user: $USER (expected: sandbox)"
  exit 1
fi
echo

# Test 4: Test NumPy array operations
echo "[4/5] Testing NumPy operations..."
docker run --rm "$IMAGE" python3 -c "
import numpy as np
x = np.array([1, 2, 3, 4, 5])
y = np.sin(x)
assert len(y) == 5, 'NumPy array operation failed'
print('✓ NumPy array operations work')
"
echo

# Test 5: Test Matplotlib plot generation
echo "[5/5] Testing Matplotlib plot generation..."
CONTAINER_ID=$(docker run -d "$IMAGE" python3 -c "
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 100)
y = np.sin(x)
plt.figure(figsize=(8, 6))
plt.plot(x, y)
plt.title('Test Plot: sin(x)')
plt.xlabel('x')
plt.ylabel('sin(x)')
plt.grid(True)
plt.savefig('/tmp/test-plot.png', dpi=100)
print('✓ Plot generated successfully')
" && sleep 1)

docker wait "$CONTAINER_ID" > /dev/null
docker cp "$CONTAINER_ID":/tmp/test-plot.png /tmp/sandbox-test-plot.png 2>/dev/null
docker rm "$CONTAINER_ID" > /dev/null

if [ -f /tmp/sandbox-test-plot.png ]; then
  SIZE=$(stat -c%s /tmp/sandbox-test-plot.png 2>/dev/null || stat -f%z /tmp/sandbox-test-plot.png 2>/dev/null || echo "0")
  echo "✓ Plot file created: /tmp/sandbox-test-plot.png ($SIZE bytes)"
  rm -f /tmp/sandbox-test-plot.png
else
  echo "✗ Plot file not created"
  exit 1
fi
echo

echo "=== All tests passed ==="
echo "Image is ready for P1E-4 Sandbox Controller integration"
