import React, { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Eye, Plus, X } from 'lucide-react';
import { useStore } from 'zustand';
import { cn } from '../../../utils/cn';
import { useSceneTabStore } from '../hooks/useSceneTabStore';
import { useTabStripOverflow } from '../hooks/useTabStripOverflow';
import type { SceneTab } from '../../types/sceneTabTypes';
import { LabelTooltip, TooltipProvider } from '../../packages/components/primitives/tooltip';
import { SceneTabProcessing } from './SceneTabProcessing';
import './scene-tab-bar.scss';
import { t } from '../../i18n';

interface SceneTabBarProps {
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
  onPresentTab: (tabId: string) => void;
  /** The tab players are shown, whether or not the player window is open; null while none is. */
  presentedTabId?: string | null;
  /** Lists every open map; offered while the tabs do not fit the bar. */
  onShowAllTabs: () => void;
}

interface TabActionButtonProps {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  /** When defined the button is a toggle and stays visible while active. */
  isActive?: boolean;
  onClick: () => void;
}

/** Icon button inside a tab; keeps its events from activating or closing the tab. */
function TabActionButton({ icon: Icon, label, isActive, onClick }: TabActionButtonProps): React.ReactElement {
  return (
    <LabelTooltip side="bottom" label={label}>
      <button
        type="button"
        className={cn('atlas-scene-tab__action', isActive && 'atlas-scene-tab__action--active')}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-pressed={isActive}
      >
        <Icon size={12} />
      </button>
    </LabelTooltip>
  );
}

export function SceneTabBar({ onSwitchTab, onCloseTab, onAddTab, onPresentTab, presentedTabId = null, onShowAllTabs }: SceneTabBarProps): React.ReactElement | null {
  const store = useSceneTabStore();

  const tabs = useStore(store, (s) => s.tabs);
  const activeTabId = useStore(store, (s) => s.activeTabId);
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  const draggingId = useRef<string | null>(null);
  const pendingReveal = useRef<HTMLElement | null>(null);
  const { overflows, hiddenBefore, hiddenAfter } = useTabStripOverflow(strip, activeTabId);

  useLayoutEffect(() => {
    pendingReveal.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    pendingReveal.current = null;
  }, [tabs]);

  const moveTab = (sourceId: string, targetId: string, after: boolean): boolean => {
    const state = store.getState();
    const source = state.tabs.find((tab) => tab.id === sourceId);
    if (!source || sourceId === targetId || !state.tabs.some((tab) => tab.id === targetId)) return false;
    const next = state.tabs.filter((tab) => tab !== source);
    const index = next.findIndex((tab) => tab.id === targetId);
    next.splice(index + (after ? 1 : 0), 0, source);
    if (next.every((tab, position) => tab === state.tabs[position])) return false;
    state.setTabs(next, state.activeTabId);
    return true;
  };

  if (tabs.length === 0) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="atlas-scene-tab-bar">
        <div
          ref={setStrip}
          role="tablist"
          aria-label={t('tabs.openMaps')}
          className={cn(
            'atlas-scene-tab-bar__strip',
            hiddenBefore && 'atlas-scene-tab-bar__strip--hidden-before',
            hiddenAfter && 'atlas-scene-tab-bar__strip--hidden-after',
          )}
        >
          {tabs.map((tab: SceneTab) => {
            const isActive = tab.id === activeTabId;
            const isPresented = tab.id === presentedTabId;
            const stateClass = isActive
              ? 'atlas-scene-tab--active'
              : tab.isLoaded
                ? 'atlas-scene-tab--loaded'
                : 'atlas-scene-tab--sleeping';

            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
                tabIndex={0}
                className={`atlas-scene-tab ${stateClass}`}
                onDragOver={(e) => {
                  if (draggingId.current) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }
                }}
                onDrop={(e) => {
                  const sourceId = draggingId.current;
                  if (!sourceId) return;
                  draggingId.current = null;
                  e.preventDefault();
                  e.stopPropagation();
                  const { left, width } = e.currentTarget.getBoundingClientRect();
                  moveTab(sourceId, tab.id, e.clientX >= left + width / 2);
                }}
                onClick={() => onSwitchTab(tab.id)}
                onKeyDown={(e) => {
                  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const index = tabs.findIndex((entry) => entry.id === tab.id);
                    const target = tabs[index + (e.key === 'ArrowLeft' ? -1 : 1)];
                    if (target) {
                      pendingReveal.current = e.currentTarget;
                      if (!moveTab(tab.id, target.id, e.key === 'ArrowRight')) pendingReveal.current = null;
                    }
                    return;
                  }
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSwitchTab(tab.id);
                  }
                }}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onCloseTab(tab.id);
                  }
                }}
              >
                {/* Show and close sit at opposite ends, so one is never clicked for the other */}
                <TabActionButton
                  icon={Eye}
                  label={t(isPresented ? 'tabs.shown' : 'tabs.show', { name: tab.displayName })}
                  isActive={isPresented}
                  onClick={() => onPresentTab(tab.id)}
                />
                <LabelTooltip side="bottom" label={tab.filePath}>
                  <span
                    className="atlas-scene-tab__name"
                    draggable
                    onDragStart={(e) => {
                      draggingId.current = tab.id;
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('application/x-atlas-scene-tab', tab.id);
                    }}
                    onDragEnd={() => { draggingId.current = null; }}
                  >{tab.displayName}</span>
                </LabelTooltip>
                <SceneTabProcessing scenePath={tab.filePath} />
                {tab.isDirty && <span className="atlas-scene-tab__dirty" />}
                <TabActionButton icon={X} label={t('tabs.close', { name: tab.displayName })} onClick={() => onCloseTab(tab.id)} />
              </div>
            );
          })}
        </div>
        {overflows && (
          <LabelTooltip side="bottom" label={t('tabs.allOpen')}>
            <button
              type="button"
              className="atlas-scene-tab atlas-scene-tab-bar__button"
              aria-haspopup="dialog"
              onClick={onShowAllTabs}
            >
              <ChevronDown size={14} />
            </button>
          </LabelTooltip>
        )}
        <LabelTooltip side="bottom" label={t('tabs.openScene')}>
          <button
            type="button"
            className="atlas-scene-tab atlas-scene-tab-bar__button atlas-scene-tab-bar__add"
            onClick={onAddTab}
          >
            <Plus size={14} />
          </button>
        </LabelTooltip>
      </div>
    </TooltipProvider>
  );
}
