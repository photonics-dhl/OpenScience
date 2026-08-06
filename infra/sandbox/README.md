# OpenScience Sandbox Base Image

## 概述

P1E-3 任务产物：轻量级科学可视化沙箱的 Docker 基础镜像。

## 固定依赖版本

| 包          | 版本      | 用途                          |
|-------------|-----------|-------------------------------|
| Python      | 3.11-slim | 运行时基础                    |
| NumPy       | 1.26.4    | 数组计算                      |
| SciPy       | 1.12.0    | 科学计算（优化、积分、信号）  |
| SymPy       | 1.12      | 符号数学                      |
| Matplotlib  | 3.8.3     | 图表绘制                      |
| Pillow      | 10.2.0    | 图像处理                      |

## 安全特性

- **非 root 用户**：容器内以 `sandbox` 用户（UID 1000）运行
- **只读根文件系统**：运行时挂载 `--read-only`（通过 P1E-4 Sandbox Controller 实施）
- **临时目录**：`/tmp` 挂载为 tmpfs，受限大小（P1E-4 配置）
- **无显示后端**：Matplotlib 预置 `Agg` 后端，仅输出文件

## 构建

**本地构建**（需 Docker 运行）：
```bash
cd infra/sandbox
./build-image.sh
```

**云端构建**（通过 SSH）：
```bash
# 上传文件到云服务器
scp -i ~/.ssh/id_ed25519_xgs -r infra/sandbox root@<cloud-ip>:/opt/openscience/infra/

# SSH 登录并构建
ssh -i ~/.ssh/id_ed25519_xgs root@<cloud-ip>
cd /opt/openscience/infra/sandbox
./build-image.sh
```

## 验证

运行综合测试套件：
```bash
cd infra/sandbox
./test-sandbox.sh
```

测试涵盖：
1. 镜像存在性
2. 依赖版本验证（NumPy/SciPy/SymPy/Matplotlib/Pillow）
3. 非 root 用户验证（sandbox:1000）
4. NumPy 数组运算
5. Matplotlib 图表生成

## 运行时约束（P1E-4 实施）

运行时将由 Sandbox Controller 施加以下约束：

- `--read-only`: 根文件系统只读
- `--tmpfs /tmp:size=50m,noexec`: 临时目录 50MB 上限，禁止执行
- `--network none`: 无网络访问
- `--memory=256m`: 内存上限 256MB
- `--cpus=0.5`: CPU 上限 0.5 核
- `--pids-limit=32`: 进程数上限 32
- `--cap-drop=ALL`: 移除所有 Linux capabilities

## 下一步

P1E-4：实现 Sandbox Controller（dockerode 容器编排，临时容器生命周期管理）
