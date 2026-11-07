import { Container, type Matrix, type Renderer, type RenderTexture } from 'pixi.js';
import { hasPendingChanges } from '../../RenderScheduler';
import { destroyTree } from '../../utils/destroyTree';

/** Over the map, beneath the tokens, as on the view's own stage (`MAP_LAYER_Z.liquids`). */
const LIQUIDS_Z = 1.5;
/** Below the lighting, as on the view's own stage (`LIGHTING_Z_INDEX` is 90). */
const TOKENS_Z = 50;
const LIGHTING_Z = 90;
/** Above the lighting, as the view's own roof (`ROOF_Z_INDEX`). */
const ROOF_Z = 91;
/** Above the lighting, as the view's own fog (1000). */
const FOG_Z = 1000;

/** What a level below shows, in world pixels: its map, its liquids, its tokens, its lighting, its roof and its fog, bottom to top. */
export interface BelowParts {
  map: Container;
  /** The level's water, lava and acid, held still, where the view's host draws them. */
  liquids?: Container | undefined;
  tokens: Container;
  lighting: Container;
  roof: Container;
  fog: Container;
}

/**
 * A level below the view, as a stage of its own that is never part of the view's (`BelowSnapshots`
 * renders it into the level's world-space snapshot): its map image, its liquids, its tokens, its
 * lighting layer, whose composite lights them as on the level itself, its roof, and its committed fog,
 * moved into the snapshot by the snapshot's camera. A render group of its own, so a change in it
 * shows as pending (`hasChanges`) though the view's stage holds nothing of it.
 */
export class BelowStage {
  readonly root = new Container({ label: 'level-below', isRenderGroup: true });
  private readonly world = new Container({ label: 'level-below-world', sortableChildren: true });

  constructor(parts: BelowParts) {
    parts.map.zIndex = 0;
    if (parts.liquids) {
      parts.liquids.zIndex = LIQUIDS_Z;
      this.world.addChild(parts.liquids);
    }
    parts.tokens.zIndex = TOKENS_Z;
    parts.lighting.zIndex = LIGHTING_Z;
    parts.roof.zIndex = ROOF_Z;
    parts.fog.zIndex = FOG_Z;
    this.world.addChild(parts.map, parts.tokens, parts.lighting, parts.roof, parts.fog);
    this.root.addChild(this.world);
  }

  /** Whether something in the stage changed since its last render. */
  hasChanges(): boolean {
    const group = this.root.renderGroup;
    return !!group && hasPendingChanges(group);
  }

  /** Renders the stage into `target` through `camera` (world to the target's points), over black. */
  render(renderer: Renderer, target: RenderTexture, camera: Matrix): void {
    this.world.setFromMatrix(camera);
    renderer.render({ container: this.root, target, clear: true, clearColor: [0, 0, 0, 1] });
  }

  /** Lets go of its parts without destroying them: their owners do. */
  release(): void {
    this.world.removeChildren();
    destroyTree(this.root);
  }
}
