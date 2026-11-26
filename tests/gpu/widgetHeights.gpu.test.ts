import '../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import css from '../../styles/main.scss?inline';
import { PlayerWidgetBar } from '../../src/app/services/PlayerWidgetBar';
import type { SettingsService } from '../../src/app/services/SettingsService';
import type { AnyWidget } from '../../src/app/types/widgetTypes';

const THEME = `
  body { margin: 0; font: 13px/1.5 sans-serif; --background-primary: #1e1e1e; --background-modifier-border: #363636; --text-normal: #dadada;
    --text-muted: #b3b3b3; --interactive-accent: #7f6df2; --mono-100: #fff; --font-ui-small: 13px; --font-ui-smaller: 12px; }
`;

const base = { icon: 'skull', visible: true, visibleToPlayers: true } as const;
const WIDGETS: readonly AnyWidget[] = [
  { ...base, id: 'fear', type: 'counter', label: 'Fear', value: 4, order: 0 },
  { ...base, id: 'torch', type: 'timer', label: 'Torch', value: 1800, duration: 1800, direction: 'down', order: 1 },
  { ...base, id: 'doom', type: 'clock', label: 'Doom', value: 3, segments: 8, order: 2 },
  { ...base, id: 'count', type: 'clock', label: 'A clock that counts', value: 2, segments: 6, showCount: true, order: 3 },
];

const settings = { getLocalPlayerViewSettings: () => ({ showWidgets: true }), initiativeLayout: () => ({ fromTurn: true, dock: 'right', edges: ['right'], facesPlayers: false }), onChange: () => () => undefined } as unknown as SettingsService;

/** The cards of the players' widget bar, one of every kind. */
function cards(touch: boolean): HTMLElement[] {
  document.body.innerHTML = '';
  // A touch screen's buttons are larger: the row must not follow them
  document.body.style.setProperty('--atlas-button-height-m', touch ? '44px' : '32px');
  const layer = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
  Object.assign(layer.style, { position: 'relative', width: '1200px', height: '700px', transform: 'translate(0, 0)' });
  const bar = new PlayerWidgetBar(settings);
  bar.mount(layer);
  bar.present(createStore(() => ({ widgetSettings: { widgets: Object.fromEntries(WIDGETS.map((widget) => [widget.id, widget])), globalVisible: true, position: 'top', scale: 1 }, widgetValues: {} })) as never);
  return [...layer.querySelectorAll<HTMLElement>('.atlas-widget')];
}

describe('the widget cards', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  beforeEach(() => document.head.append(style));
  afterEach(() => style.remove());

  for (const touch of [false, true]) {
    it(`are all as tall, a counter, a timer and a clock alike${touch ? ', where buttons are a finger\'s size' : ''}`, async () => {
      const shown = cards(touch);
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(shown).toHaveLength(WIDGETS.length);
      const heights = shown.map((card) => Math.round(card.getBoundingClientRect().height * 10) / 10);
      expect(new Set(heights).size, JSON.stringify(heights)).toBe(1);
    });
  }
});
