// 浮动工具栏：根据步骤所属阶段，渲染「通用动作 + 阶段专属动作」；内联于选中卡片下方。

import React, { useEffect, useState } from 'react';

import { SolutionStep } from '../../shared/types';

import { COMMON_ACTIONS, MenuItemConfig, PHASE_ACTIONS } from '../menuConfig';

import { usePolyaStore } from '../store';



export const FloatingMenu: React.FC<{ step: SolutionStep }> = ({ step }) => {

  const runAction = usePolyaStore((s) => s.runAction);

  const toggleFlag = usePolyaStore((s) => s.toggleFlag);

  const flagged = usePolyaStore((s) => s.flagged.includes(step.id));

  const threads = usePolyaStore((s) => s.threads[step.id]?.messages ?? []);

  const pendingAskStepId = usePolyaStore((s) => s.pendingAskStepId);

  const pendingAskPrefill = usePolyaStore((s) => s.pendingAskPrefill);

  const setPendingAsk = usePolyaStore((s) => s.setPendingAsk);

  const [askOpen, setAskOpen] = useState(false);

  const [askText, setAskText] = useState('');



  useEffect(() => {

    if (pendingAskStepId === step.id) {

      setAskOpen(true);

      setAskText(pendingAskPrefill);

      setPendingAsk(null, '');

    }

  }, [pendingAskStepId, pendingAskPrefill, step.id, setPendingAsk]);



  const handleClick = (item: MenuItemConfig) => {

    if (item.id === 'flag') {

      toggleFlag(step.id);

      return;

    }

    if (item.needsInput) {

      setAskOpen((v) => !v);

      return;

    }

    runAction(item.id, step.id);

  };



  const submitAsk = () => {

    if (askText.trim()) {

      runAction('ask', step.id, askText.trim());

      setAskText('');

      setAskOpen(false);

    }

  };



  const phaseActions = PHASE_ACTIONS[step.phase] ?? [];



  const renderButton = (item: MenuItemConfig) => (

    <button

      key={item.id}

      className={`menu-btn ${item.id === 'flag' && flagged ? 'active' : ''}`}

      title={item.tip}

      onClick={(e) => {

        e.stopPropagation();

        handleClick(item);

      }}

    >

      <span className={`codicon codicon-${item.icon}`} aria-hidden="true" />

      <span className="menu-btn-label">

        {item.id === 'flag' && flagged ? '取消标记' : item.label}

      </span>

    </button>

  );



  return (

    <div className="floating-menu" onClick={(e) => e.stopPropagation()}>

      <div className="menu-group">

        <div className="menu-group-title">通用操作</div>

        <div className="menu-row">{COMMON_ACTIONS.map(renderButton)}</div>

      </div>

      <div className="menu-group">

        <div className="menu-group-title">阶段专属</div>

        <div className="menu-row">{phaseActions.map(renderButton)}</div>

      </div>

      {threads.length > 0 && (

        <details className="thread-history">

          <summary>对话历史（{threads.length}）</summary>

          <ul>

            {threads.slice(-4).map((m, i) => (

              <li key={i} className={`thread-${m.role}`}>

                <strong>{m.role === 'user' ? '我' : '老师'}：</strong>

                {m.content.slice(0, 80)}

                {m.content.length > 80 ? '…' : ''}

              </li>

            ))}

          </ul>

        </details>

      )}

      {askOpen && (

        <div className="ask-box" onClick={(e) => e.stopPropagation()}>

          <textarea

            placeholder="输入你对这一步的疑问…"

            value={askText}

            autoFocus

            onChange={(e) => setAskText(e.target.value)}

            onKeyDown={(e) => {

              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {

                submitAsk();

              }

            }}

          />

          <div className="ask-actions">

            <button className="primary" onClick={submitAsk}>

              提问 (⌘/Ctrl+Enter)

            </button>

            <button onClick={() => setAskOpen(false)}>取消</button>

          </div>

        </div>

      )}

    </div>

  );

};

