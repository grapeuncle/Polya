// 题干句级高亮拆解视图。
import React from 'react';
import { BreakdownSentence } from '../../../shared/types';

const ROLE_LABEL: Record<BreakdownSentence['role'], string> = {
  given: '已知',
  unknown: '未知',
  constraint: '约束',
  goal: '目标',
  hint: '提示',
};

const ROLE_CLASS: Record<BreakdownSentence['role'], string> = {
  given: 'bd-given',
  unknown: 'bd-unknown',
  constraint: 'bd-constraint',
  goal: 'bd-goal',
  hint: 'bd-hint',
};

export const ProblemBreakdown: React.FC<{
  sentences: BreakdownSentence[];
  intro?: string;
}> = ({ sentences, intro }) => (
  <div className="problem-breakdown">
    {intro && <p className="bd-intro">{intro}</p>}
    <ul className="bd-list">
      {sentences.map((s, i) => (
        <li key={i} className={`bd-item ${ROLE_CLASS[s.role]}`}>
          <span className="bd-role">{ROLE_LABEL[s.role]}</span>
          <span className="bd-text">{s.text}</span>
          {s.note && <span className="bd-note">{s.note}</span>}
        </li>
      ))}
    </ul>
  </div>
);
