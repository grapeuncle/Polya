// 使用 esbuild 同时打包「扩展主进程」和「Webview React 应用」。
// 主进程运行在 Node 环境（target=node），webview 运行在浏览器环境（platform=browser）。
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** 将 KaTeX 的 CSS 与字体复制到 dist/media，供 Webview 离线加载。 */
function copyKatexAssets() {
  const katexDist = path.dirname(require.resolve('katex/package.json'));
  const srcCss = path.join(katexDist, 'dist', 'katex.min.css');
  const srcFonts = path.join(katexDist, 'dist', 'fonts');
  const outDir = path.join(__dirname, 'dist', 'media');
  fs.mkdirSync(outDir, { recursive: true });
  if (fs.existsSync(srcCss)) {
    fs.copyFileSync(srcCss, path.join(outDir, 'katex.min.css'));
  }
  if (fs.existsSync(srcFonts)) {
    const fontsOut = path.join(outDir, 'fonts');
    fs.mkdirSync(fontsOut, { recursive: true });
    for (const f of fs.readdirSync(srcFonts)) {
      fs.copyFileSync(path.join(srcFonts, f), path.join(fontsOut, f));
    }
  }
}

/** 复制 Mermaid 到 dist/media（离线思维导图）。 */
function copyMermaid() {
  let mermaidDist;
  try {
    mermaidDist = path.dirname(require.resolve('mermaid/package.json'));
  } catch {
    console.warn('[esbuild] 未找到 mermaid，思维导图将回退 CDN。');
    return;
  }
  const src = path.join(mermaidDist, 'dist', 'mermaid.min.js');
  const outDir = path.join(__dirname, 'dist', 'media');
  fs.mkdirSync(outDir, { recursive: true });
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(outDir, 'mermaid.min.js'));
  }
}

/** 复制 VS Code Codicons 图标字体与 CSS 到 dist/media。 */
function copyCodicons() {
  let codiconDir;
  try {
    codiconDir = path.dirname(require.resolve('@vscode/codicons/package.json'));
  } catch {
    console.warn('[esbuild] 未找到 @vscode/codicons，跳过图标复制。');
    return;
  }
  const distDir = path.join(codiconDir, 'dist');
  const outDir = path.join(__dirname, 'dist', 'media');
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of ['codicon.css', 'codicon.ttf']) {
    const src = path.join(distDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outDir, f));
    }
  }
}

/** esbuild 插件：构建结束时打印结果，便于在 watch 模式观察。 */
const logPlugin = {
  name: 'log-plugin',
  setup(build) {
    let label = build.initialOptions.outfile || 'bundle';
    build.onEnd((result) => {
      const ok = result.errors.length === 0;
      console.log(
        `[esbuild] ${path.basename(label)} ${ok ? '构建成功' : '构建失败'} ` +
          `(errors: ${result.errors.length}, warnings: ${result.warnings.length})`
      );
    });
  },
};

const common = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
  plugins: [logPlugin],
};

/** 扩展主进程配置。 */
const extensionConfig = {
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
};

/** Webview React 应用配置。 */
const webviewConfig = {
  ...common,
  entryPoints: ['src/webview/index.tsx'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  loader: {
    '.css': 'text',
    '.ttf': 'dataurl',
    '.woff': 'dataurl',
    '.woff2': 'dataurl',
  },
};

async function main() {
  copyKatexAssets();
  copyCodicons();
  copyMermaid();
  if (watch) {
    const ctxExt = await esbuild.context(extensionConfig);
    const ctxWeb = await esbuild.context(webviewConfig);
    await Promise.all([ctxExt.watch(), ctxWeb.watch()]);
    console.log('[esbuild] watch 模式已启动...');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
    ]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
