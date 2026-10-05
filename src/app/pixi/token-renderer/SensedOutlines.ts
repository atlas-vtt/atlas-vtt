import { Container, Graphics } from 'pixi.js';
import { destroyTree } from '../utils/destroyTree';

/** Above the lighting layer (90), which is dark where a sensed token stands, and below the token UI (100). */
export const SENSED_OUTLINE_Z_INDEX = 95;

const LIGHT = 0xf2efe9;
const DARK = 0x000000;

/** A token the players sense without seeing it: where it is and how large. */
export interface SensedToken {
  id: string;
  x: number;
  y: number;
  /** Diameter in world pixels. */
  size: number;
  /** The pointer holds it: its outline is for the players' frame only (`heldView`). */
  held?: boolean;
}

interface Outline {
  graphics: Graphics;
  size: number;
  held: boolean;
}

/**
 * Tokens the players only sense (by tremorsense, hearing, scent): each is drawn as the outline
 * of its footprint with ripples inside, without art, nameplate, bars or conditions. Part of the
 * players' picture only: the layer is hidden unless the players' view shows it
 * (`playerLightingLayers`), and a picture of the scene hides it again. The outline of a token
 * the pointer holds is in `heldView`, which only a players' frame switches on: on the GM's
 * canvas the token itself stays under the pointer.
 */
export class SensedOutlines {
  readonly view = new Container({ label: 'sensedOutlines' });
  readonly heldView = new Container({ label: 'sensedOutlinesHeld', visible: false });
  private readonly outlines = new Map<string, Outline>();

  constructor() {
    this.view.zIndex = SENSED_OUTLINE_Z_INDEX;
    this.view.eventMode = 'none';
    this.view.visible = false;
    this.view.addChild(this.heldView);
  }

  /** Shows exactly `tokens`: new ones are drawn, the others moved, resized or removed. */
  sync(tokens: readonly SensedToken[]): void {
    const wanted = new Set(tokens.map((token) => token.id));
    for (const id of this.outlines.keys()) {
      if (!wanted.has(id)) this.syncOne(id, null);
    }
    for (const token of tokens) this.syncOne(token.id, token);
  }

  /** Updates or removes one moved token without visiting the other outlines. */
  syncOne(id: string, token: SensedToken | null): void {
    let outline = this.outlines.get(id);
    if (!token) {
      if (outline) destroyTree(outline.graphics);
      this.outlines.delete(id);
      return;
    }
    const { x, y, size, held = false } = token;
    if (!outline) {
      outline = { graphics: new Graphics(), size: 0, held: !held };
      this.outlines.set(id, outline);
    }
    if (outline.held !== held) {
      (held ? this.heldView : this.view).addChild(outline.graphics);
      outline.held = held;
    }
    if (outline.size !== size) {
      drawOutline(outline.graphics, size);
      outline.size = size;
    }
    if (outline.graphics.x !== x || outline.graphics.y !== y) outline.graphics.position.set(x, y);
  }

  /** The ids of the tokens outlined now. */
  shown(): string[] {
    return [...this.outlines.keys()];
  }

  destroy(): void {
    this.outlines.clear();
    destroyTree(this.view);
  }
}

/** The footprint's edge, light on a dark rim so it reads on any map, and two fainter ripples inside. */
function drawOutline(g: Graphics, size: number): void {
  const radius = size / 2;
  const width = Math.max(2, size * 0.045);
  g.clear();
  g.circle(0, 0, radius - width / 2).fill({ color: LIGHT, alpha: 0.06 });
  g.circle(0, 0, radius - width / 2).stroke({ color: DARK, width: width + 2, alpha: 0.5 });
  g.circle(0, 0, radius - width / 2).stroke({ color: LIGHT, width, alpha: 0.9 });
  g.circle(0, 0, radius * 0.62).stroke({ color: LIGHT, width: width * 0.6, alpha: 0.45 });
  g.circle(0, 0, radius * 0.28).stroke({ color: LIGHT, width: width * 0.6, alpha: 0.25 });
}
