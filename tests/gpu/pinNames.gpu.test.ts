import '../setup/obsidianDom';
import { Application, Container } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { drawPinFace } from '../../src/app/pixi/pinFace';
import { pinNameBoxes } from '../../src/app/pixi/pinNameLayout';
import type { PinNameLabel } from '../../src/app/pixi/pinNameLabel';
import { pinSize } from '../../src/app/styles/designTokens';
import type { NotePin } from '../../src/app/types';

const pin = (id: string, x: number, y: number, extra: Partial<NotePin> = {}): NotePin =>
  ({ id, kind: 'pin', x, y, notePath: `Places/${id}.md`, showName: true, icon: 'city', ...extra });

/** Pins with their names in a real renderer: each name centred under its badge, crowding names hidden. */
describe('pin names on the map', () => {
  const style = document.createElement('style');
  style.textContent = css;
  let app: Application | null = null;
  afterEach(() => {
    app?.destroy(true, { children: true });
    app = null;
    style.remove();
  });

  it('stand centred under their badge, and hide where they would cover another', async () => {
    document.head.append(style);
    document.body.className = 'theme-dark';
    await page.viewport(640, 360);
    app = new Application();
    await app.init({ width: 640, height: 360, background: 0x3a3428, antialias: true, resolution: window.devicePixelRatio });
    document.body.append(app.canvas);

    const pins = [
      pin('Saltmarsh', 120, 140),
      pin('Harbour', 165, 150),
      pin('Old Mill', 420, 120, { name: 'The Old Mill', icon: 'number', label: '3' }),
      pin('Seawall', 300, 250, { notePath: 'Places/Saltmarsh.md#The Sea Wall' }),
    ];
    const groups: Record<string, Container> = {};
    const names = new Map<string, PinNameLabel>();
    for (const p of pins) {
      const { view, name } = drawPinFace(p, () => null, { marks: true, named: true });
      const group = new Container();
      group.position.set(p.x, p.y);
      group.addChild(view);
      app.stage.addChild(group);
      groups[p.id] = group;
      if (name) {
        name.draw(1, 1);
        names.set(p.id, name);
      }
    }
    const shown = pinNameBoxes(names, groups, 1);
    for (const [id, name] of names) name.view.visible = shown.has(id);
    app.render();

    // Saltmarsh's name would cover Harbour's badge, so it waits for the map to zoom in
    expect([...shown].sort()).toEqual(['Harbour', 'Old Mill', 'Seawall']);
    for (const [id, name] of names) {
      const box = name.box();
      expect(box.left + box.right, id).toBeCloseTo(0, 5);
      expect(box.top, id).toBeGreaterThan(pinSize.badgeRadius);
    }
  });
});
