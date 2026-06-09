// SVG 几何可视化渲染器。
import React from 'react';
import { SvgElement, VizSpec } from '../../shared/types';

function renderElement(el: SvgElement, i: number): React.ReactNode {
  switch (el.type) {
    case 'line':
      return (
        <line
          key={i}
          x1={el.x1}
          y1={el.y1}
          x2={el.x2}
          y2={el.y2}
          stroke={el.stroke ?? 'var(--vscode-foreground, #ccc)'}
          strokeWidth={2}
        />
      );
    case 'circle':
      return (
        <circle
          key={i}
          cx={el.cx}
          cy={el.cy}
          r={el.r}
          fill={el.fill ?? 'none'}
          stroke={el.stroke ?? 'var(--vscode-charts-blue, #3b82f6)'}
          strokeWidth={2}
        />
      );
    case 'point':
      return (
        <g key={i}>
          <circle cx={el.x} cy={el.y} r={4} fill="var(--vscode-charts-red, #f44)" />
          {el.label && (
            <text x={el.x + 8} y={el.y - 8} fontSize={12} fill="var(--vscode-foreground)">
              {el.label}
            </text>
          )}
        </g>
      );
    case 'axis': {
      const x2 = el.direction === 'x' ? el.x + el.length : el.x;
      const y2 = el.direction === 'y' ? el.y - el.length : el.y;
      return (
        <g key={i}>
          <line
            x1={el.x}
            y1={el.y}
            x2={x2}
            y2={y2}
            stroke="var(--vscode-foreground, #888)"
            strokeWidth={1.5}
            markerEnd="url(#arrow)"
          />
          {el.label && (
            <text
              x={el.direction === 'x' ? x2 + 4 : el.x + 4}
              y={el.direction === 'y' ? y2 - 4 : el.y + 16}
              fontSize={12}
              fill="var(--vscode-foreground)"
            >
              {el.label}
            </text>
          )}
        </g>
      );
    }
    case 'label':
      return (
        <text key={i} x={el.x} y={el.y} fontSize={13} fill="var(--vscode-foreground)">
          {el.text}
        </text>
      );
    case 'polygon':
      return (
        <polygon
          key={i}
          points={el.points}
          fill={el.fill ?? 'rgba(59,130,246,0.15)'}
          stroke={el.stroke ?? 'var(--vscode-charts-blue, #3b82f6)'}
          strokeWidth={1.5}
        />
      );
    default:
      return null;
  }
}

export const GeometrySvg: React.FC<{ spec: NonNullable<VizSpec['svg']> }> = ({ spec }) => (
  <svg
    className="geometry-svg"
    viewBox={`0 0 ${spec.width} ${spec.height}`}
    width="100%"
    height={spec.height}
    role="img"
  >
    <defs>
      <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6" fill="var(--vscode-foreground, #888)" />
      </marker>
    </defs>
    {spec.elements.map(renderElement)}
  </svg>
);

export const VizRenderer: React.FC<{ viz: VizSpec; intro?: string }> = ({ viz, intro }) => {
  if (viz.kind === 'svg' && viz.svg) {
    return (
      <div className="viz-container">
        {intro && <p className="viz-intro">{intro}</p>}
        <GeometrySvg spec={viz.svg} />
      </div>
    );
  }
  if (viz.kind === 'table' && viz.table) {
    return (
      <table className="viz-table">
        <thead>
          <tr>
            {viz.table.headers.map((h: string) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {viz.table.rows.map((row: string[], i: number) => (
            <tr key={i}>
              {row.map((cell: string, j: number) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return null;
};
