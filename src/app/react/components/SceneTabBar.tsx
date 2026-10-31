import React, { useId, useLayoutEffect, useRef, useState } from 'react';
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
import { useSceneTabReorder } from './scene-tabs/useSceneTabReorder';

interface SceneTabBarProps {
  onSwitchTab: (tabId: string) => void;
  onMoveTab: (tabId: string, beforeTabId: string | null) => boolean;
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
  suppressed?: boolean;
}

/** Icon button inside a tab; keeps its events from activating or closing the tab. */
function TabActionButton({ icon: Icon, label, isActive, onClick, suppressed = false }: TabActionButtonProps): React.ReactElement {
  return (
    <LabelTooltip side="bottom" label={label} suppressed={suppressed}>
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

export function SceneTabBar({ onSwitchTab, onMoveTab, onCloseTab, onAddTab, onPresentTab, presentedTabId = null, onShowAllTabs }: SceneTabBarProps): React.ReactElement | null {
  const store = useSceneTabStore();

  const tabs = useStore(store, (s) => s.tabs);
  const activeTabId = useStore(store, (s) => s.activeTabId);
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  const instructionsId = useId();
  const [announcement, announce] = useState('');
  const pendingFocus = useRef<string | null>(null);
  const { overflows, hiddenBefore, hiddenAfter } = useTabStripOverflow(strip, activeTabId);

  useLayoutEffect(() => {
    const id = pendingFocus.current;
    pendingFocus.current = null;
    if (!id || !strip) return;
    const element = Array.from(strip.querySelectorAll<HTMLElement>('[data-scene-tab-id]')).find((tab) => tab.dataset.sceneTabId === id);
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }, [tabs, strip]);

  const moveTab = (tabId: string, beforeTabId: string | null): boolean => {
    pendingFocus.current = tabId;
    if (!onMoveTab(tabId, beforeTabId)) { pendingFocus.current = null; return false; }
    const current = store.getState().tabs;
    const position = current.findIndex((tab) => tab.id === tabId);
    announce(t('tabs.moved', { name: current[position]!.displayName, position: position + 1, total: current.length }));
    return true;
  };
  const reorder = useSceneTabReorder({ strip, store, onMoveTab: moveTab, announce });

  if (tabs.length === 0) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="atlas-scene-tab-bar">
        <span className="atlas-scene-tab-bar__sr" id={instructionsId}>{t('tabs.reorderInstructions')}</span>
        <span className="atlas-scene-tab-bar__sr" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
        <div
          ref={setStrip}
          onClickCapture={reorder.onClickCapture}
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
                data-scene-tab-id={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-describedby={instructionsId}
                tabIndex={0}
                className={cn('atlas-scene-tab', stateClass, reorder.draggedId === tab.id && 'atlas-scene-tab--dragging')}
                onPointerDown={(e) => reorder.press(e, tab.id)}
                onClick={() => onSwitchTab(tab.id)}
                onKeyDown={(e) => {
                  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const index = tabs.findIndex((entry) => entry.id === tab.id);
                    const target = index + (e.key === 'ArrowLeft' ? -1 : 1);
                    if (target >= 0 && target < tabs.length) moveTab(tab.id, e.key === 'ArrowLeft' ? tabs[target]!.id : tabs[target + 1]?.id ?? null);
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
                  suppressed={!!reorder.draggedId}
                  label={t(isPresented ? 'tabs.shown' : 'tabs.show', { name: tab.displayName })}
                  isActive={isPresented}
                  onClick={() => onPresentTab(tab.id)}
                />
                <LabelTooltip side="bottom" label={tab.filePath} suppressed={!!reorder.draggedId}>
                  <span className="atlas-scene-tab__name">{tab.displayName}</span>
                </LabelTooltip>
                <SceneTabProcessing scenePath={tab.filePath} suppressed={!!reorder.draggedId} />
                {tab.isDirty && <span className="atlas-scene-tab__dirty" />}
                <TabActionButton icon={X} suppressed={!!reorder.draggedId} label={t('tabs.close', { name: tab.displayName })} onClick={() => onCloseTab(tab.id)} />
              </div>
            );
          })}
          {reorder.indicatorLeft !== null && (
            <div className="atlas-scene-tab-bar__insertion" aria-hidden="true" style={{ left: reorder.indicatorLeft }} />
          )}
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
