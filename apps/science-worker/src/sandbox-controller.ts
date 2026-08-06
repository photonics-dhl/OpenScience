import Docker from 'dockerode';

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
      let timedOut = false;

      try {
        result = await Promise.race([waitPromise, timeoutPromise]);
      } catch (error) {
        if (error instanceof Error && error.message === 'TIMEOUT') {
          timedOut = true;
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

      return {
        success: result.StatusCode === 0,
        output: result.StatusCode === 0 ? output : undefined,
        error: result.StatusCode !== 0 ? output : undefined,
        exitCode: result.StatusCode,
        timeout: false
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
      Cmd: ['python3', '-c', script],

      // User: non-root (Spec §10.3 非 root)
      User: 'sandbox',  // UID 1000 from P1E-3 Dockerfile

      // Environment (Spec §10.3 不注入数据库凭据)
      Env: [
        'PYTHONUNBUFFERED=1',
        'MPLBACKEND=Agg'  // Force non-interactive backend
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
          '/tmp': `size=${this.config.tmpfsSize},noexec`  // 100MB, no execute
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
    } catch (error) {
      return '';
    }
  }
}
