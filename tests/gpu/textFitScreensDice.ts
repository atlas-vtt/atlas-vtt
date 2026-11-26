import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { DicePresetEditor } from '../../src/app/react/components/dice/DicePresetEditor';
import { DicePresetsPanel } from '../../src/app/react/components/dice/DicePresetsPanel';
import { DiceToast } from '../../src/app/react/components/dice/DiceToast';
import { DiceRollStack } from '../../src/app/react/components/dice3d/DiceRollStack';
import { throwStyle } from '../../src/app/dice3d/diceDisplay';
import { sceneFromRolls } from '../../src/app/dice3d/diceScene';
import { DiceTray } from '../../src/app/react/components/dice/DiceTray';
import { readDiceShelf, STANDARD_ROW } from '../../src/app/react/components/dice/diceShelf';
import type { DiceRollResult } from '../../src/app/types/diceTypes';
import type { DicePreset } from '../../src/app/types/dicePresetTypes';
import { t } from '../../src/app/i18n';
import { centreOf, mouse } from './realMouse';
import { all, settle, showing, type OpenedSurface, type ScreenSurface } from './textFitScreensSurfaces';

const h = React.createElement;
const noop = (): undefined => undefined;

const PRESETS: DicePreset[] = [
  {
    id: 'a', name: 'Longsword of the burning dawn', formula: '+3',
    look: { dice: [{ count: 1, sides: 8, name: 'Slashing', colour: '#b91c1c' }, { count: 1, sides: 6, name: 'Fire', colour: '#ea580c' }], crit: 'natural' },
  },
  { id: 'b', name: 'Duality', formula: '2d12' },
  { id: 'c', name: 'Stat line', formula: '4d6kh3' },
  { id: 'd', name: 'Smite', formula: '3d8kh1+3' },
];
const SHELF = readDiceShelf({
  dicePresets: PRESETS,
  diceRow: [...STANDARD_ROW.slice(0, 5), { kind: 'preset', id: 'a' }, { kind: 'die', sides: 3 }, { kind: 'preset', id: 'b' }],
});

const ROLLS: DiceRollResult[] = [
  {
    id: 'r1', timestamp: Date.now() - 60_000, formula: '1d20+5', modifiers: 5, total: 25, crit: 'high', advantage: 'advantage',
    rolls: [{ die: 'd20', value: 4, max: 20, dropped: true }, { die: 'd20', value: 20, max: 20 }],
    source: { type: 'statblock', tokenName: 'Ancient bog hag of the drowned chapel', abilityName: 'Claws of the marsh' },
  },
  {
    id: 'r2', timestamp: Date.now() - 30_000, formula: '2d6+1d8+3', modifiers: 3, total: 4, crit: 'low',
    rolls: [{ die: 'd6', value: 1, max: 6 }, { die: 'd6', value: 1, max: 6 }, { die: 'd8', value: 1, max: 8 }],
    namedModifiers: [{ value: 3, label: 'Proficiency' }],
  },
  { id: 'r3', timestamp: Date.now(), formula: '4d6kh3', modifiers: 0, total: 14, linear: false, rolls: [{ die: 'd6', value: 5, max: 6 }, { die: 'd6', value: 5, max: 6 }, { die: 'd6', value: 4, max: 6 }, { die: 'd6', value: 2, max: 6, dropped: true }] },
];

const ADVANTAGE = { sides: ['advantage', 'disadvantage'] as const, applies: () => true, dice: 'd20' };

function tray(extra: Partial<React.ComponentProps<typeof DiceTray>> = {}): React.ReactElement {
  return h(DiceTray, {
    memory: { formula: '2d12 + 3', side: 'advantage' }, onRemember: noop, check: () => null, onRoll: () => true, history: ROLLS,
    onRepeat: () => true, historyOpen: false, onHistoryOpen: noop, onClose: noop, shelf: SHELF, onShelfChange: noop,
    shareRolls: { shown: true, onToggle: noop }, advantage: { ...ADVANTAGE, sides: [...ADVANTAGE.sides] },
    presetsPanel: { open: true, onToggle: noop }, ...extra,
  });
}

/** The tray where the map's dice button opens it, the saved rolls beside it and a saved roll's editor above them. */
async function openSavedRolls(): Promise<OpenedSurface> {
  render(h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin', style: { position: 'relative', height: '100vh' } },
    h('div', { className: 'atlas-dice-tray', style: { left: '62%', bottom: 20, top: 'auto' } },
      h(DicePresetsPanel, { shelf: SHELF, onChange: noop, trayFormula: '2d12 + 3', problemOf: () => null, onRoll: noop, onEdit: noop, sets: [], editingId: 'a' },
        h(DicePresetEditor, { preset: SHELF.presets[0]!, onSave: noop, onClose: noop })),
      h('div', { className: 'atlas-dice-panel' }, tray())))));
  await settle(800);
  return {
    parts: {
      '': async () => document.body,
      'a saved roll\'s menu': async () => {
        const card = document.querySelectorAll('.atlas-dice-presets__item')[1]!;
        const roll = centreOf(card.querySelector('.atlas-dice-presets__roll')!);
        await mouse.hover(roll.x, roll.y);
        await settle(200);
        const more = centreOf(card.querySelector('.atlas-dice-presets__more')!);
        await mouse.click(more.x, more.y);
        await settle();
        return all('.atlas-ctx-menu');
      },
    },
    close: cleanup,
  };
}

/** The tray alone with its roll history open, then its row in edit mode. */
async function openHistory(): Promise<OpenedSurface> {
  render(h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin', style: { position: 'relative', height: '100vh' } },
    h('div', { className: 'atlas-dice-tray', style: { bottom: 20, top: 'auto' } },
      h('div', { className: 'atlas-dice-panel' }, tray({ historyOpen: true, presetsPanel: undefined }))))));
  await settle();
  return {
    parts: {
      '': async () => document.body,
      'editing the dice row': async () => {
        document.querySelector<HTMLElement>(`[aria-label="${t('diceRoll.rowEdit')}"]`)!.click();
        await settle();
        return document.body;
      },
    },
    close: cleanup,
  };
}

/** Rolls shown as cards, where 3D dice are off: one with its details open. */
async function openRollCards(): Promise<OpenedSurface> {
  render(h('div', { className: 'atlas-dice-rolls atlas-vtt-plugin', style: { position: 'absolute', top: 16, right: 16 } },
    ROLLS.map((result) => h(DiceToast, { key: result.id, result, phase: 'visible', onDismiss: noop, useAvatar: () => null }))));
  await settle();
  return {
    parts: {
      '': async () => document.body,
      'with details': async () => {
        document.querySelectorAll<HTMLElement>('.atlas-dice-toast button[aria-expanded]').forEach((button) => button.click());
        await settle();
        return document.body;
      },
    },
    close: cleanup,
  };
}

/** The same rolls thrown in 3D: the newest large, the older ones shrunk to rows above it. */
async function openRollPanels(): Promise<OpenedSurface> {
  const rolls = ROLLS.map((result) => ({ result, scene: sceneFromRolls(result.rolls)!, style: throwStyle('full') }));
  render(h('div', { className: 'atlas-dice-rolls atlas-vtt-plugin', style: { position: 'absolute', top: 16, right: 16 } },
    h(DiceRollStack, { rolls, muted: true, onClose: noop, onDone: noop, useAvatar: () => null })));
  await settle(1500);
  return { parts: { '': async () => showing(document.body, '.atlas-dice-roll__label') }, close: cleanup };
}

export const DICE_SURFACES: readonly ScreenSurface[] = [
  { name: 'dice tray with saved rolls', open: openSavedRolls },
  { name: 'dice tray history', open: openHistory },
  { name: 'roll cards', open: openRollCards },
  { name: '3D rolls', open: openRollPanels },
];
