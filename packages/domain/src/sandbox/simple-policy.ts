/**
 * P1E-7 简化版策略检查（黑名单 import）
 * TODO: P1E-3 完整 AST 分析后替换
 *
 * 临时方案：检测 Spec §10.3 禁止的模块和函数
 * - 禁止网络访问模块 (os, subprocess, socket, requests, urllib, http, etc.)
 * - 禁止动态执行 (eval, exec, compile, __import__)
 *
 * 局限性：
 * - 无法检测动态导入（如 `__import__('os'.replace('o', 'o'))`）
 * - 无法检测代码混淆
 * - 无法检测语义级逃逸（如利用合法库的漏洞）
 */

export interface PolicyCheckResult {
  allowed: boolean;
  violations: string[];
}

export function checkPythonScript(script: string): PolicyCheckResult {
  const violations: string[] = [];

  // Spec §10.3 禁止模块
  const forbiddenModules = [
    'os',
    'subprocess',
    'socket',
    'ctypes',
    'requests',
    'urllib',
    'urllib2',
    'urllib3',
    'http',
    'ftplib',
    'telnetlib',
    'smtplib',
    'socketserver',
    'asyncio',
  ];

  // 禁止动态执行函数
  const forbiddenFunctions = [
    '__import__',
    'eval',
    'exec',
    'compile',
  ];

  // 检查 import 语句（标准格式）
  for (const module of forbiddenModules) {
    const patterns = [
      // import os
      new RegExp(`^\\s*import\\s+${module}\\b`, 'm'),
      // from os import ...
      new RegExp(`^\\s*from\\s+${module}\\s+import`, 'm'),
      // from os.path import ...
      new RegExp(`^\\s*from\\s+${module}\\.`, 'm'),
    ];

    for (const pattern of patterns) {
      if (pattern.test(script)) {
        violations.push(`Forbidden module: ${module}`);
        break; // 同一模块只报告一次
      }
    }
  }

  // 检查禁止函数调用
  for (const func of forbiddenFunctions) {
    // 匹配函数调用格式: func(
    if (new RegExp(`\\b${func}\\s*\\(`).test(script)) {
      violations.push(`Forbidden function: ${func}`);
    }
  }

  // 检查 __import__ 隐式调用（字符串参数）
  const importCallMatch = script.match(/__import__\s*\(\s*['"`]([^'"`]+)['"`]/);
  if (importCallMatch) {
    const targetModule = importCallMatch[1];
    if (forbiddenModules.includes(targetModule)) {
      violations.push(`Forbidden module via __import__: ${targetModule}`);
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}
