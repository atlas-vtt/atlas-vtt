import type { GmMessage, SharedRollDice, SharedRules } from '../protocol/index.ts';
import { MAX_COORDINATE } from '../protocol/index.ts';
import { areaRulesOf, readUnitName, resolveMeasurementSettings, type MeasurementSettings } from '../../grid/measurementFormat';
import type { SceneState, SceneStore } from './atlasView.ts';

export interface RulesSharePorts {
  send(body: GmMessage, to?: string): void;
  /** How the GM's own ruler labels distances on this map, or null while it cannot be read. */
  measurement?(): MeasurementSettings | null;
  /** The GM's accent colour as `#rrggbb`, or null while it cannot be read. */
  accent?(): string | null;
  /** Whether the GM lets everyone see each other's cursor: only then do players send theirs. */
  cursorsShown?(): boolean;
  /** The map's dice, by which a page offers advantage on a roll for no token of a set of its own; null while the tab has none. */
  rollDice?(): SharedRollDice | null;
  /** While the GM lets players draw: the cell their Draw tool's sizes are shares of; null while it does not. */
  draw?(): { readonly cell: number } | null;
}

/**
 * The diagonal rule as every page can read it. An older page has no word for `manhattan` and
 * refuses rules it cannot read whole, so it is told the nearest rule it knows (5/10/5); the rule
 * itself goes out beside it (`SharedMeasurement.manhattan`).
 */
function sharedDiagonalRule(rule: MeasurementSettings['diagonalRule']): SharedRules['measurement']['diagonalRule'] {
  return rule === 'manhattan' ? 'alternating' : rule;
}

/**
 * The unit as every page can read it. A unit the GM named goes out as `custom`, so an older page
 * reads the bare number, never another unit's sign after it; the name goes out beside it
 * (`SharedMeasurement.unitName`).
 */
function sharedUnitType(unitType: MeasurementSettings['unitType'], unitName: string | undefined): SharedRules['measurement']['unitType'] {
  return unitName ? 'custom' : unitType;
}

/** What an older page does not read of a measurement: the rules that came later, each told only where it is not what such a page takes it for. */
function laterRules(settings: MeasurementSettings): Pick<SharedRules['measurement'], 'manhattan' | 'coneEnd' | 'cellRule' | 'unitName'> {
  const { cellRule, coneEnd } = areaRulesOf(settings);
  const unitName = readUnitName(settings.unitName);
  return {
    ...(settings.diagonalRule === 'manhattan' && { manhattan: true as const }),
    ...(coneEnd === 'flat' && { coneEnd }),
    ...(cellRule !== 'half' && { cellRule }),
    ...(unitName !== undefined && { unitName }),
  };
}

const finiteOr = (value: number | undefined, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/**
 * What a player's measure and laser tools work by, from the scene's grid, the GM's measurement (else
 * the grid's own, as Atlas's ruler falls back to), accent and whether everyone's cursor shows, and
 * the map's dice where the tab has them; null for a grid players cannot use.
 */
export function sharedRules(grid: SceneState['grid'], measurement: MeasurementSettings | null, accent: string | null, cursors = false, dice: SharedRollDice | null = null, draw: { readonly cell: number } | null = null): SharedRules | null {
  if (grid === null || !Number.isFinite(grid.size) || !(grid.size > 0) || grid.size > MAX_COORDINATE) return null;
  const offsetX = finiteOr(grid.offsetX, 0);
  const offsetY = finiteOr(grid.offsetY, 0);
  if (Math.abs(offsetX) > MAX_COORDINATE || Math.abs(offsetY) > MAX_COORDINATE) return null;
  const settings = measurement ?? resolveMeasurementSettings(undefined, grid);
  const { mode, unitType, unitName, unitDistance, ruleDistance, diagonalRule, rangeBands, coneAngle } = settings;
  return {
    grid: { type: grid.type ?? 'square', size: grid.size, offsetX, offsetY },
    snap: grid.snapToGrid ?? true,
    measurement: {
      mode, unitType: sharedUnitType(unitType, unitName), unitDistance, ruleDistance, diagonalRule: sharedDiagonalRule(diagonalRule),
      rangeBands: rangeBands.map(({ name, maxSquares }) => ({ name, maxSquares })), coneAngle, ...laterRules(settings),
    },
    accent,
    ...(cursors && { cursors }),
    ...(dice !== null && { dice }),
    ...(draw !== null && Number.isFinite(draw.cell) && draw.cell > 0 && draw.cell <= MAX_COORDINATE && { draw: { cell: draw.cell } }),
  };
}

/**
 * The shared scene's rules (`sharedRules`), sent to all when the scene is shared, to a player who
 * joins, and again whenever they changed when `update` looks (once a second, with the scene's poll):
 * so a GM who lets players draw, or no longer, is followed by a running table within that second.
 */
export class RulesShare {
  private readonly store: SceneStore;
  private readonly ports: RulesSharePorts;
  private scene: string | null = null;
  private last: { readonly body: GmMessage; readonly text: string } | null = null;

  constructor(store: SceneStore, ports: RulesSharePorts) {
    this.store = store;
    this.ports = ports;
  }

  /** The shared scene the rules belong to; null sends none. */
  setScene(scene: string | null): void {
    this.scene = scene;
    this.last = null;
    this.update();
  }

  /** Sends the rules when they changed since they were last sent. */
  update(): void {
    if (this.scene === null) return;
    const state = this.store.getState();
    const rules = sharedRules(state.grid, this.ports.measurement?.() ?? null, this.ports.accent?.() ?? null, this.ports.cursorsShown?.() === true, this.ports.rollDice?.() ?? null, this.ports.draw?.() ?? null);
    if (rules === null) return;
    const body: GmMessage = { t: 'rules', scene: this.scene, ...rules };
    const text = JSON.stringify(body);
    if (text === this.last?.text) return;
    this.last = { body, text };
    this.ports.send(body);
  }

  /** The last rules again, to one player or to all. */
  resend(to?: string): void {
    if (this.last !== null) this.ports.send(this.last.body, to);
  }
}
