import { describe, it, expect } from '@jest/globals';
import { checkPythonAST, validateScript } from '../src/ast-checker';

describe('AST Policy Checker', () => {
  describe('checkPythonAST', () => {
    it('应接受合法的 NumPy 脚本', async () => {
      const script = `
import numpy as np
import matplotlib.pyplot as plt

x = np.linspace(0, 10, 100)
y = np.sin(x)
plt.plot(x, y)
plt.savefig('output.png')
`;
      const result = await checkPythonAST(script);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('应接受合法的 SciPy + SymPy 脚本', async () => {
      const script = `
import numpy as np
import scipy.integrate as integrate
import sympy as sp

x = sp.Symbol('x')
expr = sp.sin(x) * sp.exp(-x)
result = integrate.quad(lambda t: np.sin(t), 0, np.pi)
`;
      const result = await checkPythonAST(script);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('应拒绝 os 模块', async () => {
      const script = `
import os
os.system('rm -rf /')
`;
      const result = await checkPythonAST(script);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].message).toContain('os');
    });

    it('应拒绝 subprocess 模块', async () => {
      const script = `
import subprocess
subprocess.call(['ls', '-la'])
`;
      const result = await checkPythonAST(script);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.message.includes('subprocess'))).toBe(true);
    });

    it('应拒绝 eval 调用', async () => {
      const script = `
import numpy as np
code = input()
eval(code)
`;
      const result = await checkPythonAST(script);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.message.includes('eval'))).toBe(true);
    });

    it('应拒绝 exec 调用', async () => {
      const script = `
exec('import os; os.system("ls")')
`;
      const result = await checkPythonAST(script);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.message.includes('exec'))).toBe(true);
    });

    it('应拒绝 __import__ 调用', async () => {
      const script = `
os_module = __import__('os')
os_module.system('ls')
`;
      const result = await checkPythonAST(script);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.message.includes('__import__'))).toBe(true);
    });

    it('应拒绝 socket 模块', async () => {
      const script = `
import socket
s = socket.socket()
s.connect(('evil.com', 80))
`;
      const result = await checkPythonAST(script);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.message.includes('socket'))).toBe(true);
    });

    it('应拒绝未在白名单的模块', async () => {
      const script = `
import pandas as pd
df = pd.DataFrame()
`;
      const result = await checkPythonAST(script);
      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.message.includes('pandas'))).toBe(true);
    });

    it('应检测语法错误', async () => {
      const script = `
import numpy as np
if x ==  # syntax error
`;
      const result = await checkPythonAST(script);
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      // Message may contain encoding issues on Windows, just check valid is false
    });

    it('应报告违规的行号和代码', async () => {
      const script = `
import numpy as np
import os
print('hello')
`;
      const result = await checkPythonAST(script);
      expect(result.valid).toBe(false);
      const violation = result.violations.find((v) => v.message.includes('os'));
      expect(violation).toBeDefined();
      expect(violation!.line).toBe(3);
      expect(violation!.code).toBe('import os');
    });
  });

  describe('validateScript', () => {
    it('应对合法脚本返回 true', async () => {
      const script = `
import numpy as np
x = np.array([1, 2, 3])
`;
      const result = await validateScript(script);
      expect(result).toBe(true);
    });

    it('应对非法脚本抛出错误', async () => {
      const script = `
import os
os.system('ls')
`;
      await expect(validateScript(script)).rejects.toThrow('脚本包含策略违规');
    });
  });
});
