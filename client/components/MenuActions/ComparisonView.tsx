// 并排比较视图。
import React from 'react';
import { ComparisonSpec } from '../../../shared/types';
import { MarkdownView } from '../../render/MarkdownView';

export const ComparisonView: React.FC<{ spec: ComparisonSpec; fallback?: string }> = ({
  spec,
  fallback,
}) => (
  <div className="comparison-grid">
    <div className="comparison-header">
      {spec.columns.map((col) => (
        <div key={col} className="comparison-cell header">
          {col}
        </div>
      ))}
    </div>
    {spec.rows.map((row, i) => (
      <div key={i} className="comparison-row">
        {row.map((cell, j) => (
          <div key={j} className="comparison-cell">
            <MarkdownView content={cell} />
          </div>
        ))}
      </div>
    ))}
    {fallback && (
      <div className="comparison-fallback">
        <MarkdownView content={fallback} />
      </div>
    )}
  </div>
);
