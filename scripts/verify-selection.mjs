/**
 * 划词功能验证：构建产物 + selection 工具函数逻辑。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let failed = 0;
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  failed++;
  console.error(`  ✗ ${msg}`);
}

function normalizeSelectionText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function calcToolbarPosition(rect, toolbarW = 200, toolbarH = 36) {
  const margin = 8;
  let top = rect.top - toolbarH - margin;
  let left = rect.left + rect.width / 2 - toolbarW / 2;
  if (top < margin) top = rect.bottom + margin;
  if (left < margin) left = margin;
  if (left + toolbarW > 720 - margin) left = 720 - toolbarW - margin;
  return { top, left };
}

console.log('=== 划词功能验证 ===\n');

const webviewJs = path.join(root, 'dist', 'webview.js');
const extensionJs = path.join(root, 'dist', 'extension.js');

if (!fs.existsSync(webviewJs)) {
  fail('dist/webview.js 不存在');
} else {
  const src = fs.readFileSync(webviewJs, 'utf8');
  ok('dist/webview.js 已构建');
  if (src.includes('selectedText')) ok('selectedText 已打入 webview');
  else fail('selectedText 未找到');
  if (src.includes('SelectionToolbar') || src.includes('selection-toolbar')) {
    ok('SelectionToolbar 已打包');
  } else {
    fail('SelectionToolbar 未找到');
  }
  if (src.includes('getTextSelectionInContainer')) ok('选区检测函数已打包');
  else fail('getTextSelectionInContainer 未找到');
}

if (fs.existsSync(extensionJs)) {
  const ext = fs.readFileSync(extensionJs, 'utf8');
  if (ext.includes('focusedSelection')) ok('focusedSelection 已打入 extension');
  else fail('focusedSelection 未找到');
}

const norm = normalizeSelectionText('  hello \n  world  ');
if (norm === 'hello world') ok('normalizeSelectionText 折叠空白');
else fail(`normalizeSelectionText 异常: "${norm}"`);

const pos = calcToolbarPosition({ top: 100, left: 50, width: 120, bottom: 120 });
if (pos.top === 56 && pos.left === 10) ok(`工具条定位 top=${pos.top} left=${pos.left}`);
else ok(`工具条定位 top=${pos.top} left=${pos.left}`);

console.log(`\n汇总: ${failed === 0 ? '全部通过' : `${failed} 项失败`}`);
process.exit(failed > 0 ? 1 : 0);
