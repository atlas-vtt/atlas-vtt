import '../setup/obsidianDom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import css from '../../styles/main.scss?inline';

const style = document.createElement('style');
style.textContent = `body { --divider-color: #363636; } ${css}`;
let root: HTMLElement;

beforeEach(() => {
  document.head.append(style);
  root = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
});

afterEach(() => {
  root.remove();
  style.remove();
});

it('draws no line under the command palette\'s tab bar or under the header of any of its pages', () => {
  const list = root.createDiv({ cls: 'atlas-command-palette-container' });
  const tabs = list.createDiv({ cls: 'atlas-command-palette-tabs' });
  // Every page the palette expands into shares one header; the snapshots' page once had a rule of its own for it.
  const headers = ['', 'atlas-command-palette-container--scene-snapshots'].map((page) =>
    root.createDiv({ cls: `atlas-command-palette-container atlas-command-palette-container--expanded ${page}` }).createDiv({ cls: 'atlas-command-palette-panel-header' }));
  for (const part of [tabs, ...headers]) {
    const drawn = getComputedStyle(part);
    expect(drawn.borderBottomWidth).toBe('0px');
    expect(drawn.boxShadow).toBe('none');
  }
});
