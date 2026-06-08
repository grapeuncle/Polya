// Markdown + LaTeX + Mermaid 的统一渲染组件。
import React from 'react';
import { extractMermaid, renderMarkdown } from './markdown';
import { Mermaid } from './Mermaid';

export const MarkdownView: React.FC<{ content: string; className?: string }> = ({
  content,
  className,
}) => {
  const { mermaid, rest } = extractMermaid(content);
  return (
    <div className={`markdown-body ${className ?? ''}`}>
      {rest && <div dangerouslySetInnerHTML={{ __html: renderMarkdown(rest) }} />}
      {mermaid && <Mermaid code={mermaid} />}
    </div>
  );
};
