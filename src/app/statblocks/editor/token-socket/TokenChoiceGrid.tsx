import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import { Skeleton, SkeletonGroup } from '../../../packages/components/primitives/Skeleton';
import { tokenDetails } from './tokenDetails';
import type { CardToken } from './useNoteTokens';
import { t } from '../../../i18n';

const PLACEHOLDERS = 8;

export interface TokenChoiceGridProps {
  tokens: readonly CardToken[];
  /** Ids of the tokens linked to the note: they show ticked, and choosing one again does nothing. */
  linkedIds: ReadonlySet<string>;
  loaded: boolean;
  /** While a link is being made, nothing else can be chosen. */
  busy: boolean;
  onChoose: (token: CardToken) => void;
  /** The panel's search: the tokens whose name holds it are shown. */
  query: string;
  /** The search field, where Up from the first row goes. */
  searchRef: React.RefObject<HTMLInputElement | null>;
}

/** The index the arrow key moves to in a grid of `count` buttons `columns` wide; null where it leaves the grid. */
export function gridStep(key: string, index: number, count: number, columns: number): number | null {
  const next = ((): number => {
    switch (key) {
      case 'ArrowLeft': return index - 1;
      case 'ArrowRight': return index + 1;
      case 'ArrowUp': return index - columns;
      case 'ArrowDown': return index + columns;
      case 'Home': return 0;
      case 'End': return count - 1;
      default: return Number.NaN;
    }
  })();
  return Number.isInteger(next) && next >= 0 && next < count ? next : null;
}

/** How many buttons the grid's first row holds. */
function columnsOf(buttons: readonly HTMLElement[]): number {
  const top = buttons[0]?.offsetTop;
  const columns = buttons.findIndex((button) => button.offsetTop !== top);
  return columns <= 0 ? Math.max(1, buttons.length) : columns;
}

/**
 * The collection's tokens to link, searched by name: one tab stop, the arrow
 * keys move between tokens (Up from the first row, back to the search; Down
 * from the search reaches the tab stop), and Enter or a click links the one
 * in focus. Cards are the asset manager's art:
 * the thumbnail, or a placeholder while it is made.
 */
export function TokenChoiceGrid({ tokens, linkedIds, loaded, busy, onChoose, query, searchRef }: TokenChoiceGridProps): React.JSX.Element {
  const [active, setActive] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setActive(0); }, [query]);
  const shown = useMemo(() => {
    const wanted = query.trim().toLowerCase();
    return wanted ? tokens.filter((token) => token.name.toLowerCase().includes(wanted)) : tokens;
  }, [tokens, query]);
  const details = useMemo(() => tokenDetails(tokens), [tokens]);
  const focusable = Math.min(active, Math.max(0, shown.length - 1));

  const buttons = (): HTMLElement[] => [...gridRef.current?.querySelectorAll<HTMLElement>('.atlas-sb-token-choice') ?? []];
  const focusAt = (index: number): void => {
    setActive(index);
    buttons()[index]?.focus();
  };

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const all = buttons();
    const index = all.indexOf(event.target as HTMLElement);
    if (index < 0) return;
    const columns = columnsOf(all);
    const next = gridStep(event.key, index, all.length, columns);
    if (next !== null) {
      event.preventDefault();
      focusAt(next);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      searchRef.current?.focus();
    }
  };

  if (!loaded) {
    return (
      <SkeletonGroup className="atlas-sb-token-grid" label={t('statblockEditor.token.loading')}>
        {Array.from({ length: PLACEHOLDERS }, (_, index) => (
          <span key={index} className="atlas-sb-token-choice atlas-sb-token-choice--placeholder">
            <Skeleton shape="circle" className="atlas-sb-token-choice__art" />
            <Skeleton shape="text" width="70%" />
          </span>
        ))}
      </SkeletonGroup>
    );
  }
  if (tokens.length === 0) return <p className="atlas-sb-token-panel__empty">{t('statblockEditor.token.none')}</p>;
  if (shown.length === 0) return <p className="atlas-sb-token-panel__empty">{t('statblockEditor.token.noMatch', { query: query.trim() })}</p>;
  return (
    <div ref={gridRef} className="atlas-sb-token-grid" role="group" aria-label={t('statblockEditor.token.tokens')} onKeyDown={onGridKeyDown}>
      {shown.map((token, index) => {
        const linked = linkedIds.has(token.id);
        return (
          <button
            key={token.id}
            type="button"
            className="atlas-sb-token-choice"
            tabIndex={index === focusable ? 0 : -1}
            // Never `disabled` while a link is made: a disabled button drops the focus out of the panel.
            aria-disabled={linked || busy || undefined}
            data-linked={linked || undefined}
            onFocus={() => setActive(index)}
            onClick={() => { if (!linked) onChoose(token); }}
          >
            <span className="atlas-sb-token-choice__art">
              <TokenPortrait
                src={token.thumbnailUrl || token.imageUrl}
                alt=""
                showRing={token.showRing !== false}
                reveal
                pending={token.thumbnailPending}
              />
              {linked && <Check className="atlas-sb-token-choice__tick" aria-hidden="true" />}
            </span>
            <span className="atlas-sb-token-choice__name">{token.name}</span>
            {details.get(token.id) && <span className="atlas-sb-token-choice__detail">{details.get(token.id)}</span>}
            {linked && <span className="atlas-sb-token-panel__hidden">, linked</span>}
          </button>
        );
      })}
    </div>
  );
}
