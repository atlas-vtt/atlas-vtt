import { setRoll } from '../../gameSystems/diceSets';
import type { CollectionLookup } from '../../gameSystems/mapRules';
import { readDiceShelf, type DiceShelf } from '../../react/components/dice/diceShelf';
import type { DicePreset } from '../../types/dicePresetTypes';
import type { RollingDice } from '../../types/diceSetTypes';
import type { SharedRowPlace, SharedRowRoll } from '../protocol/index.ts';
import type { SceneStore } from './atlasView.ts';
import type { SceneSharePorts } from './sceneSharePorts.ts';

/** A saved roll whose dice are designed in the Dice Lab. */
export type DesignedRoll = DicePreset & { look: RollingDice };

/** The shared map's dice shelf: its collection's saved rolls and tray row; null for a map in no collection, or none to read. */
export function mapDiceShelf(lookup: CollectionLookup | null, mapPath: string | null): DiceShelf | null {
  if (lookup === null || mapPath === null) return null;
  const collectionId = lookup.getCollectionForMap(mapPath);
  return collectionId === null ? null : readDiceShelf(lookup.getCollectionSettings(collectionId));
}

/** The dice shelf of the shared tab's map, as its own tray reads it. */
export function sceneDiceShelf(ports: Pick<SceneSharePorts, 'mapLayers'>, store: SceneStore): DiceShelf | null {
  return mapDiceShelf(ports.mapLayers?.()?.rules() ?? null, store.getState().mapPath);
}

function sharedRoll(preset: DicePreset): SharedRowRoll {
  const { id, name, formula, look } = preset;
  if (!look) return { id, name, formula };
  const dice = look.dice.map(({ count, sides, name: dieName, colour }) => ({ count, sides, ...(dieName && { name: dieName }), ...(colour && { colour }) }));
  return { id, name, formula, look: dice };
}

/**
 * The tray row players are shown: the GM's dice and pinned saved rolls in the GM's order, or null where the
 * map has the standard dice (players then show their own standard row).
 */
export function sharedDiceRow(shelf: DiceShelf | null): SharedRowPlace[] | null {
  if (shelf === null || !shelf.ownRow) return null;
  return shelf.row.flatMap((slot): SharedRowPlace[] => {
    if (slot.kind === 'die') return [{ die: slot.sides }];
    const preset = shelf.presets.find((kept) => kept.id === slot.id);
    return preset === undefined ? [] : [{ roll: sharedRoll(preset) }];
  });
}

/** The designed roll pinned to the row by `id`, which a player may roll; null for any roll that is not. */
export function pinnedDesignedRoll(shelf: DiceShelf | null, id: string): DesignedRoll | null {
  if (shelf === null || !shelf.row.some((slot) => slot.kind === 'preset' && slot.id === id)) return null;
  const preset = shelf.presets.find((kept) => kept.id === id);
  return preset?.look ? { ...preset, look: preset.look } : null;
}

/** A designed roll's dice written out, then its bonus (`1d12+1d12+2`): rolled with its own set, the dice take their names and colours. */
export const designedRollFormula = (preset: DesignedRoll): string => `${setRoll(preset.look.dice)}${preset.formula}`;
