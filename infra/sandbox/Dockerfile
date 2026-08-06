# OpenScience Sandbox Base Image
# P1E-3: Fixed dependencies for lightweight scientific visualization
# Python 3.11 slim with NumPy, SciPy, SymPy, Matplotlib, Pillow

FROM python:3.11-slim

# Create non-root user for sandbox execution
RUN useradd -m -u 1000 -s /bin/bash sandbox

# Install fixed dependency versions
# Versions locked for reproducibility and security audit
RUN pip install --no-cache-dir \
    -i https://mirrors.aliyun.com/pypi/simple/ \
    --trusted-host mirrors.aliyun.com \
    numpy==1.26.4 \
    scipy==1.12.0 \
    sympy==1.12 \
    matplotlib==3.8.3 \
    pillow==10.2.0

# Configure Matplotlib to use non-interactive backend (no display required)
# Output directory will be mounted as tmpfs at runtime
RUN mkdir -p /home/sandbox/.config/matplotlib && \
    echo "backend: Agg" > /home/sandbox/.config/matplotlib/matplotlibrc && \
    chown -R sandbox:sandbox /home/sandbox/.config

# Set working directory for script execution
WORKDIR /sandbox

# Switch to non-root user
USER sandbox

# Default command (will be overridden by container orchestration)
CMD ["python3", "-c", "import numpy, scipy, sympy, matplotlib, PIL; print('Sandbox ready')"]
