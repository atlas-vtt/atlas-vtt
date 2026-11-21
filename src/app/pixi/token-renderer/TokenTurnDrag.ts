import { Container, type Graphics } from 'pixi.js';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { abandonHistoryTransaction, beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import { placesFreely } from '../../types/toolSwitches';
import { mapTokens } from '../../tokens/offMap';
import { levelObjects } from '../../levels/levelObjects';
import { destroyTree } from '../utils/destroyTree';
import { MAP_LAYER_Z } from '../mapLayerOrder';
import { facingMark } from '../tokenPlacement/facingMark';
import { facingTowards, handCentre, type Point } from '../tokenPlacement/placementLayout';

/** A token a turn holds: where it stands and how big it is drawn (its diameter, world pixels). */
export interface TurnedToken {
  readonly id: string;
  readonly at: Point;
  readonly diameter: number;
}

interface Turn {
  readonly centre: Point;
  /** Which way each token faced before, for a turn that is put back. */
  readonly before: ReadonlyMap<string, number | undefined>;
  readonly marks: readonly Graphics[];
  facing: number | null;
}

/**
 * Shift and a drag on a token turn it, or the selection it is part of, to look at the pointer, as
 * a token placed by hand is turned (`PlacementSession.turn`): every token faces the same way, from
 * the middle of their box, in 15° steps unless Alt (read with the Snap switch), and none moves. A
 * chevron outside each ring shows the way. The turn writes as it goes inside one history
 * transaction, so sight cones and grouped measurements follow live and the turn is one undo step.
 */
export class TokenTurnDrag {
  /** The chevrons: the GM's alone, never in the players' frame or a picture of the scene. */
  readonly layer = new Container();
  private turn: Turn | null = null;

  constructor(parent: Container, private readonly store: StoreApi<ViewAtlasState>, private readonly accent: () => number) {
    this.layer.eventMode = 'none';
    this.layer.zIndex = MAP_LAYER_Z.facing;
    parent.addChild(this.layer);
  }

  get turning(): boolean {
    return this.turn !== null;
  }

  begin(tokens: readonly TurnedToken[]): void {
    if (this.turn || tokens.length === 0) return;
    beginHistoryTransaction(this.store);
    const shown = mapTokens(levelObjects(this.store.getState()));
    const colour = this.accent();
    const marks = tokens.map(({ at, diameter }) => {
      const mark = facingMark(diameter / 2, colour);
      mark.position.set(at.x, at.y);
      mark.visible = false;
      this.layer.addChild(mark);
      return mark;
    });
    this.turn = {
      centre: handCentre(tokens.map(({ at }) => ({ home: at, size: 1 }))),
      before: new Map(tokens.map(({ id }) => [id, shown[id]?.rotation])),
      marks,
      facing: null,
    };
    // The token's UI steps aside as for a turn by its handle
    window.dispatchEvent(new CustomEvent('atlas-token-rotation-started', { detail: { tokenIds: tokens.map(({ id }) => id) } }));
  }

  /** The pointer is at `world`; `alt` turns freely (or in steps, where the Snap switch is off). */
  to(world: Point, alt: boolean): void {
    const turn = this.turn;
    if (!turn) return;
    const facing = facingTowards(turn.centre, world, placesFreely(this.store.getState(), 'selectSnap', alt));
    if (facing === turn.facing) return;
    turn.facing = facing;
    for (const mark of turn.marks) {
      mark.rotation = (facing * Math.PI) / 180;
      mark.visible = true;
    }
    this.store.getState().updateTokens([...turn.before.keys()].map((id) => ({ id, changes: { rotation: facing } })));
  }

  /** Leaves the tokens facing as turned: one undo step. */
  end(): void {
    if (!this.turn) return;
    this.clear();
    endHistoryTransaction(this.store);
  }

  /** Turns the tokens back as they faced and leaves no undo step. */
  cancel(): void {
    const turn = this.turn;
    if (!turn) return;
    this.clear();
    if (turn.facing !== null) this.store.getState().updateTokens([...turn.before].map(([id, rotation]) => ({ id, changes: { rotation } })));
    abandonHistoryTransaction(this.store);
  }

  destroy(): void {
    this.end();
    destroyTree(this.layer);
  }

  private clear(): void {
    const turn = this.turn;
    if (!turn) return;
    for (const mark of turn.marks) destroyTree(mark);
    this.turn = null;
    window.dispatchEvent(new CustomEvent('atlas-token-rotation-ended', { detail: { tokenIds: [...turn.before.keys()] } }));
  }
}
