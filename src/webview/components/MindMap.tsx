// 思维导图模式：主路径 + 分支 + 子目标。
import React, { useEffect, useRef } from 'react';
import { PHASE_META, PHASE_ORDER } from '../../shared/types';
import { usePolyaStore } from '../store';
import { Mermaid } from '../render/Mermaid';

function buildMindmapCode(
  steps: { id: string; phase: string; content: string }[],
  selectedId: string | null,
  branchNodes: { id: string; label: string; parentIdx: number }[],
  subGoalsMermaid: string | null,
  subGoals: { id: string; label: string; stepIds?: string[] }[],
  selectedStepId: string | null
): string {
  if (subGoalsMermaid && subGoals.length === 0) {
    return subGoalsMermaid;
  }
  if (subGoals.length > 0) {
    const lines: string[] = ['flowchart TD', '  ROOT([子目标])'];
    subGoals.forEach((g, i) => {
      const nodeId = `G${i}`;
      const active = g.stepIds?.includes(selectedStepId ?? '') ? ':::active' : '';
      lines.push(`  ${nodeId}["${g.label}"]${active}`);
      lines.push(i === 0 ? `  ROOT --> ${nodeId}` : `  G${i - 1} --> ${nodeId}`);
    });
    lines.push('  classDef active fill:#3b82f6,color:#fff,stroke:#60a5fa');
    return lines.join('\n');
  }
  const lines: string[] = ['flowchart TD', '  ROOT([题目])'];
  let prev = 'ROOT';
  steps.forEach((s, i) => {
    const label = s.content.replace(/[$`"\n]/g, ' ').slice(0, 18);
    const nodeId = `N${i}`;
    lines.push(`  ${nodeId}["${PHASE_META[s.phase as keyof typeof PHASE_META].emoji} ${label}"]`);
    lines.push(`  ${prev} --> ${nodeId}`);
    if (s.id === selectedId) {
      lines.push(`  style ${nodeId} fill:#3b82f6,color:#fff,stroke:#60a5fa`);
    }
    prev = nodeId;
    for (const b of branchNodes.filter((bn) => bn.parentIdx === i)) {
      const bId = `B_${b.id.slice(0, 6)}`;
      lines.push(`  ${bId}["↳ ${b.label}"]`);
      lines.push(`  ${nodeId} -.-> ${bId}`);
      lines.push(`  style ${bId} fill:#6366f1,color:#fff`);
    }
  });
  return lines.join('\n');
}

export const MindMap: React.FC = () => {
  const steps = usePolyaStore((s) => s.getDisplaySteps());
  const selectedStepId = usePolyaStore((s) => s.selectedStepId);
  const selectStep = usePolyaStore((s) => s.selectStep);
  const branches = usePolyaStore((s) => s.branches);
  const setActiveBranch = usePolyaStore((s) => s.setActiveBranch);
  const subGoalsMermaid = usePolyaStore((s) => s.subGoalsMermaid);
  const subGoals = usePolyaStore((s) => s.subGoals);
  const containerRef = useRef<HTMLDivElement>(null);

  const branchNodes = branches.map((b) => ({
    id: b.id,
    label: b.label,
    parentIdx: steps.findIndex((s) => s.id === b.parentStepId),
  }));

  const code = buildMindmapCode(
    steps,
    selectedStepId,
    branchNodes,
    subGoalsMermaid,
    subGoals,
    selectedStepId
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const timer = setTimeout(() => {
      steps.forEach((s, i) => {
        const node = el.querySelector(`[id*="N${i}"]`) as HTMLElement | null;
        if (node) {
          node.style.cursor = 'pointer';
          node.onclick = () => selectStep(s.id);
        }
      });
      branchNodes.forEach((b) => {
        const node = el.querySelector(`[id*="B_${b.id.slice(0, 6)}"]`) as HTMLElement | null;
        if (node) {
          node.style.cursor = 'pointer';
          node.title = '点击切换到此分支';
          node.onclick = () => setActiveBranch(b.id);
        }
      });
      subGoals.forEach((g, i) => {
        const node = el.querySelector(`[id*="G${i}"]`) as HTMLElement | null;
        if (node && g.stepIds?.[0]) {
          node.style.cursor = 'pointer';
          node.onclick = () => selectStep(g.stepIds![0]);
        }
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [code, steps, selectStep, branchNodes, setActiveBranch, subGoals]);

  if (steps.length === 0) {
    return <div className="mindmap-empty">请先求解一道题目，再查看思维导图。</div>;
  }

  return (
    <div className="mindmap" ref={containerRef}>
      <div className="mindmap-legend">
        {PHASE_ORDER.map((p) => (
          <span key={p} className="legend-item">
            {PHASE_META[p].emoji} {PHASE_META[p].title}
          </span>
        ))}
        {branches.length > 0 && (
          <span className="legend-item">↳ 虚线节点可点击切换分支</span>
        )}
        {subGoals.length > 0 && (
          <span className="legend-item">子目标图：点击节点定位步骤</span>
        )}
      </div>
      <Mermaid code={code} />
    </div>
  );
};
