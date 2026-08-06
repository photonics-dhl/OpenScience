import Docker from 'dockerode';
import { collectArtifacts, type CollectedArtifact } from './artifact-collector.js';

/**
 * P1E-8 运行时策略层（AST 静态检查之外的纵深防御）。
 * 背景：check_ast.py 的静态黑名单可被 __import__/getattr/字符串拼接/反序列化绕过
 * （sandbox-escape 基线 Test 13/15/16 实证）。本前言与用户脚本在同一 python -c 进程内
 * 先行中和危险函数：os.system/popen/spawn/exec/fork/kill 族、pickle 序列化族。
 * 设计约束（2026-08-06 实证）：不能中和 builtins eval/exec/compile 或 marshal——
 * CPython import 机制（_compile_bytecode/exec_module/.pyc 读取）与 stdlib namedtuple
 * 都调用它们，补丁会炸掉所有后续 import。补丁随容器销毁，无宿主副作用；
 * subprocess.run 走 _posixsubprocess C 扩展（不经 os.fork/exec Python 包装），不受影响。
 */
const RUNTIME_POLICY_PREAMBLE = `import os as _o, pickle as _p
def _blocked(*a, **k):
    raise PermissionError('disabled by sandbox runtime policy')
for _n in ('system', 'popen', 'spawnl', 'spawnlp', 'spawnlpe', 'spawnv', 'spawnvp', 'spawnvpe', 'execl', 'execlp', 'execlpe', 'execv', 'execvp', 'execvpe', 'fork', 'forkpty', 'kill', 'killpg'):
    if hasattr(_o, _n):
        setattr(_o, _n, _blocked)
for _n in ('load', 'loads', 'dump', 'dumps'):
    setattr(_p, _n, _blocked)
del _o, _p, _n, _blocked`;

export interface SandboxConfig {
  image: string;
  timeout: number;
  memoryLimit: number;
  cpuLimit: number;
  maxOutputSize: number;
  pidsLimit: number;
  tmpfsSize: number;
}

export interface SandboxResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  timeout?: boolean;
  /** 容器 /output 目录收集到的产物文件（P1E-6；超时被杀时不收集）。 */
  artifacts?: CollectedArtifact[];
}

export class SandboxController {
  private docker: Docker;
  private config: SandboxConfig;

  constructor(config?: Partial<SandboxConfig>) {
    // Windows: //./pipe/docker_engine, Linux: /var/run/docker.sock
    const socketPath = process.platform === 'win32'
      ? '//./pipe/docker_engine'
      : '/var/run/docker.sock';

    this.docker = new Docker({ socketPath });
    this.config = {
      image: 'openscience-sandbox:latest',
      timeout: 30_000,              // 30 seconds (Spec §10.3)
      memoryLimit: 1024 * 1024 * 1024, // 1 GB (Spec §10.3)
      cpuLimit: 1_000_000_000,      // 1.0 CPU (Spec §10.3)
      maxOutputSize: 1024 * 1024,   // 1 MB (Spec §10.3)
      pidsLimit: 64,                // Process limit (Spec §10.3)
      tmpfsSize: 100 * 1024 * 1024, // 100 MB /tmp (Spec §10.3)
      ...config
    };
  }

  async execute(script: string): Promise<SandboxResult> {
    let container: Docker.Container | null = null;

    try {
      // Create container with security constraints
      container = await this.docker.createContainer(
        this.createContainerConfig(script)
      );

      // Start container
      await container.start();

      // Wait for completion with timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), this.config.timeout)
      );

      const waitPromise = container.wait();

      let result: { StatusCode: number };

      try {
        result = await Promise.race([waitPromise, timeoutPromise]);
      } catch (error) {
        if (error instanceof Error && error.message === 'TIMEOUT') {
          // Kill container on timeout
          await container.kill().catch(() => {});
          return {
            success: false,
            error: 'Script execution timed out (30s limit)',
            timeout: true
          };
        }
        throw error;
      }

      // Collect output
      const output = await this.collectOutput(container);

      // Collect artifacts from /output（P1E-6 产物闭环：脚本约定写入 /output，执行完收集落库）
      const artifacts = await collectArtifacts(container);

      return {
        success: result.StatusCode === 0,
        output: result.StatusCode === 0 ? output : undefined,
        error: result.StatusCode !== 0 ? output : undefined,
        exitCode: result.StatusCode,
        timeout: false,
        artifacts
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timeout: false
      };
    } finally {
      // Always remove container (Spec §10.3: 执行完成立即销毁容器)
      if (container) {
        await container.remove({ force: true }).catch(() => {});
      }
    }
  }

  private createContainerConfig(script: string): Docker.ContainerCreateOptions {
    return {
      Image: this.config.image,
      // P1E-8：运行时策略前言 + 用户脚本同进程执行（见 RUNTIME_POLICY_PREAMBLE 注释）
      Cmd: ['python3', '-c', RUNTIME_POLICY_PREAMBLE + '\n' + script],

      // User: non-root (Spec §10.3 非 root)
      User: 'sandbox',  // UID 1000 from P1E-3 Dockerfile

      // Environment (Spec §10.3 不注入数据库凭据)
      Env: [
        'PYTHONUNBUFFERED=1',
        'MPLBACKEND=Agg',  // Force non-interactive backend
        'OUTPUT_DIR=/output'  // P1E-6 产物目录约定（脚本据此写产物）
      ],

      HostConfig: {
        // Memory limits (Spec §10.3 1 GB 内存)
        Memory: this.config.memoryLimit,
        MemorySwap: this.config.memoryLimit,  // Disable swap

        // CPU limit (Spec §10.3 单核 CPU)
        NanoCpus: this.config.cpuLimit,

        // Process limit (Spec §10.3 进程数上限)
        PidsLimit: this.config.pidsLimit,

        // Filesystem isolation (Spec §10.3 只读根 FS + 临时目录)
        ReadonlyRootfs: true,
        Tmpfs: {
          '/tmp': `size=${this.config.tmpfsSize},noexec`,  // 100MB, no execute
          '/output': `size=${this.config.tmpfsSize}`       // P1E-6 产物目录（约定：脚本写产物到此）
        },

        // Network isolation (Spec §10.3 禁止公网/内网/云元数据访问)
        NetworkMode: 'none',

        // Security constraints
        CapDrop: ['ALL'],                       // Drop all capabilities
        SecurityOpt: ['no-new-privileges'],     // Prevent privilege escalation

        // Prevent host mounts (Spec §10.3 禁止挂载宿主目录与 Docker Socket)
        Binds: [],
        Mounts: []
      }
    };
  }

  private async collectOutput(container: Docker.Container): Promise<string> {
    try {
      const stream = await container.logs({
        stdout: true,
        stderr: true,
        tail: 10000  // Limit log lines to prevent infinite output
      });

      // Convert Buffer/stream to string
      let output = stream.toString('utf8');

      // Enforce max output size (Spec §10.3 输出大小上限)
      if (output.length > this.config.maxOutputSize) {
        output = output.slice(0, this.config.maxOutputSize) +
          '\n... (output truncated at 1MB limit)';
      }

      return output;
    } catch {
      return '';
    }
  }
}
