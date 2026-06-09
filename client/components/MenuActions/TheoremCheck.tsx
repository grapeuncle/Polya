// 定理前提检查清单。
import React from 'react';
import { TheoremCheckItem } from '../../../shared/types';

export const TheoremCheck: React.FC<{
  items: TheoremCheckItem[];
  intro?: string;
}> = ({ items, intro }) => (
  <div className="theorem-check">
    {intro && <p className="tc-intro">{intro}</p>}
    {items.map((item, i) => (
      <div key={i} className={`tc-item ${item.satisfied ? 'ok' : 'fail'}`}>
        <div className="tc-name">
          <span className={`codicon codicon-${item.satisfied ? 'check' : 'warning'}`} />
          {item.name}
        </div>
        <ul className="tc-pre">
          {item.prerequisites.map((p, j) => (
            <li key={j}>{p}</li>
          ))}
        </ul>
        {item.note && <div className="tc-note">{item.note}</div>}
      </div>
    ))}
  </div>
);
