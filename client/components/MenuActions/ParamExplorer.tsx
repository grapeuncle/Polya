// 参数滑块探索器：本地即时求值 + 防抖 AI 补充。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ParamSpec } from '../../../shared/types';
import { MarkdownView } from '../../render/MarkdownView';
import { formatParamPreview } from '../../utils/paramEval';
import { usePolyaStore } from '../../store';

export const ParamExplorer: React.FC<{
  params: ParamSpec[];
  intro?: string;
  stepId?: string;
}> = ({ params, intro, stepId }) => {
  const runAction = usePolyaStore((s) => s.runAction);
  const [values, setValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const p of params) {
      init[p.name] = p.default;
    }
    return init;
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const previews = useMemo(
    () =>
      params.map((p) => ({
        ...p,
        preview: formatParamPreview(p.expression, {
          ...values,
          [p.name]: values[p.name] ?? p.default,
        }),
      })),
    [params, values]
  );

  const scheduleEval = (name: string, val: number) => {
    if (!stepId) {
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      runAction('tweakParamsEval', stepId, `${name}=${val}`);
    }, 500);
  };

  useEffect(
    () => () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    },
    []
  );

  return (
    <div className="param-explorer">
      {intro && <MarkdownView content={intro} />}
      {previews.map((p) => (
        <div key={p.name} className="param-row">
          <label>
            {p.label} = {values[p.name]}
          </label>
          <input
            type="range"
            min={p.min}
            max={p.max}
            step={p.step}
            value={values[p.name]}
            onChange={(e) => {
              const v = Number(e.target.value);
              setValues((prev) => ({ ...prev, [p.name]: v }));
            }}
            onMouseUp={(e) => scheduleEval(p.name, Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) =>
              scheduleEval(p.name, Number((e.target as HTMLInputElement).value))
            }
          />
          <div className="param-preview">
            <MarkdownView content={`$${p.preview.replace(/\$/g, '')}$`} />
          </div>
        </div>
      ))}
    </div>
  );
};
