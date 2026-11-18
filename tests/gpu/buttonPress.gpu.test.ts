import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { centreOf, mouse } from './realMouse';

/** Obsidian's fill of every `<button>` (app.css), which Atlas' own rules must outrank, and its mono colour. */
const OBSIDIAN = `
  body { --mono-rgb-100: 0, 0, 0; --interactive-normal: rgb(240, 240, 240); }
  button:not(.clickable-icon) { background-color: var(--interactive-normal); }
`;

/** Atlas' buttons of several kinds: the shared Button, a toolbar's (whose rules set `background` with `!important`), a bare one in an Atlas panel, a link, a swatch and a menu trigger. */
const BUTTONS = `
  <div class="atlas-vtt-plugin">
    <button id="plain" class="btn btn--outline">Plain</button>
    <div class="atlas-vtt-toolbar"><div class="atlas-tool-button"><span><button id="tool" class="btn btn--toolbar btn--icon">T</button></span></div></div>
    <div class="atlas-panel"><button id="bare">Bare</button></div>
    <button id="link" class="btn btn--link">Link</button>
    <button id="swatch" class="atlas-command-palette-swatch">S</button>
    <button id="disabled" class="btn btn--outline" disabled>Off</button>
    <button id="trigger" class="btn btn--ghost" aria-haspopup="menu" aria-expanded="true">Menu</button>
    <button id="disclosure" class="btn btn--ghost" aria-expanded="true">Fold</button>
  </div>
`;

function tinted(id: string): boolean {
  const button = document.getElementById(id);
  if (!button) throw new Error(`no button ${id}`);
  return getComputedStyle(button).backgroundImage.includes('gradient');
}

async function whilePressed(id: string): Promise<boolean> {
  const button = document.getElementById(id);
  if (!button) throw new Error(`no button ${id}`);
  const { x, y } = centreOf(button);
  await mouse.hover(x, y);
  await mouse.down(x, y);
  const pressed = tinted(id);
  await mouse.up(x, y);
  return pressed;
}

describe('the press of an Atlas button', () => {
  const styles = [OBSIDIAN, css].map((text) => {
    const style = document.createElement('style');
    style.textContent = text;
    return style;
  });
  const host = document.createElement('div');

  beforeEach(async () => {
    await page.viewport(800, 400);
    document.head.append(...styles);
    host.innerHTML = BUTTONS;
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    styles.forEach((style) => style.remove());
  });

  it.each(['plain', 'tool', 'bare'])('tints %s from press to release', async (id) => {
    expect(tinted(id)).toBe(false);
    expect(await whilePressed(id)).toBe(true);
    expect(tinted(id)).toBe(false);
  });

  it.each(['link', 'swatch', 'disabled'])('leaves %s untinted', async (id) => {
    expect(await whilePressed(id)).toBe(false);
  });

  it('keeps a trigger tinted while its menu is open, and a disclosure untinted', () => {
    expect(tinted('trigger')).toBe(true);
    expect(tinted('disclosure')).toBe(false);
  });
});
