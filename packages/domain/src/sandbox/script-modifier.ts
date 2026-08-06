/**
 * P1E-7 临时 stub: 简单关键词匹配修改脚本
 * TODO: P1D-2 后替换为 Hermes Gateway 调用
 *
 * 当前实现：基于简单关键词匹配和正则替换
 * - 颜色修改 (red/blue/green/yellow)
 * - 标题添加/修改 (title)
 * - 坐标轴标签 (xlabel/ylabel)
 * - 线型修改 (linestyle/linewidth)
 *
 * 局限性：
 * - 无语义理解，仅字符串匹配
 * - 无上下文分析，可能误匹配
 * - 不支持复杂修改（如添加新图层、改变数据）
 */

export function modifyScriptStub(originalScript: string, prompt: string): string {
  let modified = originalScript;
  const promptLower = prompt.toLowerCase();

  // 颜色修改
  const colorMap: Record<string, string> = {
    red: 'red',
    blue: 'blue',
    green: 'green',
    yellow: 'yellow',
    orange: 'orange',
    purple: 'purple',
    black: 'black',
    '红色': 'red',
    '蓝色': 'blue',
    '绿色': 'green',
    '黄色': 'yellow',
    '橙色': 'orange',
    '紫色': 'purple',
    '黑色': 'black',
  };

  for (const [keyword, color] of Object.entries(colorMap)) {
    if (promptLower.includes(keyword)) {
      // 匹配 color='...' 或 color="..."
      const colorPattern = /color\s*=\s*['"][^'"]*['"]/g;
      if (colorPattern.test(modified)) {
        modified = modified.replace(colorPattern, `color='${color}'`);
      } else {
        // 如果没有 color 参数，尝试在 plot 调用中添加
        modified = modified.replace(
          /(plt\.plot\s*\([^,)]+)/g,
          `$1, color='${color}'`
        );
      }
      break; // 只处理第一个匹配的颜色
    }
  }

  // 标题修改
  if (promptLower.includes('title') || promptLower.includes('标题')) {
    // 尝试提取引号内的标题文本
    const titleMatch = prompt.match(/title\s*['"`]([^'"`]+)['"`]/i) ||
                       prompt.match(/标题\s*['"`]([^'"`]+)['"`]/) ||
                       prompt.match(/['"`]([^'"`]+)['"`]/) ||
                       null;

    const titleText = titleMatch ? titleMatch[1] : 'Modified Visualization';

    if (modified.includes('plt.title')) {
      // 替换现有标题
      modified = modified.replace(
        /plt\.title\s*\([^)]*\)/g,
        `plt.title('${titleText}')`
      );
    } else {
      // 在 plot 调用后添加标题
      modified = modified.replace(
        /(plt\.plot\s*\([^)]+\))/,
        `$1\nplt.title('${titleText}')`
      );
    }
  }

  // X 轴标签修改
  if (promptLower.includes('xlabel') || promptLower.includes('x轴') || promptLower.includes('x-axis')) {
    const labelMatch = prompt.match(/xlabel\s*['"`]([^'"`]+)['"`]/i) ||
                      prompt.match(/x轴\s*['"`]([^'"`]+)['"`]/) ||
                      prompt.match(/x-axis\s*['"`]([^'"`]+)['"`]/i);

    if (labelMatch) {
      const labelText = labelMatch[1];
      if (modified.includes('plt.xlabel')) {
        modified = modified.replace(
          /plt\.xlabel\s*\([^)]*\)/g,
          `plt.xlabel('${labelText}')`
        );
      } else {
        modified = modified.replace(
          /(plt\.plot\s*\([^)]+\))/,
          `$1\nplt.xlabel('${labelText}')`
        );
      }
    }
  }

  // Y 轴标签修改
  if (promptLower.includes('ylabel') || promptLower.includes('y轴') || promptLower.includes('y-axis')) {
    const labelMatch = prompt.match(/ylabel\s*['"`]([^'"`]+)['"`]/i) ||
                      prompt.match(/y轴\s*['"`]([^'"`]+)['"`]/) ||
                      prompt.match(/y-axis\s*['"`]([^'"`]+)['"`]/i);

    if (labelMatch) {
      const labelText = labelMatch[1];
      if (modified.includes('plt.ylabel')) {
        modified = modified.replace(
          /plt\.ylabel\s*\([^)]*\)/g,
          `plt.ylabel('${labelText}')`
        );
      } else {
        modified = modified.replace(
          /(plt\.plot\s*\([^)]+\))/,
          `$1\nplt.ylabel('${labelText}')`
        );
      }
    }
  }

  // 线型修改
  if (promptLower.includes('dashed') || promptLower.includes('虚线')) {
    modified = modified.replace(
      /linestyle\s*=\s*['"][^'"]*['"]/g,
      "linestyle='--'"
    );
    if (!modified.includes('linestyle')) {
      modified = modified.replace(
        /(plt\.plot\s*\([^,)]+)/g,
        "$1, linestyle='--'"
      );
    }
  } else if (promptLower.includes('dotted') || promptLower.includes('点线')) {
    modified = modified.replace(
      /linestyle\s*=\s*['"][^'"]*['"]/g,
      "linestyle=':'"
    );
    if (!modified.includes('linestyle')) {
      modified = modified.replace(
        /(plt\.plot\s*\([^,)]+)/g,
        "$1, linestyle=':'"
      );
    }
  } else if (promptLower.includes('solid') || promptLower.includes('实线')) {
    modified = modified.replace(
      /linestyle\s*=\s*['"][^'"]*['"]/g,
      "linestyle='-'"
    );
  }

  // 线宽修改
  const widthMatch = prompt.match(/width\s*(\d+)/i) ||
                     prompt.match(/线宽\s*(\d+)/) ||
                     prompt.match(/linewidth\s*(\d+)/i);
  if (widthMatch) {
    const width = widthMatch[1];
    if (modified.includes('linewidth')) {
      modified = modified.replace(
        /linewidth\s*=\s*\d+/g,
        `linewidth=${width}`
      );
    } else {
      modified = modified.replace(
        /(plt\.plot\s*\([^,)]+)/g,
        `$1, linewidth=${width}`
      );
    }
  }

  // 标注修改来源（如果有修改）
  if (modified !== originalScript) {
    const header = `# Modified by stub AI logic\n# User request: ${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}\n\n`;
    modified = header + modified;
  }

  return modified;
}
