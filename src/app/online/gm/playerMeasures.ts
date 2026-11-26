import { MAX_KEPT, type FullMeasure, type PlayerMeasureDrop, type PlayerMeasureKeep } from '../protocol/index.ts';
import { levelObjects } from '../../levels/levelObjects';
import { measureList } from '../../measure/keptMeasures';
import type { KeptMeasure } from '../../measure/measureTypes';
import { keepNewMeasure } from '../../stores/measuresSlice';
import { measureFromFull, plainMeasure } from '../marks/index.ts';
import type { SceneStore } from './atlasView.ts';
import { fullNearMap } from './markCheck.ts';
import { MoveRate, type MapSize } from './moveCheck.ts';
import { PlayerAliases } from './playerDrawingState.ts';

export interface PlayerMeasurePorts {
  now(): number;
  /** Whether a player sits at the table and looks at this floor. */
  seated(player: string): boolean;
  /** The scene players were sent last, which a request must name; null while none is shared. */
  scene(): string | null;
  /** The map's size, which a measurement must lie near; null while it is unknown. */
  map(): MapSize | null;
}

/** Measurements a player may keep or let go: a burst as large as all they may have, then two a second. */
const KEEPS_PER_SECOND = 2;

/**
 * The measurements players keep on one floor of the shared scene. A player's page asks; this decides and writes,
 * each taken request one write of the GM's store and so one undo step. A kept measurement is the scene's from
 * then on, as the GM's own are (`KeptMeasure`, with `by`: who kept it): the GM moves, sizes, turns, colours and
 * deletes it by its handles and popover, it is saved with the scene, and players are told it with the GM's own
 * (`GmMeasures`), so it looks the same to everyone.
 *
 * A request is dropped unless its sender sits at the table, names the scene of the floor they see and is within
 * its rate. A measurement is taken with nothing but what it measures (`plainMeasure`: no colour, effect or aura of
 * a page's saying), near the map, and only while its keeper has fewer than `MAX_KEPT` on the floor. A player lets
 * go only what they kept and is still theirs, named by the ids they were told (`told`), never the scene's own.
 */
export class PlayerMeasures {
  private readonly aliases = new PlayerAliases();
  private readonly rate = new MoveRate(MAX_KEPT, KEEPS_PER_SECOND);

  constructor(private readonly store: SceneStore, private readonly ports: PlayerMeasurePorts) {}

  receive(from: string, message: PlayerMeasureKeep | PlayerMeasureDrop): void {
    if (!this.ports.seated(from) || this.ports.scene() === null || message.scene !== this.ports.scene()) return;
    if (!this.rate.take(from, this.ports.now())) return;
    if (message.t === 'measure-keep') this.keep(from, message.measure);
    else this.drop(from, message.ids);
  }

  /** Who kept `measure` and the id they let it go by, as players are told it; null for one of the GM's own. */
  told(measure: Pick<KeptMeasure, 'id' | 'by'>): { readonly by: string; readonly id: string } | null {
    return measure.by === undefined ? null : { by: measure.by, id: this.aliases.of(measure.by, measure.id) };
  }

  private own(from: string): readonly KeptMeasure[] {
    return measureList(levelObjects(this.store.getState()).measures).filter((measure) => measure.by === from);
  }

  private keep(from: string, said: FullMeasure): void {
    const plain = plainMeasure(said);
    if (!fullNearMap(plain, this.ports.map()) || this.own(from).length >= MAX_KEPT) return;
    const { shape, points, width, walls } = measureFromFull(plain);
    this.store.setState((draft) => {
      keepNewMeasure(draft, { shape, points: points.map(({ x, y }) => ({ x, y })), ...(width !== undefined && { width }), ...(walls === false && { walls }), by: from });
    });
  }

  private drop(from: string, ids: readonly string[]): void {
    const own = new Set(this.own(from).map((measure) => measure.id));
    const gone = ids.flatMap((alias) => this.aliases.idOf(from, alias) ?? []).filter((id) => own.has(id));
    if (gone.length === 0) return;
    this.store.setState((draft) => {
      for (const id of gone) delete draft.objects.measures?.[id];
    });
    this.aliases.keep(from, (id) => !gone.includes(id));
  }
}
