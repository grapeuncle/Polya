// Webview React 应用入口：注入样式并挂载 App。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// CSS 通过 esbuild 的 text loader 以字符串导入，再注入 <style>，避免额外资源文件。
import styles from './styles.css';

const styleEl = document.createElement('style');
styleEl.textContent = styles as unknown as string;
document.head.appendChild(styleEl);

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
