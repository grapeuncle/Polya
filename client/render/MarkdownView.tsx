// Markdown + LaTeX + Mermaid 的统一渲染组件。
import React, { useMemo } from 'react';
import { extractMermaid, renderMarkdown } from './markdown';
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

export const MarkdownView: React.FC<{ content: string; className?: string }> = React.memo(
  ({ content, className }) => {
    const safe = toMarkdownString(content);
    const { mermaid, rest } = useMemo(() => extractMermaid(safe), [safe]);
    const html = useMemo(() => (rest ? renderMarkdown(rest) : ''), [rest]);
    return (
      <div className={`markdown-body ${className ?? ''}`}>
        {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : null}
        {mermaid ? <Mermaid code={mermaid} /> : null}
      </div>
    );
  }
);
MarkdownView.displayName = 'MarkdownView';
