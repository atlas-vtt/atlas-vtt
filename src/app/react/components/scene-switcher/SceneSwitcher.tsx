import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useStore } from 'zustand';
import { cn } from '../../../../utils/cn';
import { useMapHotkeys } from '../../../keyboard/useMapHotkeys';
import { useDialogFocus } from '../../../onboarding/useDialogFocus';
import { useSceneTabStore } from '../../hooks/useSceneTabStore';
import { MAX_NUMBER_KEY, searchSceneTabs, splitByMatches, type SceneSwitcherResult } from './sceneSwitcherSearch';
import { SceneSwitcherFooter } from './SceneSwitcherFooter';
import './scene-switcher.scss';
import { STANDING_LIST } from '../../../keyboard/tooltipEscape';
import { t } from '../../../i18n';

interface SceneSwitcherProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSwitchTab: (tabId: string) => void;
  /** Switches to the tab and shows it in the player window, opening that window if needed. */
  onPresentTab: (tabId: string) => void;
}

interface SceneSwitcherPanelProps extends Omit<SceneSwitcherProps, 'isOpen' | 'onOpenChange'> {
  onClose: () => void;
}

/** The open-maps switcher; the scene switcher hotkey opens it as well. */
export function SceneSwitcher({ isOpen, onOpenChange, onSwitchTab, onPresentTab }: SceneSwitcherProps): React.ReactElement | null {
  const store = useSceneTabStore();
  const close = useCallback((): void => onOpenChange(false), [onOpenChange]);

  useMapHotkeys({ sceneSwitcher: () => onOpenChange(store.getState().tabs.length > 0) });

  return isOpen ? <SceneSwitcherPanel onSwitchTab={onSwitchTab} onPresentTab={onPresentTab} onClose={close} /> : null;
}

function SceneName({ result }: { result: SceneSwitcherResult }): React.ReactElement {
  return (
    <span className="atlas-scene-switcher__name">
      {splitByMatches(result.tab.displayName, result.matches).map((segment, index) =>
        segment.isMatch
          ? <mark key={index} className="atlas-scene-switcher__match">{segment.text}</mark>
          : <React.Fragment key={index}>{segment.text}</React.Fragment>,
      )}
    </span>
  );
}

function SceneSwitcherPanel({ onSwitchTab, onPresentTab, onClose }: SceneSwitcherPanelProps): React.ReactElement {
  const store = useSceneTabStore();
  const tabs = useStore(store, (s) => s.tabs);
  const activeTabId = useStore(store, (s) => s.activeTabId);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId)));
  const results = useMemo(() => searchSceneTabs(tabs, query), [tabs, query]);
  const selectedIndex = Math.min(selected, results.length - 1);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [hasMapsBelow, setHasMapsBelow] = useState(false);
  const idPrefix = useId();
  const optionId = (tabId: string): string => `${idPrefix}-${tabId}`;

  useDialogFocus(panelRef, onClose);

  const updateHasMapsBelow = useCallback((): void => {
    const list = listRef.current;
    setHasMapsBelow(!!list && list.scrollTop + list.clientHeight < list.scrollHeight - 1);
  }, []);

  useLayoutEffect(updateHasMapsBelow, [results, updateHasMapsBelow]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, results]);

  /** With `showPlayers` the player view shows the map as well. */
  const choose = (tabId: string, showPlayers = false): void => {
    onClose();
    if (showPlayers) onPresentTab(tabId);
    else if (tabId !== activeTabId) onSwitchTab(tabId);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      if (results.length) setSelected((selectedIndex + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const result = results[selectedIndex];
      if (result) choose(result.tab.id, event.shiftKey);
    } else if (!query && /^[1-9]$/.test(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      const tab = tabs[Number(event.key) - 1];
      if (tab) choose(tab.id);
    }
  };

  const selectedResult = results[selectedIndex];

  return (
    <div className="atlas-scene-switcher" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="atlas-scene-switcher__panel"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => {
          e.stopPropagation();
          // Clicks keep focus in the search field, so its blur means focus left the switcher
          if (e.target !== inputRef.current) e.preventDefault();
        }}
      >
        <div className="atlas-scene-switcher__search">
          <Search size={14} aria-hidden />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls={`${idPrefix}-list`}
            aria-activedescendant={selectedResult ? optionId(selectedResult.tab.id) : undefined}
            placeholder={t('switcher.search')}
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={handleKeyDown}
            onBlur={onClose}
          />
        </div>
        <div ref={listRef} id={`${idPrefix}-list`} role="listbox" {...STANDING_LIST} className="atlas-scene-switcher__list" onScroll={updateHasMapsBelow}>
          {results.map((result, index) => (
            <div
              key={result.tab.id}
              id={optionId(result.tab.id)}
              role="option"
              aria-selected={index === selectedIndex}
              className={cn(
                'atlas-scene-switcher__item',
                index === selectedIndex && 'atlas-scene-switcher__item--selected',
                result.tab.id === activeTabId && 'atlas-scene-switcher__item--current',
              )}
              onClick={(e) => choose(result.tab.id, e.shiftKey)}
              onMouseMove={() => setSelected(index)}
            >
              <span className="atlas-scene-switcher__number" aria-hidden>
                {result.number <= MAX_NUMBER_KEY ? result.number : ''}
              </span>
              <SceneName result={result} />
              {result.tab.id === activeTabId && <span className="atlas-scene-switcher__current">{t('switcher.current')}</span>}
            </div>
          ))}
          {!results.length && <div className="atlas-scene-switcher__empty">No open map matches “{query.trim()}”</div>}
        </div>
        <SceneSwitcherFooter isRaised={hasMapsBelow} />
      </div>
    </div>
  );
}
