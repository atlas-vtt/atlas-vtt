import { Container } from 'pixi.js';
import type { Sight } from '../../../vision/sight';
import { destroyTree } from '../../utils/destroyTree';
import type { PierceShape } from './DarknessMap';
import type { LightingMode } from './compositeFilter';
import { pierceShapes } from './senseDrawing';
import { SightMeshes } from './SightMeshes';
import type { EngineScene } from './types';

interface FrameSight {
  meshes: SightMeshes;
  sight: Sight;
  spots: EngineScene['spots'];
  radius: number;
  pierce: readonly PierceShape[];
}

/** Keeps both current frame pictures ready, so mirroring switches no geometry. */
export class SceneSightLayers {
  readonly view = new Container({ label: 'frameSight' });
  private gm: FrameSight | null = null;
  private player: FrameSight | null = null;

  update(scene: EngineScene): void {
    this.gm = this.updateFrame(this.gm, scene.sight, scene.spots, scene.sightRadius);
    const sight = scene.playerSight ?? scene.sight;
    const spots = scene.playerSpots ?? scene.spots;
    if (sight === scene.sight && spots === scene.spots) {
      this.player?.meshes.destroy();
      this.player = null;
    } else {
      this.player = this.updateFrame(this.player, sight, spots, scene.sightRadius);
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
  }

  destroy(): void {
    this.clear();
    destroyTree(this.view);
  }

  private updateFrame(frame: FrameSight | null, sight: Sight, spots: EngineScene['spots'], radius: number): FrameSight {
    if (!frame) {
      const meshes = new SightMeshes();
      this.view.addChild(meshes.view);
      meshes.draw(sight, radius);
      meshes.drawSpots(sight.all ? [] : spots ?? []);
      return { meshes, sight, spots, radius, pierce: pierceShapes(sight, sight.all ? [] : spots) };
    }
    const sightChanged = sight !== frame.sight;
    const spotsChanged = spots !== frame.spots;
    if (sightChanged || radius !== frame.radius) frame.meshes.draw(sight, radius);
    if (spotsChanged || sight.all !== frame.sight.all) frame.meshes.drawSpots(sight.all ? [] : spots ?? []);
    if (sightChanged || spotsChanged) frame.pierce = pierceShapes(sight, sight.all ? [] : spots);
    frame.sight = sight;
    frame.spots = spots;
    frame.radius = radius;
    return frame;
  }
}
