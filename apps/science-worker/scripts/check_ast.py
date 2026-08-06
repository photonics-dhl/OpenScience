#!/usr/bin/env python3
"""
P1E-2: Python AST Policy Checker
检查生成的 Python 脚本是否包含危险操作，返回 JSON 结果
"""
import ast
import json
import sys
from typing import List, Dict, Any

# 白名单：允许的模块
WHITELIST_MODULES = {
    'numpy', 'np',
    'scipy',
    'sympy',
    'matplotlib', 'pyplot', 'plt',
    'PIL', 'Image',
    'math',
    'typing',
}

# 黑名单：禁止的模块（危险操作）
BLACKLIST_MODULES = {
    'os', 'sys', 'subprocess', 'socket', 'urllib', 'requests',
    'ctypes', 'multiprocessing', 'threading',
    '__import__', 'eval', 'exec', 'compile',
    'open', 'file', 'input', 'raw_input',
    'pickle', 'shelve', 'marshal',
}

# 危险的内置函数名
DANGEROUS_BUILTINS = {
    'eval', 'exec', 'compile', '__import__',
    'open', 'file', 'input', 'raw_input',
    'exit', 'quit',
}


class PolicyViolation:
    """策略违规记录"""
    def __init__(self, line: int, message: str, code: str):
        self.line = line
        self.message = message
        self.code = code

    def to_dict(self) -> Dict[str, Any]:
        return {
            'line': self.line,
            'message': self.message,
            'code': self.code,
        }


class ASTChecker(ast.NodeVisitor):
    """AST 检查器"""
    def __init__(self, source_lines: List[str]):
        self.violations: List[PolicyViolation] = []
        self.source_lines = source_lines

    def add_violation(self, node: ast.AST, message: str):
        line_num = getattr(node, 'lineno', 0)
        code = self.source_lines[line_num - 1].strip() if 0 < line_num <= len(self.source_lines) else ''
        self.violations.append(PolicyViolation(line_num, message, code))

    def visit_Import(self, node: ast.Import):
        """检查 import xxx"""
        for alias in node.names:
            module_name = alias.name.split('.')[0]
            if module_name in BLACKLIST_MODULES:
                self.add_violation(node, f'禁止导入模块: {alias.name}')
            elif module_name not in WHITELIST_MODULES:
                self.add_violation(node, f'未在白名单的模块: {alias.name}')
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        """检查 from xxx import yyy"""
        if node.module:
            module_name = node.module.split('.')[0]
            if module_name in BLACKLIST_MODULES:
                self.add_violation(node, f'禁止导入模块: {node.module}')
            elif module_name not in WHITELIST_MODULES:
                self.add_violation(node, f'未在白名单的模块: {node.module}')
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call):
        """检查函数调用（危险内置函数）"""
        if isinstance(node.func, ast.Name):
            func_name = node.func.id
            if func_name in DANGEROUS_BUILTINS:
                self.add_violation(node, f'禁止调用危险函数: {func_name}()')
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute):
        """检查属性访问（如 os.system）"""
        if isinstance(node.value, ast.Name):
            if node.value.id in BLACKLIST_MODULES:
                self.add_violation(node, f'禁止访问危险模块: {node.value.id}.{node.attr}')
        self.generic_visit(node)


def check_script(source_code: str) -> Dict[str, Any]:
    """
    检查 Python 脚本是否符合策略

    返回:
        {
            "valid": bool,
            "violations": [{"line": int, "message": str, "code": str}, ...]
        }
    """
    try:
        tree = ast.parse(source_code)
    except SyntaxError as e:
        return {
            'valid': False,
            'violations': [{
                'line': e.lineno or 0,
                'message': f'语法错误: {e.msg}',
                'code': e.text.strip() if e.text else '',
            }]
        }
    except Exception as e:
        # 捕获其他异常（如 UnicodeEncodeError）
        return {
            'valid': False,
            'violations': [{
                'line': 0,
                'message': f'解析错误: {type(e).__name__}: {str(e)}',
                'code': '',
            }]
        }

    source_lines = source_code.splitlines()
    checker = ASTChecker(source_lines)
    checker.visit(tree)

    return {
        'valid': len(checker.violations) == 0,
        'violations': [v.to_dict() for v in checker.violations]
    }


def main():
    """从 stdin 读取脚本，输出 JSON 结果到 stdout"""
    if len(sys.argv) > 1:
        # 从文件读取（测试用）
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            source_code = f.read()
    else:
        # 从 stdin 读取（生产用）
        source_code = sys.stdin.read()

    result = check_script(source_code)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
