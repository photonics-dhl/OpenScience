import { describe, it, expect, beforeAll } from '@jest/globals';
import { SandboxController } from '../src/sandbox-controller';

describe('Sandbox Security Tests (Spec §21.1 安全测试层)', () => {
  let controller: SandboxController;

  beforeAll(() => {
    controller = new SandboxController();
  });

  describe('Network Isolation (Spec §10.3 禁止公网/内网/云元数据访问)', () => {
    it('[Test 1] should block public internet access', async () => {
      const script = `
import socket
try:
    socket.create_connection(('8.8.8.8', 53), timeout=5)
    print('FAIL: Public internet access allowed')
except Exception as e:
    print('PASS: Public internet blocked')
`;

      const result = await controller.execute(script);
      expect(result.output).toContain('PASS: Public internet blocked');
    }, 40000);

    it('[Test 2] should block cloud metadata access', async () => {
      const script = `
import http.client
try:
    conn = http.client.HTTPConnection('169.254.169.254', timeout=5)
    conn.request('GET', '/latest/meta-data/')
    print('FAIL: Cloud metadata access allowed')
except Exception as e:
    print('PASS: Cloud metadata blocked')
`;

      const result = await controller.execute(script);
      expect(result.output).toContain('PASS: Cloud metadata blocked');
    }, 40000);

    it('[Test 3] should block internal network access', async () => {
      const script = `
import socket
try:
    socket.create_connection(('172.18.0.2', 5432), timeout=5)
    print('FAIL: Internal network access allowed')
except Exception as e:
    print('PASS: Internal network blocked')
`;

      const result = await controller.execute(script);
      expect(result.output).toContain('PASS: Internal network blocked');
    }, 40000);
  });

  describe('Resource Limits (Spec §10.3 资源限制)', () => {
    it('[Test 4] should enforce memory limit (1 GB)', async () => {
      const script = `
import numpy as np
try:
    # Try to allocate 2 GB (should fail with 1 GB limit)
    # 修正：np.zeros 走 calloc 惰性零页，不写页就不占 RSS、永远不会触发 OOM；
    # 必须实际写入（fill）把 2GB 提交进物理内存，cgroup 1GB 限制才会杀伤进程
    huge_array = np.zeros((256, 1024, 1024), dtype=np.float64)
    huge_array.fill(1.0)
    print('FAIL: Memory limit not enforced')
except MemoryError:
    print('PASS: Memory limit enforced')
except Exception as e:
    print(f'PASS: Memory allocation blocked ({type(e).__name__})')
`;

      const result = await controller.execute(script);
      // Container may be killed by OOM killer before MemoryError
      expect(
        result.output?.includes('PASS') ||
        result.exitCode !== 0 ||
        result.error?.includes('killed')
      ).toBe(true);
    }, 40000);

    it('[Test 5] should truncate large output (1 MB limit)', async () => {
      const script = `
for i in range(100000):
    print('x' * 100)
`;

      const result = await controller.execute(script);
      expect(result.output).toBeDefined();
      expect(result.output!.length).toBeLessThanOrEqual(1024 * 1024 + 100);
      if (result.output!.length >= 1024 * 1024) {
        expect(result.output).toContain('output truncated');
      }
    }, 40000);

    it('[Test 6] should enforce 30 second timeout', async () => {
      const script = `
import time
time.sleep(60)
print('FAIL: Timeout not enforced')
`;

      const result = await controller.execute(script);
      expect(result.timeout).toBe(true);
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    }, 40000);
  });

  describe('Filesystem Isolation (Spec §10.3 只读根 FS + 临时目录)', () => {
    it('[Test 7] should block writes to root filesystem', async () => {
      const script = `
try:
    with open('/etc/passwd', 'a') as f:
        f.write('hack')
    print('FAIL: Root filesystem writable')
except (PermissionError, OSError) as e:
    print('PASS: Root filesystem read-only')
`;

      const result = await controller.execute(script);
      expect(result.output).toContain('PASS: Root filesystem read-only');
    }, 40000);

    it('[Test 8] should allow /tmp writes but block execution', async () => {
      const script = `
import subprocess
# Test write
try:
    with open('/tmp/test.txt', 'w') as f:
        f.write('ok')
    print('PASS: /tmp writable')
except Exception as e:
    print(f'FAIL: /tmp write blocked ({e})')

# Test noexec
try:
    with open('/tmp/test.sh', 'w') as f:
        f.write('#!/bin/sh\\necho hack')
    subprocess.run(['/tmp/test.sh'], check=True)
    print('FAIL: /tmp execution allowed')
except Exception as e:
    print(f'PASS: /tmp noexec enforced')
`;

      const result = await controller.execute(script);
      expect(result.output).toContain('PASS: /tmp writable');
      expect(result.output).toContain('PASS: /tmp noexec enforced');
    }, 40000);
  });

  describe('Basic Functionality', () => {
    it('should execute valid Python script', async () => {
      const script = `
import numpy as np
x = np.array([1, 2, 3])
print('Sum:', x.sum())
`;

      const result = await controller.execute(script);
      expect(result.success).toBe(true);
      expect(result.output).toContain('Sum: 6');
    }, 40000);

    it('should return error for invalid Python script', async () => {
      const script = `
invalid python syntax here
`;

      const result = await controller.execute(script);
      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
    }, 40000);
  });
});
