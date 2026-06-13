// Markdown + LaTeX + Mermaid 的统一渲染组件。
import React, { useMemo } from 'react';
import { extractMermaid, renderMarkdown, renderMarkdownRaw } from './markdown';
import { Mermaid } from './Mermaid';

function toMarkdownString(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (content == null) {
    return '';
  }
  return String(content);
}

export const MarkdownView: React.FC<{ content: string; className?: string; raw?: boolean }> = React.memo(
  ({ content, className, raw }) => {
    const safe = toMarkdownString(content);
    const { mermaid, rest } = useMemo(() => extractMermaid(safe), [safe]);
    const html = useMemo(() => (rest ? (raw ? renderMarkdownRaw(rest) : renderMarkdown(rest)) : ''), [rest, raw]);
    return (
      <div className={`markdown-body ${className ?? ''}`}>
        {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : null}
        {mermaid ? <Mermaid code={mermaid} /> : null}
      </div>
    );
  }
);
MarkdownView.displayName = 'MarkdownView';
