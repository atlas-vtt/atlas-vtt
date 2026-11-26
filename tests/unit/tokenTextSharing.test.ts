// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Text } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { ResourceBarLabel } from '../../src/app/pixi/ResourceBarLabel';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.classList.remove('theme-dark', 'theme-light');
});

/** PIXI keeps one text texture per `styleKey` (string, style object, resolution) and shares it among texts. */
const keys = (label: ResourceBarLabel): string[] => label.children.filter((child): child is Text => child instanceof Text).map((text) => text.styleKey);

it('gives the same bar numbers of two tokens one text texture', () => {
  const a = new ResourceBarLabel();
  const b = new ResourceBarLabel();
  a.setValue({ current: 30, max: 30 });
  b.setValue({ current: 30, max: 30 });
  expect(keys(a)).toEqual(keys(b));
  b.setValue({ current: 12, max: 30 });
  expect(keys(b)[0]).not.toBe(keys(a)[0]);
});

it('gives the nameplates of two tokens of one name one text texture, in either theme', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
  } as never);
  vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({ width: 80, height: 20 } as never);
  document.body.classList.add('theme-light');
  const store = createStore(() => ({ tokenSettings: { showNameplates: true }, grid: { size: 70 } }));
  const renderers = [new TokenUIRenderer(store as never), new TokenUIRenderer(store as never)];
  const nameKey = (ui: TokenUIRenderer): string => (ui as unknown as { nameText: Text }).nameText.styleKey;
  try {
    renderers.forEach((ui, i) => {
      ui.resourceDefsProvider = () => [];
      ui.update({ id: `goblin-${i}`, kind: 'character', name: 'Goblin', showNameplate: true } as never, 70);
    });
    expect(nameKey(renderers[0]!)).toBe(nameKey(renderers[1]!));
    const light = nameKey(renderers[0]!);

    document.body.classList.replace('theme-light', 'theme-dark');
    await Promise.resolve();
    expect(nameKey(renderers[0]!)).toBe(nameKey(renderers[1]!));
    expect(nameKey(renderers[0]!)).not.toBe(light);
  } finally {
    for (const ui of renderers) ui.destroy();
  }
});
