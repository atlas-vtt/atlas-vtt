import React, { useState, useSyncExternalStore } from 'react';
import { ChevronDown, Eye, EyeOff, Plus, X } from 'lucide-react';
import { useStore } from 'zustand';
import { cn } from '../../../utils/cn';
import { useSceneTabStore } from '../hooks/useSceneTabStore';
import { useTabStripOverflow } from '../hooks/useTabStripOverflow';
import { usePresentedTabId } from '../hooks/usePresentedTabId';
import { activePresentationTarget, presentationTargetsRegistered, presentationTargetsVersion, subscribePresentationTargets, tabBadgeFor } from '../../services/presentationTargets';
import { useAtlasUI } from '../root/AtlasUIContext';
import { stopPresenting } from '../../services/stopPresenting';
import { playerWindowStore } from '../../stores/playerWindowStore';
import type { SceneTab } from '../../types/sceneTabTypes';
import { LabelTooltip, TooltipProvider } from '../../packages/components/primitives/tooltip';
import './scene-tab-bar.scss';
import { t } from '../../i18n';

type MenuPosition = { x: number; y: number };

interface SceneTabBarProps {
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
  onPresentTab: (tabId: string) => void;
  /**
   * The eye's context menu; returns false when it offers none, so the right-click is left alone. Opened from the
   * keyboard (the context-menu key, Shift+F10) it is told the eye, for focus to go back to.
   */
  onPresentTabMenu?: ((tabId: string, position: MenuPosition, returnFocus?: HTMLElement) => boolean) | undefined;
  /** Lists every open map; offered while the tabs do not fit the bar. */
  onShowAllTabs: () => void;
}

interface TabActionButtonProps {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  /** When defined the button is a toggle and stays visible while active. */
  isActive?: boolean;
  /** Drawn as shown, and kept visible, without being pressed (a tab a presentation target marks). */
  isShown?: boolean;
  onClick: () => void;
  /** Returns true when it opened a menu of its own; `returnFocus` is the button when the keyboard opened it. */
  onContextMenu?: ((position: MenuPosition, returnFocus?: HTMLElement) => boolean) | undefined;
}

/** The context-menu key and Shift+F10 open a focused control's context menu. */
function isMenuKey(event: React.KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
}

/** Icon button inside a tab; keeps its events from activating or closing the tab. */
function TabActionButton({ icon: Icon, label, isActive, isShown, onClick, onContextMenu }: TabActionButtonProps): React.ReactElement {
  return (
    <LabelTooltip side="bottom" label={label}>
      <button
        type="button"
        className={cn('atlas-scene-tab__action', isActive && 'atlas-scene-tab__action--active', isShown && !isActive && 'atlas-scene-tab__action--shown')}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onContextMenu={(e) => {
          if (!onContextMenu?.({ x: e.clientX, y: e.clientY })) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (!isMenuKey(e)) return;
          const button = e.currentTarget;
          const rect = button.getBoundingClientRect();
          if (onContextMenu?.({ x: rect.left, y: rect.bottom }, button)) e.preventDefault();
        }}
        aria-pressed={isActive}
      >
        <Icon size={12} />
      </button>
    </LabelTooltip>
  );
}

export function SceneTabBar({ onSwitchTab, onCloseTab, onAddTab, onPresentTab, onPresentTabMenu, onShowAllTabs }: SceneTabBarProps): React.ReactElement | null {
  const store = useSceneTabStore();

  const tabs = useStore(store, (s) => s.tabs);
  const activeTabId = useStore(store, (s) => s.activeTabId);
  const scenePresentedTabId = usePresentedTabId(store);
  const windowTabId = useStore(playerWindowStore, (s) => s.presentedTabId);
  const isPlayerWindowOpen = useStore(playerWindowStore, (s) => s.isOpen);
  // Without a registered target the eye marks what the player window shows, as it always has.
  const targetsRegistered = useSyncExternalStore(subscribePresentationTargets, presentationTargetsRegistered);
  const presentedTabId = targetsRegistered ? scenePresentedTabId : isPlayerWindowOpen ? windowTabId : null;
  const target = useSyncExternalStore(subscribePresentationTargets, activePresentationTarget);
  // The version, not the target: `ui.invalidate()` keeps the same target, and its badges must still be read again.
  useSyncExternalStore(subscribePresentationTargets, presentationTargetsVersion);
  const viewId = useAtlasUI().view?.viewId ?? null;
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  const { overflows, hiddenBefore, hiddenAfter } = useTabStripOverflow(strip, activeTabId);

  if (tabs.length === 0) return null;

  const presentLabel = (tab: SceneTab, isPresented: boolean): string => {
    const name = tab.displayName;
    if (isPresented && target) return t('tabs.stopPresenting', { name });
    // Only a player window or a target shows the scene; without either the eye offers to open the window.
    if (isPresented && isPlayerWindowOpen) return t('tabs.shown', { name });
    return target ? t('tabs.presentTo', { name, target: target.label }) : t('tabs.show', { name });
  };

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
            const badge = viewId === null ? null : tabBadgeFor(viewId, tab.id);
            const eyeLabel = presentLabel(tab, isPresented);
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
                tabIndex={0}
                className={`atlas-scene-tab ${stateClass}`}
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
                  icon={isPresented && target ? EyeOff : Eye}
                  label={badge === null ? eyeLabel : t('tabs.withBadge', { label: eyeLabel, badge })}
                  isActive={isPresented}
                  isShown={badge !== null}
                  // With a target active, the presented scene's eye hides it again.
                  onClick={() => (isPresented && target ? stopPresenting() : onPresentTab(tab.id))}
                  onContextMenu={onPresentTabMenu && ((position, returnFocus) => (returnFocus
                    ? onPresentTabMenu(tab.id, position, returnFocus)
                    : onPresentTabMenu(tab.id, position)))}
                />
                {/* Named by the eye, whose accessible name carries it */}
                {badge !== null && <span className="atlas-scene-tab__badge" aria-hidden="true">{badge}</span>}
                <LabelTooltip side="bottom" label={tab.filePath}>
                  <span className="atlas-scene-tab__name">{tab.displayName}</span>
                </LabelTooltip>
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
