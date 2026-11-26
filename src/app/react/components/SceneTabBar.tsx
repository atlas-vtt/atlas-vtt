import React, { useState } from 'react';
import { ChevronDown, Eye, Plus, X } from 'lucide-react';
import { useStore } from 'zustand';
import { cn } from '../../../utils/cn';
import { useSceneTabStore } from '../hooks/useSceneTabStore';
import { useTabStripOverflow } from '../hooks/useTabStripOverflow';
import { useTabReorderDrag } from '../hooks/useTabReorderDrag';
import type { SceneTab } from '../../types/sceneTabTypes';
import { lastPointerWasTouch } from '../../packages/components/primitives/lastInput';
import { LabelTooltip, TooltipProvider } from '../../packages/components/primitives/tooltip';
import { openContextMenuGlobal, type ContextMenuEntry } from '../root/ContextMenuContext';
import { SceneTabProcessing } from './SceneTabProcessing';
import './scene-tab-bar.scss';
import { t } from '../../i18n';

interface SceneTabBarProps {
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
  onPresentTab: (tabId: string) => void;
  /** Moves a tab to another place in the bar: by a mouse's drag, or from the menu a long press opens. */
  onMoveTab: (tabId: string, toIndex: number) => void;
  /** The tab players are shown, whether or not the player window is open; null while none is. */
  presentedTabId?: string | null;
  /** Lists every open map; offered while the tabs do not fit the bar. */
  onShowAllTabs: () => void;
}

interface TabActionButtonProps {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  /** The end of the tab the button stands at. */
  end: 'start' | 'end';
  /** When defined the button is a toggle and stays visible while active. */
  isActive?: boolean;
  onClick: () => void;
}

/** Icon button inside a tab; keeps its events from activating or closing the tab. */
function TabActionButton({ icon: Icon, label, end, isActive, onClick }: TabActionButtonProps): React.ReactElement {
  return (
    <LabelTooltip side="bottom" label={label}>
      <button
        type="button"
        className={cn('atlas-scene-tab__action', `atlas-scene-tab__action--${end}`, isActive && 'atlas-scene-tab__action--active')}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-pressed={isActive}
      >
        <Icon size={12} />
      </button>
    </LabelTooltip>
  );
}

/**
 * A tab's menu under a finger, which scrolls the strip where a mouse drags a tab along it: the
 * tab moves one place to either side, and the row that has nowhere to go stays, disabled.
 */
export function sceneTabMoveEntries(index: number, count: number, moveTo: (toIndex: number) => void): ContextMenuEntry[] {
  return [
    { type: 'item', label: t('tabs.moveLeft'), icon: 'arrow-left', disabled: index <= 0, onClick: () => moveTo(index - 1) },
    { type: 'item', label: t('tabs.moveRight'), icon: 'arrow-right', disabled: index >= count - 1, onClick: () => moveTo(index + 1) },
  ];
}

export function SceneTabBar({ onSwitchTab, onCloseTab, onAddTab, onPresentTab, onMoveTab, presentedTabId = null, onShowAllTabs }: SceneTabBarProps): React.ReactElement | null {
  const store = useSceneTabStore();

  const tabs = useStore(store, (s) => s.tabs);
  const activeTabId = useStore(store, (s) => s.activeTabId);
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  const { overflows, hiddenBefore, hiddenAfter } = useTabStripOverflow(strip, activeTabId);

  const startDrag = useTabReorderDrag(strip, tabs.map((tab) => tab.id).join('\n'), onMoveTab);

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
                data-tab-id={tab.id}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                className={cn('atlas-scene-tab', stateClass, isPresented && 'atlas-scene-tab--presented')}
                onPointerDown={(e) => startDrag(e, tab.id)}
                onContextMenu={(e) => {
                  // A long press: a mouse reorders by dragging, and its right-click is left as it was.
                  if (!lastPointerWasTouch() || tabs.length < 2) return;
                  e.preventDefault();
                  openContextMenuGlobal(sceneTabMoveEntries(tabs.indexOf(tab), tabs.length, (toIndex) => onMoveTab(tab.id, toIndex)), { x: e.clientX, y: e.clientY });
                }}
                onClick={() => onSwitchTab(tab.id)}
                onKeyDown={(e) => {
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
                  end="start"
                  isActive={isPresented}
                  onClick={() => onPresentTab(tab.id)}
                />
                <span className="atlas-scene-tab__label">
                  <LabelTooltip side="bottom" label={tab.displayName}>
                    <span className="atlas-scene-tab__name">{tab.displayName}</span>
                  </LabelTooltip>
                  <SceneTabProcessing scenePath={tab.filePath} />
                  {tab.isDirty && <span className="atlas-scene-tab__dirty" />}
                </span>
                <TabActionButton icon={X} label={t('tabs.close')} end="end" onClick={() => onCloseTab(tab.id)} />
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
