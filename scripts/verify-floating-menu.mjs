/**
 * 验证浮动菜单相关逻辑：构建产物、定位算法。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const webviewJs = path.join(root, 'dist', 'webview.js');

let failed = 0;
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  failed++;
  console.error(`  ✗ ${msg}`);
}

console.log('=== 浮动菜单验证 ===\n');

if (!fs.existsSync(webviewJs)) {
  fail('dist/webview.js 不存在，请先运行 node esbuild.js');
  process.exit(1);
}
ok('dist/webview.js 已构建');

const src = fs.readFileSync(webviewJs, 'utf8');
if (src.includes('.step-card, .floating-menu')) {
  ok('body 点击排除逻辑已打入构建产物');
} else {
  fail('body 点击排除逻辑未找到');
}

if (src.includes('floating-menu')) {
  ok('FloatingMenu 样式类已打包');
} else {
  fail('floating-menu 未找到');
}

if (!src.includes('floating-menu-portal')) {
  ok('已改为内联渲染（无 portal 定位）');
} else {
  fail('仍在使用 floating-menu-portal');
}

if (src.includes('selectedStepId')) {
  ok('selectedStepId 状态已打包');
} else {
  fail('selectedStepId 状态未找到');
}

// 定位算法（Portal 模式下的问题复现）
function calcMenuPos(cardRect, menuW, viewportW) {
  let left = cardRect.right + 8;
  if (left + menuW > viewportW - 8) {
    left = cardRect.left - menuW - 8;
  }
  if (left < 8) {
    left = 8;
  }
  return { top: Math.max(8, cardRect.top), left };
}

// 模拟：左侧栏 300px + 主栏卡片（典型 VS Code 分栏宽度 ~720px）
const typical = calcMenuPos({ top: 200, left: 316, right: 680 }, 320, 720);
const gapFromCard = Math.abs(typical.left - 316);
if (typical.left === 8 && gapFromCard > 200) {
  ok(`典型布局 Portal 定位会偏离卡片 ${gapFromCard}px（left=${typical.left}）→ 改为内联渲染`);
} else {
  ok(`典型布局 Portal 定位 left=${typical.left}`);
}

console.log(`\n汇总: ${failed === 0 ? '全部通过' : `${failed} 项失败`}`);
process.exit(failed > 0 ? 1 : 0);
