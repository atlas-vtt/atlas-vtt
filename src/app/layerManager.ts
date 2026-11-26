// layer-manager.ts
import { Container } from 'pixi.js';
import { destroyTree } from './pixi/utils/destroyTree';

export class LayerManager {
    private layers = new Map<string, Container>();
  
    constructor(private readonly vp: Container) {
      this.vp.sortableChildren = true;       // one‑time setup
    }
  
    get(name: string, z: number): Container {
      let c = this.layers.get(name);
      if (!c) {
        c = new Container();
        c.label  = name;
        c.zIndex = z;
        this.vp.addChild(c);
        this.layers.set(name, c);
        this.vp.sortChildren();
      }
      return c;
    }
  
    all(): Container[] { return Array.from(this.layers.values()); }
  
    destroy(): void {                 // called from React unmount
      this.layers.forEach(l => destroyTree(l));
      this.layers.clear();
    }
  }