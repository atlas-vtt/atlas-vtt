import { Container } from 'pixi.js';
import type { Sight } from '../../../vision/sight';
import { destroyTree } from '../../utils/destroyTree';
import type { PierceShape } from './DarknessMap';
import type { LightingMode } from './compositeFilter';
import { pierceShapes, sightFromOutside } from './senseDrawing';
import { SightMeshes } from './SightMeshes';
import type { EngineScene } from './types';

interface FrameSight {
  meshes: SightMeshes;
  sight: Sight;
  spots: EngineScene['spots'];
  radius: number;
  outside: readonly PierceShape[];
  pierce: readonly PierceShape[];
}

/** What a sense without a range is given on a map of `bounds`: its diagonal (`sightSources`). */
function unlimitedOn(bounds: EngineScene['bounds']): number {
  return Math.hypot(bounds.width, bounds.height);
}

/** What a frame draws into the darkness map. */
function darknessShapes(sight: Sight, spots: EngineScene['spots'], outside: readonly PierceShape[]): PierceShape[] {
  return [...pierceShapes(sight, sight.all ? [] : spots), ...outside];
}

/** Keeps both current frame pictures ready, so mirroring switches no geometry. */
export class SceneSightLayers {
  readonly view = new Container({ label: 'frameSight' });
  private gm: FrameSight | null = null;
  private player: FrameSight | null = null;
  private outside: { sight: Sight; shapes: readonly PierceShape[] } | null = null;

  update(scene: EngineScene): void {
    const unlimited = unlimitedOn(scene.bounds);
    const sight = scene.playerSight ?? scene.sight;
    const spots = scene.playerSpots ?? scene.spots;
    // Both frames hold the players' shapes, though only their picture reads them: switching frames then has nothing to draw anew.
    if (this.outside?.sight !== sight) this.outside = { sight, shapes: sightFromOutside(sight) };
    const outside = this.outside.shapes;
    this.gm = this.updateFrame(this.gm, scene.sight, scene.spots, scene.sightRadius, unlimited, outside);
    if (sight === scene.sight && spots === scene.spots) {
      this.player?.meshes.destroy();
      this.player = null;
    } else {
      this.player = this.updateFrame(this.player, sight, spots, scene.sightRadius, unlimited, outside);
    }
  }

  select(mode: LightingMode): Pick<FrameSight, 'sight' | 'spots' | 'pierce'> | null {
    if (!this.gm) return null;
    const selected = mode === 'player' && this.player ? this.player : this.gm;
    this.gm.meshes.view.visible = selected === this.gm;
    if (this.player) this.player.meshes.view.visible = selected === this.player;
    return selected;
  }

  clear(): void {
    this.gm?.meshes.destroy();
    this.player?.meshes.destroy();
    this.gm = null;
    this.player = null;
    this.outside = null;
  }

  destroy(): void {
    this.clear();
    destroyTree(this.view);
  }

  private updateFrame(frame: FrameSight | null, sight: Sight, spots: EngineScene['spots'], radius: number, unlimited: number, outside: readonly PierceShape[]): FrameSight {
    if (!frame) {
      const meshes = new SightMeshes();
      this.view.addChild(meshes.view);
      meshes.draw(sight, radius, unlimited);
      meshes.drawSpots(sight.all ? [] : spots ?? []);
      return { meshes, sight, spots, radius, outside, pierce: darknessShapes(sight, spots, outside) };
    }
    const sightChanged = sight !== frame.sight;
    const spotsChanged = spots !== frame.spots;
    if (sightChanged || radius !== frame.radius) frame.meshes.draw(sight, radius, unlimited);
    if (spotsChanged || sight.all !== frame.sight.all) frame.meshes.drawSpots(sight.all ? [] : spots ?? []);
    if (sightChanged || spotsChanged || outside !== frame.outside) frame.pierce = darknessShapes(sight, spots, outside);
    frame.sight = sight;
    frame.spots = spots;
    frame.radius = radius;
    frame.outside = outside;
    return frame;
  }
}
