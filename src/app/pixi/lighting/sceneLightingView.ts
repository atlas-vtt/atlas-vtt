import type { Texture } from 'pixi.js';
import type { ExploredEdit } from '../../lighting/exploredEdits';
import type { AmbientLight, LightReach, Sight } from '../../vision/sight';
import type { HideableLayer } from '../playerSafeFrame';
import type { SceneFrame } from './engine/types';

/** Who shows the GM the explored memory while it is edited (the lighting tool's overlay, `ExploredBrush`). */
export interface ExploredMemoryWatcher {
  /** The memory has a new texture, over the map's bounds, or none any more (null). Called before the last one is destroyed. */
  setTexture(texture: Texture | null): void;
  /** Undo (`undone`) or redo changed the memory, which the GM's own picture shows only in the tool's mode. */
  memoryTravelled(undone: boolean): void;
}

/** What the map view needs from scene lighting, on the GPU or in the Canvas fallback. */
export interface SceneLightingView {
  /** Visible means the players' view: flipped by the player-frame capture, held in session view. */
  readonly modeLayer: HideableLayer;
  isEnabled(): boolean;
  /**
   * Runs `render`, a render of `frame` (a thumbnail), with the scene lit for that frame as the GM
   * sees it, whatever camera and view the canvas shows. Lighting that fails here leaves the
   * render unlit.
   */
  renderForFrame<T>(frame: SceneFrame, render: () => T): T;
  currentSight(): Sight;
  /**
   * Whether `currentSight` is the sight of the scene the store holds: true while the scene is
   * unlit (sight hides nothing then), and once the view has worked out the sight of a lit one.
   * From a scene switch until the view has built the scene that arrives, it still holds the sight
   * of the scene before, and from a lost graphics context until the scene is built on the restored
   * one, the sight from before the loss.
   */
  sightIsCurrent(): boolean;
  lightReaches(): LightReach[];
  /** The ambient light the CPU checks tokens against. */
  ambientLight(): AmbientLight;
  refreshBounds(): void;
  /** Forgets all the scene remembers: an undo step where the memory can be edited. */
  resetExplored(): void;
  /**
   * Edits the explored memory by hand, as one undo step; it never changes what the tokens see
   * now. False when nothing changed, and where the view keeps no memory (the fallback).
   */
  editExplored(edit: ExploredEdit): boolean;
  /** The view's map is about to unload: finish pending saves for it. */
  beforeMapUnload(): void;
  destroy(): void;
}
