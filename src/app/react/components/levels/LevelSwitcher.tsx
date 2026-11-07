import React from 'react';
import { Eye } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { useAtlasStore } from '../../ViewStoreContext';
import { resolveLevel, viewedLevelId } from '../../../levels/sceneLevels';
import { useStore } from 'zustand';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { usePresentedScene } from '../../hooks/usePresentedScene';
import { useSceneTabStore } from '../../hooks/useSceneTabStore';
import { presentTab } from '../../../services/PlayerWindowPresenter';
import { runInBackground } from '../../../utils/backgroundTask';
import { LabelTooltip, TooltipProvider } from '../../../packages/components/primitives/tooltip';
import { t } from '../../../i18n';
import { levelLabel } from './levelEditing';
import { levelForeground } from '../../../levels/levelEdits';
import { RoofsToggle } from './RoofsToggle';
import './level-switcher.scss';

/**
 * The floors of a scene with more than one level, top floor first, at the map's left edge: a
 * click shows a level (never an undo step), the eye shows it to players like a scene tab's. Where
 * the level shown has a roof, the GM's Roofs stands at its foot (alone in a scene of one level).
 */
export function LevelSwitcher(): React.ReactElement | null {
  const { app, view } = useAtlasUI();
  const levels = useAtlasStore((state) => state.levels);
  const viewed = useAtlasStore((state) => viewedLevelId(state));
  const setViewedLevel = useAtlasStore((state) => state.setViewedLevel);
  const activeTabId = useStore(useSceneTabStore(), (state) => state.activeTabId);
  const presented = usePresentedScene(app);
  const roofed = useAtlasStore((state) => levelForeground(state, viewedLevelId(state)) !== null);
  const several = !!levels && levels.length > 1;
  if (!several && !roofed) return null;
  // The level players are shown in this tab's scene; none while another tab is presented
  const presentedLevelId = presented && presented.tabId === activeTabId && levels ? resolveLevel(levels, presented.levelId) : null;
  const onPresentLevel = (levelId: string): void => {
    if (view && activeTabId) runInBackground(presentTab(app, view, activeTabId, { levelId }), 'Showing a level to players');
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="atlas-level-switcher">
        {several && (
          <div className="atlas-level-switcher__levels" role="tablist" aria-orientation="vertical" aria-label={t('levels.switcher')}>
            {[...levels].reverse().map((level) => {
              const name = levelLabel(levels, level);
              const isViewed = level.id === viewed;
              const isPresented = level.id === presentedLevelId;
              return (
                <div
                  key={level.id}
                  role="tab"
                  aria-selected={isViewed}
                  tabIndex={0}
                  className={cn('atlas-level-switcher__level', isViewed && 'atlas-level-switcher__level--active')}
                  onClick={() => setViewedLevel(level.id)}
                  onKeyDown={(event) => {
                    // The eye's Enter and Space are its own; every other key goes on to the map's shortcuts (PageUp, PageDown)
                    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    setViewedLevel(level.id);
                  }}
                >
                  <LabelTooltip side="right" label={t('levels.show', { name })}>
                    <span className="atlas-level-switcher__name">{name}</span>
                  </LabelTooltip>
                  <LabelTooltip side="right" label={t(isPresented ? 'levels.presented' : 'levels.present', { name })}>
                    <button
                      type="button"
                      className={cn('atlas-level-switcher__eye', isPresented && 'atlas-level-switcher__eye--active')}
                      aria-pressed={isPresented}
                      onClick={(event) => {
                        event.stopPropagation();
                        onPresentLevel(level.id);
                      }}
                    >
                      <Eye size={12} />
                    </button>
                  </LabelTooltip>
                </div>
              );
            })}
          </div>
        )}
        {roofed && <RoofsToggle />}
      </div>
    </TooltipProvider>
  );
}
