import React from 'react';
import { LabelTooltip, TooltipProvider } from '../../../packages/components/primitives/tooltip';
import type { DicePreset, DiceRowSlot } from '../../../types/dicePresetTypes';
import { DieFace } from './DieFace';
import { PresetFace } from './PresetFace';
import { PresetLookFace } from './PresetLookFace';
import { presetText } from './presetLook';
import { MAX_DICE, MAX_PER_DIE, TRAY_TOOLTIP_GAP, trayDiceCount, type TrayPool } from './diceTrayPool';
import { presetCount } from './diceTrayText';
import { t } from '../../../i18n';

interface DiceTrayDiceProps {
  row: readonly DiceRowSlot[];
  presets: readonly DicePreset[];
  /** What the tray holds: the badges on the dice and the saved rolls. */
  formula: string;
  counts: TrayPool;
  onAdd: (slot: DiceRowSlot) => void;
  onTakeBack: (slot: DiceRowSlot) => void;
  /** Rolls one die, or a saved roll, at once, with the tray's modifier and side of advantage. */
  onRollNow: (slot: DiceRowSlot) => void;
}

/** Why a click puts no more dice of `sides` in the tray; null while it does. */
function limitOf(sides: number, counts: TrayPool): string | null {
  if ((counts[sides] ?? 0) >= MAX_PER_DIE) return t('diceRoll.dieLimit', { sides, max: MAX_PER_DIE });
  if (trayDiceCount(counts) >= MAX_DICE) return t('diceRoll.diceLimit', { max: MAX_DICE });
  return null;
}

/** Places in one line of the row: more wrap into a second, so the tray stays as wide as eight dice. */
export const ROW_COLUMNS = 8;

/** The columns of a row of `places`: as many as it has, at most `ROW_COLUMNS`. */
export const rowColumns = (places: number): number => Math.min(Math.max(places, 1), ROW_COLUMNS);

/** The number key of a place in the row: 1 to 9, then 0. */
export const placeKey = (place: number): string => String((place + 1) % 10);

export interface Face {
  key: string;
  caption: string;
  name: string;
  hint: string;
  held: number;
  limit: string | null;
  art: React.ReactNode;
}

export function faceOf(slot: DiceRowSlot, presets: readonly DicePreset[], formula: string, counts: TrayPool): Face | null {
  if (slot.kind === 'die') {
    const held = counts[slot.sides] ?? 0;
    const name = t('diceRoll.die', { sides: slot.sides });
    return {
      key: name, caption: name, name: held === 0 ? name : t('diceRoll.dieHeld', { sides: slot.sides, held }),
      hint: t('diceRoll.dieHint'), held, limit: limitOf(slot.sides, counts), art: <DieFace sides={slot.sides} />,
    };
  }
  const preset = presets.find((candidate) => candidate.id === slot.id);
  if (!preset) return null;
  if (preset.look) {
    const look = preset.look;
    return {
      key: preset.id, caption: preset.name, name: preset.name, held: 0, limit: null,
      hint: `${presetText(preset)} · ${t('diceRoll.presetRollsAtOnce')}`,
      art: <PresetLookFace preset={{ ...preset, look }} />,
    };
  }
  const held = presetCount(formula, preset.formula);
  return {
    key: preset.id, caption: preset.name,
    name: held === 0 ? preset.name : t('diceRoll.presetHeld', { name: preset.name, held }),
    hint: `${preset.formula} · ${t('diceRoll.dieHint')}`, held, limit: null,
    art: <PresetFace formula={preset.formula} />,
  };
}

/**
 * The row: the collection's dice and saved rolls, each named under it. A click (or its number key, its place in
 * the row) puts one in the tray, Shift-click rolls it at once, right-click (or Alt-click, or Delete) takes one
 * back. A die at its limit stays focusable and says why in its tooltip, and still gives dice back.
 */
export function DiceTrayDice({ row, presets, formula, counts, onAdd, onTakeBack, onRollNow }: DiceTrayDiceProps): React.ReactElement {
  const faces = row.flatMap((slot) => {
    const face = faceOf(slot, presets, formula, counts);
    return face ? [{ slot, face }] : [];
  });
  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={600}>
      <div className="atlas-dice-tray__dice" style={{ '--atlas-tray-slots': rowColumns(faces.length) } as React.CSSProperties}>
        {faces.map(({ slot, face }, place) => {
          const onClick = (event: React.MouseEvent): void => {
            if (event.altKey) onTakeBack(slot);
            else if (event.shiftKey) onRollNow(slot);
            else if (!face.limit) onAdd(slot);
          };
          const onKeyDown = (event: React.KeyboardEvent): void => {
            if (event.key !== 'Delete' && event.key !== 'Backspace') return;
            event.preventDefault();
            onTakeBack(slot);
          };
          return (
            <div key={face.key} className="atlas-dice-tray__die">
              <LabelTooltip sideOffset={TRAY_TOOLTIP_GAP} label={face.caption} hint={face.limit ?? face.hint} shortcut={placeKey(place)} describe>
                <button
                  type="button"
                  className="atlas-dice-tray__face"
                  aria-disabled={face.limit ? true : undefined}
                  aria-label={face.name}
                  onClick={onClick}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onTakeBack(slot);
                  }}
                  onKeyDown={onKeyDown}
                >
                  {face.art}
                  {/* One badge for as long as the die is held: its pop plays once, a quick second click never restarts it. */}
                  {face.held > 0 && <span className="atlas-dice-tray__count" aria-hidden="true">{face.held}</span>}
                </button>
              </LabelTooltip>
              <span className="atlas-dice-tray__caption" aria-hidden="true">{face.caption}</span>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
