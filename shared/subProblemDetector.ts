// 从题目文本中检测并拆分多个子问题（如（1）（2）（3）或(1)(2)(3) 等格式）。
import type { DetectedSubProblem } from './types';

/**
 * 使用正则从题目文本中检测多个子问题标记（中文括号、英文括号、圈号等），
 * 并提取每个子问题的起始位置和文本。
 *
 * 处理流程：
 * 1. 找到所有编号标记的位置
 * 2. 按位置排序并去重
 * 3. 从标记位置切分文本得到每个子问题的内容
 *
 * 注意：如果标记之前有共用题干文本，该文本会被包含在第一个子问题中。
 * 复杂的嵌套子问题可能需要 LLM 辅助解析，正则仅覆盖常见格式。
 */
export function detectSubProblems(problem: string): DetectedSubProblem[] {
  // 匹配中文括号编号：（1）（2）（3）  英文括号编号：(1)(2)(3)  圈号：①②③④⑤⑥⑦⑧⑨⑩
  const cnParen = /（(\d+)）/g;
  const enParen = /\((\d+)\)/g;

  const markers: { index: number; pos: number; label: string }[] = [];

  let m: RegExpExecArray | null;

  while ((m = cnParen.exec(problem)) !== null) {
    const num = parseInt(m[1], 10);
    const pos = m.index;
    // 去重：同一位置只保留一个
    if (!markers.some((mk) => mk.pos === pos)) {
      markers.push({ index: num, pos, label: `（${num}）` });
    }
  }

  while ((m = enParen.exec(problem)) !== null) {
    const num = parseInt(m[1], 10);
    const pos = m.index;
    if (!markers.some((mk) => mk.pos === pos)) {
      markers.push({ index: num, pos, label: `(${num})` });
    }
  }

  // 按位置排序
  markers.sort((a, b) => a.pos - b.pos);

  if (markers.length <= 1) {
    return [];
  }

  // 从标记位置切分文本
  const subProblems: DetectedSubProblem[] = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].pos;
    const end = i + 1 < markers.length ? markers[i + 1].pos : problem.length;
    const text = problem.slice(start, end).trim();
    // 去掉末尾与下一个子问题之间的空白/换行
    const cleaned = text.replace(/[\s\n]+$/, '');
    if (cleaned) {
      subProblems.push({
        index: markers[i].index,
        label: markers[i].label,
        text: cleaned,
      });
    }
  }

  return subProblems;
}
