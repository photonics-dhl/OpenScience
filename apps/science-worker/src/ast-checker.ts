/**
 * P1E-2: Python AST Policy Checker (Node.js Wrapper)
 * 通过 child_process 调用 Python 脚本，检查生成的可视化脚本是否安全
 */
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface PolicyViolation {
  line: number;
  message: string;
  code: string;
}

export interface ASTCheckResult {
  valid: boolean;
  violations: PolicyViolation[];
}

/**
 * 检查 Python 脚本是否符合 AST 策略
 * @param script Python 源代码
 * @returns 检查结果
 * @throws 如果 Python 进程失败或返回非法 JSON
 */
export async function checkPythonAST(script: string): Promise<ASTCheckResult> {
  const scriptPath = join(__dirname, '..', 'scripts', 'check_ast.py');

  return new Promise((resolve, reject) => {
    const python = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python AST checker exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout) as ASTCheckResult;
        resolve(result);
      } catch {
        reject(new Error(`Failed to parse AST checker output: ${stdout}`));
      }
    });

    python.on('error', (err) => {
      reject(new Error(`Failed to spawn Python AST checker: ${err.message}`));
    });

    // 将脚本内容写入 stdin
    python.stdin.write(script);
    python.stdin.end();
  });
}

/**
 * 验证脚本是否安全（快捷方法）
 * @param script Python 源代码
 * @returns 如果合法则返回 true，否则抛出错误
 * @throws 如果脚本包含策略违规
 */
export async function validateScript(script: string): Promise<boolean> {
  const result = await checkPythonAST(script);
  if (!result.valid) {
    const messages = result.violations.map((v) => `L${v.line}: ${v.message}`).join('\n');
    throw new Error(`脚本包含策略违规:\n${messages}`);
  }
  return true;
}
