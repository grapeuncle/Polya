/** 步骤卡片内划词选区检测与定位。 */

const MIN_SELECTION_LEN = 2;

function normalizeSelectionText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function nodeInMarkdownArea(node: Node | null, container: HTMLElement): boolean {
  if (!node) {
    return false;
  }
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  if (!el) {
    return false;
  }
  const markdownBodies = container.querySelectorAll('.markdown-body');
  for (const body of markdownBodies) {
    if (body.contains(el)) {
      return true;
    }
  }
  return false;
}

export interface TextSelectionResult {
  text: string;
  rect: DOMRect;
}

/** 获取容器内 markdown 区域的有效划词选区。 */
export function getTextSelectionInContainer(container: HTMLElement): TextSelectionResult | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    return null;
  }

  const range = sel.getRangeAt(0);
  if (
    !nodeInMarkdownArea(range.startContainer, container) ||
    !nodeInMarkdownArea(range.endContainer, container)
  ) {
    return null;
  }

  const text = normalizeSelectionText(sel.toString());
  if (text.length < MIN_SELECTION_LEN) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  return { text, rect };
}

/** 清除当前划词选区。 */
export function clearTextSelection(): void {
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
  }
}

/** 计算迷你工具条固定定位坐标。 */
export function calcToolbarPosition(
  rect: DOMRect,
  toolbarW = 200,
  toolbarH = 36
): { top: number; left: number } {
  const margin = 8;
  let top = rect.top - toolbarH - margin;
  let left = rect.left + rect.width / 2 - toolbarW / 2;

  if (top < margin) {
    top = rect.bottom + margin;
  }
  if (left < margin) {
    left = margin;
  }
  if (left + toolbarW > window.innerWidth - margin) {
    left = window.innerWidth - toolbarW - margin;
  }
  if (top + toolbarH > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - toolbarH - margin);
  }

  return { top, left };
}
