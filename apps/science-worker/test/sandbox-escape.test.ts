import { describe, it, expect, beforeAll } from '@jest/globals';
import { SandboxController } from '../src/sandbox-controller';

/**
 * P1E-8 沙箱逃逸基线测试（新增）
 *
 * 目的：尝试各种容器逃逸和策略绕过手段，验证防御措施有效
 * 依据：Spec §10.3, §21.1, 威胁模型文档
 *
 * 测试策略：
 * - 容器逃逸组（4 项）：Docker socket / 特权提升 / capabilities / 设备节点
 * - 策略绕过组（4 项）：动态导入 / Base64 / 字符串拼接 / 库漏洞
 *
 * 预期结果：所有攻击均被阻断，测试返回 PASS 或执行失败（exitCode !== 0）
 */
describe('Sandbox Escape Baseline Tests (P1E-8)', () => {
  let controller: SandboxController;

  beforeAll(() => {
    controller = new SandboxController();
  });

  describe('Container Escape Attempts (容器逃逸尝试)', () => {
    it('[Test 9] should block Docker socket access', async () => {
      const script = `
import os
try:
    # Try to access Docker socket
    if os.path.exists('/var/run/docker.sock'):
        print('FAIL: Docker socket accessible')
    else:
        print('PASS: Docker socket not mounted')
except Exception as e:
    print(f'PASS: Docker socket access blocked ({type(e).__name__})')
`;

      const result = await controller.execute(script);
      expect(result.output).toContain('PASS: Docker socket not mounted');
    }, 40000);

    it('[Test 10] should block privilege escalation attempts', async () => {
      const script = `
import subprocess
import os

# Test sudo
try:
    subprocess.run(['sudo', '-n', 'whoami'], check=True, capture_output=True)
    print('FAIL: sudo command available')
except (FileNotFoundError, PermissionError, subprocess.CalledProcessError):
    print('PASS: sudo blocked')

# Test su
try:
    subprocess.run(['su', 'root'], check=True, capture_output=True, input=b'\\n')
    print('FAIL: su command available')
except (FileNotFoundError, PermissionError, subprocess.CalledProcessError):
    print('PASS: su blocked')

# Test /proc/sys writes (requires root)
try:
    with open('/proc/sys/kernel/hostname', 'w') as f:
        f.write('hacked')
    print('FAIL: proc/sys writable')
except (PermissionError, OSError):
    print('PASS: proc/sys read-only')
`;

      const result = await controller.execute(script);
      expect(result.output).toContain('PASS: sudo blocked');
      expect(result.output).toContain('PASS: su blocked');
      expect(result.output).toContain('PASS: proc/sys read-only');
    }, 40000);

    it('[Test 11] should block capabilities abuse', async () => {
      const script = `
import subprocess

# Test raw sockets (requires CAP_NET_RAW)
try:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_ICMP)
    s.close()
    print('FAIL: RAW socket creation allowed (CAP_NET_RAW present)')
except (PermissionError, OSError):
    print('PASS: RAW socket blocked (CAP_NET_RAW dropped)')

# Test chroot (requires CAP_SYS_CHROOT)
try:
    import os
    os.chroot('/tmp')
    print('FAIL: chroot allowed (CAP_SYS_CHROOT present)')
except (PermissionError, OSError):
    print('PASS: chroot blocked (CAP_SYS_CHROOT dropped)')
`;

      const result = await controller.execute(script);
      expect(result.output).toContain('PASS: RAW socket blocked');
      expect(result.output).toContain('PASS: chroot blocked');
    }, 40000);

    it('[Test 12] should block device node creation', async () => {
      const script = `
import os

# Test mknod (create device node)
try:
    os.mknod('/tmp/devhack', 0o600 | os.stat.S_IFBLK, os.makedev(8, 1))
    print('FAIL: mknod allowed (device node created)')
except (PermissionError, OSError):
    print('PASS: mknod blocked')

# Test mounting
try:
    import subprocess
    subprocess.run(['mount', '-t', 'tmpfs', 'tmpfs', '/tmp/mnt'], check=True, capture_output=True)
    print('FAIL: mount command available')
except (FileNotFoundError, PermissionError, subprocess.CalledProcessError):
    print('PASS: mount blocked')
`;

      const result = await controller.execute(script);
      expect(result.output).toContain('PASS: mknod blocked');
      expect(result.output).toContain('PASS: mount blocked');
    }, 40000);
  });

  describe('Policy Bypass Attempts (策略绕过尝试)', () => {
    it('[Test 13] should detect dynamic import obfuscation', async () => {
      const script = `
# Test 1: String concatenation
try:
    module_name = 'o' + 's'
    os_module = __import__(module_name)
    print('INFO: Dynamic import succeeded (policy bypassed)')
    # But network still blocked, so try network operation
    os_module.system('ping -c 1 8.8.8.8')
    print('FAIL: Network command executed')
except Exception as e:
    print(f'PASS: Dynamic import blocked or network isolated ({type(e).__name__})')
`;

      const result = await controller.execute(script);
      // Either policy detects it, or network isolation blocks it
      expect(
        result.output?.includes('PASS') ||
        result.exitCode !== 0 ||
        result.error
      ).toBe(true);
    }, 40000);

    it('[Test 14] should detect Base64 encoded imports', async () => {
      const script = `
import base64

# Try to import os via Base64 encoding
try:
    encoded = base64.b64encode(b'import os').decode()
    decoded = base64.b64decode(encoded).decode()
    # Note: Simply decoding doesn't execute it
    # Would need eval/exec which are also blocked
    print('INFO: Base64 decode succeeded (not executing)')

    # Try eval (should be blocked)
    eval(decoded)
    print('FAIL: eval() executed Base64 payload')
except Exception as e:
    print(f'PASS: eval() blocked or import denied ({type(e).__name__})')
`;

      const result = await controller.execute(script);
      expect(result.output).toContain('PASS');
    }, 40000);

    it('[Test 15] should detect string manipulation bypass', async () => {
      const script = `
# Try getattr(__builtins__, 'eval')
try:
    eval_func = getattr(__builtins__, 'ev' + 'al')
    eval_func('print("FAIL: eval via getattr succeeded")')
except Exception as e:
    print(f'PASS: getattr bypass blocked ({type(e).__name__})')

# Try importing via importlib
try:
    import importlib
    os_module = importlib.import_module('o' + 's')
    print('INFO: importlib succeeded (policy bypassed)')
    os_module.system('whoami')
    print('FAIL: os.system executed')
except Exception as e:
    print(f'PASS: importlib blocked or command failed ({type(e).__name__})')
`;

      const result = await controller.execute(script);
      expect(result.output).toContain('PASS');
    }, 40000);

    it('[Test 16] should block pickle deserialization exploits', async () => {
      const script = `
import pickle
import base64

# Malicious pickle payload that tries to execute os.system
# (simplified example, real exploits use __reduce__)
malicious_payload = b"cos\\nsystem\\n(S'echo FAIL: pickle exploit executed'\\ntR."

try:
    obj = pickle.loads(malicious_payload)
    print(f'FAIL: pickle deserialization executed: {obj}')
except Exception as e:
    print(f'PASS: pickle exploit blocked ({type(e).__name__})')

# Test with more complex payload
try:
    # This would normally execute code via __reduce__
    class Exploit:
        def __reduce__(self):
            import os
            return (os.system, ('echo FAIL: __reduce__ exploit',))

    payload = pickle.dumps(Exploit())
    pickle.loads(payload)
    print('FAIL: __reduce__ exploit executed')
except Exception as e:
    print(f'PASS: __reduce__ exploit blocked ({type(e).__name__})')
`;

      const result = await controller.execute(script);
      expect(result.output).toContain('PASS');
    }, 40000);
  });

  describe('Defense Verification (防御措施验证)', () => {
    it('should enforce all security constraints simultaneously', async () => {
      const script = `
import sys

checks = []

# 1. Network isolation
try:
    import socket
    socket.create_connection(('8.8.8.8', 53), timeout=1)
    checks.append('❌ Network accessible')
except:
    checks.append('✅ Network isolated')

# 2. Read-only filesystem
try:
    with open('/etc/passwd', 'a') as f:
        f.write('hack')
    checks.append('❌ Root FS writable')
except (PermissionError, OSError):
    checks.append('✅ Root FS read-only')

# 3. No Docker socket
import os
if not os.path.exists('/var/run/docker.sock'):
    checks.append('✅ Docker socket not mounted')
else:
    checks.append('❌ Docker socket accessible')

# 4. Non-root user
if os.getuid() != 0:
    checks.append('✅ Running as non-root')
else:
    checks.append('❌ Running as root')

# 5. Limited /tmp
try:
    with open('/tmp/test.txt', 'w') as f:
        f.write('ok')
    checks.append('✅ /tmp writable')
except:
    checks.append('❌ /tmp not writable')

# Print results
for check in checks:
    print(check)

# All should be ✅ except network/docker should be ❌ (blocked)
failed = [c for c in checks if c.startswith('❌') and 'accessible' in c]
if failed:
    print(f'\\nFAIL: Security issues found: {len(failed)}')
else:
    print('\\nPASS: All security constraints enforced')
`;

      const result = await controller.execute(script);
      expect(result.success).toBe(true);
      expect(result.output).toContain('PASS: All security constraints enforced');
      expect(result.output).toContain('✅ Network isolated');
      expect(result.output).toContain('✅ Root FS read-only');
      expect(result.output).toContain('✅ Docker socket not mounted');
      expect(result.output).toContain('✅ Running as non-root');
    }, 40000);
  });
});
