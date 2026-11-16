// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Text } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.classList.remove('theme-dark', 'theme-light');
});

it("writes a nameplate in the theme's ink and follows a switch of theme", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
  } as any);
  vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({ width: 80, height: 20 } as any);
  document.body.classList.add('theme-light');
  const store = createStore(() => ({ tokenSettings: { showNameplates: true }, grid: { size: 70 } }));
  const ui = new TokenUIRenderer(store as any);
  ui.resourceDefsProvider = () => [];
  const fill = (): unknown => (ui as any).nameText.style.fill;
  try {
    ui.update({ id: 'hero', kind: 'character', name: 'Hero', showNameplate: true } as any, 70);
    expect(fill()).toBe(0x000000);

    document.body.classList.replace('theme-light', 'theme-dark');
    await Promise.resolve();
    expect(fill()).toBe(0xffffff);
  } finally { ui.destroy(); }
});
