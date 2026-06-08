// 思维导图模式：以 Mermaid flowchart 展示步骤逻辑与阶段分支，点击节点等同于选中步骤。
import React, { useEffect, useRef } from 'react';
import { PHASE_META, PHASE_ORDER } from '../../shared/types';
import { usePolyaStore } from '../store';
import { Mermaid } from '../render/Mermaid';

/** 根据步骤生成 mermaid flowchart 代码。 */
function buildMindmapCode(
  steps: { id: string; phase: string; content: string }[],
  selectedId: string | null
): string {
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
  });
  return lines.join('\n');
}

export const MindMap: React.FC = () => {
  const steps = usePolyaStore((s) => s.steps);
  const selectedStepId = usePolyaStore((s) => s.selectedStepId);
  const selectStep = usePolyaStore((s) => s.selectStep);
  const containerRef = useRef<HTMLDivElement>(null);

  const code = buildMindmapCode(steps, selectedStepId);

  // Mermaid 渲染后，给节点绑定点击事件以选中对应步骤。
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
    }, 400);
    return () => clearTimeout(timer);
  }, [code, steps, selectStep]);

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
      </div>
      <Mermaid code={code} />
    </div>
  );
};
