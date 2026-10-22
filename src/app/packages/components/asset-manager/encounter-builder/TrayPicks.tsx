import React, { useLayoutEffect, useRef, useState } from 'react';
import { TokenPortrait } from '../../shared/TokenPortrait';
import { Button } from '../../primitives/button';
import { DropdownMenu } from '../../primitives/DropdownMenu';
import { LabelTooltip } from '../../primitives/tooltip';
import { observeResize } from '../../../../utils/observeResize';
import { t } from '../../../../i18n';
import type { TokenAsset } from '../types';
import { CountStepper } from './CountStepper';
import type { EncounterPick } from './encounterPicks';

interface TrayPicksProps {
  picks: readonly EncounterPick[];
  onCountChange: (token: TokenAsset, count: number) => void;
  /** Shows the creature's statblock in the feed; null for a creature the feed cannot show. */
  revealOf: (token: TokenAsset) => (() => void) | null;
}

/** Room the "+N" button takes beside the chips that fit, with its gap. */
const OVERFLOW_ROOM = 52;
const CHIP_GAP = 4;

function PickChip({ pick, onCountChange, reveal, onRevealed }: {
  pick: EncounterPick;
  onCountChange: TrayPicksProps['onCountChange'];
  reveal: (() => void) | null;
  onRevealed?: () => void;
}): React.JSX.Element {
  const { token, count } = pick;
  const face = (
    <>
      <TokenPortrait src={token.thumbnailUrl ?? token.imageUrl} alt="" showRing={token.showRing} className="atlas-encounter-tray__portrait" />
      <span className="atlas-encounter-tray__name">{token.name}</span>
    </>
  );
  return (
    <>
      {reveal ? (
        <LabelTooltip label={t('encounter.builder.showStatblock', { name: token.name })}>
          <button type="button" className="atlas-encounter-tray__pick-face" onClick={() => { reveal(); onRevealed?.(); }}>{face}</button>
        </LabelTooltip>
      ) : <span className="atlas-encounter-tray__pick-face">{face}</span>}
      <CountStepper name={token.name} count={count} onChange={(next) => onCountChange(token, next)} />
    </>
  );
}

/**
 * The creatures of the encounter as chips, each opening its statblock in the feed. As many as the
 * tray has room for show; the others wait in the menu of the "+N" button at the end, so none hides
 * behind the tray's summary.
 */
export function TrayPicks({ picks, onCountChange, revealOf }: TrayPicksProps): React.JSX.Element {
  const listRef = useRef<HTMLUListElement>(null);
  const [fitting, setFitting] = useState(picks.length);
  const [menuOpen, setMenuOpen] = useState(false);

  // Every chip is measured as it would show, then those past the room are folded into the menu.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const fit = (): void => {
      const chips = Array.from(list.querySelectorAll<HTMLElement>(':scope > .atlas-encounter-tray__pick'));
      for (const chip of chips) chip.hidden = false;
      const widths = chips.map((chip) => chip.offsetWidth + CHIP_GAP);
      const room = list.clientWidth;
      const all = widths.reduce((sum, width) => sum + width, 0) - CHIP_GAP;
      let count = chips.length;
      if (all > room) {
        let used = 0;
        count = 0;
        while (count < widths.length && used + (widths[count] ?? 0) <= room - OVERFLOW_ROOM) used += widths[count++] ?? 0;
      }
      chips.forEach((chip, index) => { chip.hidden = index >= count; });
      setFitting(count);
    };
    fit();
    return observeResize([list], fit);
  }, [picks]);

  const overflow = picks.slice(fitting);
  return (
    <div className="atlas-encounter-tray__picks-wrap">
      <ul ref={listRef} className="atlas-encounter-tray__picks">
        {picks.map((pick) => (
          <li key={pick.token.id} className="atlas-encounter-tray__pick">
            <PickChip pick={pick} onCountChange={onCountChange} reveal={revealOf(pick.token)} />
          </li>
        ))}
      </ul>
      {overflow.length > 0 && (
        <DropdownMenu
          isOpen={menuOpen}
          onToggle={() => setMenuOpen(!menuOpen)}
          label={t('encounter.builder.moreCreatures', { count: overflow.length })}
          position="top"
          align="right"
          menuClassName="atlas-encounter-tray__overflow-menu"
          triggerButton={(
            <Button
              variant="ghost"
              className="atlas-encounter-tray__overflow"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t('encounter.builder.moreCreatures', { count: overflow.length })}
            >
              +{overflow.length}
            </Button>
          )}
        >
          <ul className="atlas-encounter-tray__overflow-list">
            {overflow.map((pick) => (
              <li key={pick.token.id} className="atlas-encounter-tray__pick">
                <PickChip pick={pick} onCountChange={onCountChange} reveal={revealOf(pick.token)} onRevealed={() => setMenuOpen(false)} />
              </li>
            ))}
          </ul>
        </DropdownMenu>
      )}
    </div>
  );
}
