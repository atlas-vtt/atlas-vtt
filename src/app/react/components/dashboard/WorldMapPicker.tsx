import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { STANDING_LIST } from '../../../keyboard/tooltipEscape';
import { useListPlacement } from '../../../packages/components/primitives/selectListPlacement';
import { cn } from '../../../../utils/cn';
import { t } from '../../../i18n';
import type { WorldMapChoice } from './libraryPictures';
import { GameIcon } from '../GameIcon';
import { PIN_ICON_PATHS } from '../../../types/pinIconPaths';

interface WorldMapPickerProps {
  choices: WorldMapChoice[];
  /** The chosen map's or scene's asset id. */
  value: string | undefined;
  onChange: (id: string) => void;
  /** Names the trigger and the list. */
  labelledBy: string;
  disabled: boolean;
  /** Where the list opens from: the picker's root, positioned by `className`. */
  className?: string;
  triggerClassName: string;
  /** What the trigger shows. */
  children: React.ReactNode;
}

const STEP: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

function Thumb({ choice }: { choice: WorldMapChoice }): React.JSX.Element {
  return (
    <span className="world-map-thumb">
      {choice.thumbnailUrl ? <img src={choice.thumbnailUrl} alt="" /> : <GameIcon path={PIN_ICON_PATHS.map} size={14} />}
    </span>
  );
}

/**
 * Picks any map or scene of the library, searched by name, from a list that opens below its trigger,
 * or above it where the page has no room below, and scrolls where neither side holds it whole.
 */
export function WorldMapPicker({ choices, value, onChange, labelledBy, disabled, className, triggerClassName, children }: WorldMapPickerProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const searchLabelId = useId();
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return words === '' ? choices : choices.filter((choice) => choice.name.toLowerCase().includes(words));
  }, [choices, query]);

  // Where it opens is decided as it opens, by all the choices: filtering shortens it, never moves it.
  const { fit } = useListPlacement(isOpen, triggerRef, popoverRef, null, choices.length);

  // Focused once placed: focusing a field the view's edge cuts would scroll the page to it.
  useEffect(() => {
    if (isOpen) searchRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

  const close = (): void => {
    setIsOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  };

  const pick = (id: string): void => {
    if (id !== value) onChange(id);
    close();
  };

  const onListKeyDown = (event: React.KeyboardEvent): void => {
    const options = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const step = STEP[event.key];
    if (step !== undefined) {
      event.preventDefault();
      options[Math.min(options.length - 1, Math.max(0, current + step))]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Enter' && current === -1 && shown[0]) {
      event.preventDefault();
      pick(shown[0].id);
    }
  };

  return (
    <div ref={rootRef} className={cn('world-map-picker', isOpen && 'is-open', className)}>
      <button
        ref={triggerRef}
        type="button"
        className={cn(triggerClassName, isOpen && 'atlas-open')}
        aria-labelledby={labelledBy}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
      >
        {children}
      </button>
      {isOpen && (
        <div
          ref={popoverRef}
          className={cn('world-map-picker__popover', fit.up && 'world-map-picker__popover--up')}
          style={fit.maxHeight === null ? undefined : { maxHeight: fit.maxHeight }}
          onKeyDown={onListKeyDown}
        >
          <span id={searchLabelId} hidden>{t('campaign.searchMaps')}</span>
          <input
            ref={searchRef}
            className="world-map-picker__search"
            type="search"
            value={query}
            placeholder={t('campaign.searchMaps')}
            aria-labelledby={searchLabelId}
            aria-controls={listId}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div id={listId} role="listbox" aria-labelledby={labelledBy} className="world-map-picker__list" {...STANDING_LIST}>
            {shown.map((choice) => (
              <button
                key={choice.id}
                type="button"
                role="option"
                aria-selected={choice.id === value}
                className="world-map-picker__option"
                onClick={() => pick(choice.id)}
              >
                <Thumb choice={choice} />
                <span className="world-map-picker__name">{choice.name}</span>
                <span className="world-map-picker__kind">{t(choice.kind === 'scene' ? 'campaign.kindScene' : 'campaign.kindMap')}</span>
                <Check aria-hidden="true" className="world-map-picker__check" />
              </button>
            ))}
            {shown.length === 0 && <div className="world-map-picker__none">{t('campaign.noMaps')}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
