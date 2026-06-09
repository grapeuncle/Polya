/**
 * 复制 KaTeX / Codicons / Mermaid 到 public/media，供 Vite 与生产静态服务使用。
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'public', 'media');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyKatex() {
  const katexDist = path.dirname(require.resolve('katex/package.json'));
  const srcCss = path.join(katexDist, 'dist', 'katex.min.css');
  const srcFonts = path.join(katexDist, 'dist', 'fonts');
  ensureDir(outDir);
  if (fs.existsSync(srcCss)) {
    fs.copyFileSync(srcCss, path.join(outDir, 'katex.min.css'));
  }
  if (fs.existsSync(srcFonts)) {
    const fontsOut = path.join(outDir, 'fonts');
    ensureDir(fontsOut);
    for (const f of fs.readdirSync(srcFonts)) {
      fs.copyFileSync(path.join(srcFonts, f), path.join(fontsOut, f));
    }
  }
}

function copyMermaid() {
  try {
    const mermaidDist = path.dirname(require.resolve('mermaid/package.json'));
    const src = path.join(mermaidDist, 'dist', 'mermaid.min.js');
    ensureDir(outDir);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outDir, 'mermaid.min.js'));
    }
  } catch {
    console.warn('[copy-media] 未找到 mermaid');
  }
}

function copyCodicons() {
  try {
    const codiconDir = path.dirname(require.resolve('@vscode/codicons/package.json'));
    ensureDir(outDir);
    for (const f of ['codicon.css', 'codicon.ttf']) {
      const src = path.join(codiconDir, 'dist', f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(outDir, f));
      }
    }
  } catch {
    console.warn('[copy-media] 未找到 codicons');
  }
}

ensureDir(outDir);
copyKatex();
copyCodicons();
copyMermaid();
console.log('[copy-media] 资源已复制到 public/media');
