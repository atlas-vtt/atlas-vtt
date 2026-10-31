import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import playerCss from '../../src/app/services/player-window.scss?inline';
import transitionCss from '../../src/app/pixi/scene-transition.scss?inline';
import widgetCss from '../../src/app/react/components/widget-bar.scss?inline';
import { applyTableTvLook, PLAYER_OVERLAYS_CLASS } from '../../src/app/services/playerWindowTurn';
import { DEFAULT_TABLE_TV_SETTINGS, type PlayerWidgetPosition, type TvRotation } from '../../src/app/services/tableTvSettings';

describe('the player canvas on a turned table TV', () => {
  const style = document.createElement('style');
  // The snapshot's own rules come first, as the plugin's stylesheet has them
  style.textContent = transitionCss + playerCss;
  afterEach(() => {
    document.body.replaceChildren();
    document.body.className = '';
    document.body.removeAttribute('data-tv-rotation');
    document.body.style.removeProperty('--atlas-tv-rotation');
    style.remove();
  });

  it.each([0, 90, 180, 270])('turned by %i°, has the window as the players see it for its box and covers the window', async (rotation) => {
    document.head.append(style);
    await page.viewport(1200, 600);
    // As PlayerWindowService marks the popout's body
    document.body.className = 'atlas-player-window atlas-player-window--live';
    document.body.dataset.tvRotation = String(rotation);
    document.body.style.setProperty('--atlas-tv-rotation', `${rotation}deg`);
    const canvas = document.body.appendChild(document.createElement('canvas'));
    canvas.id = 'atlas-player-canvas';
    const snapshot = document.body.appendChild(document.createElement('canvas'));
    snapshot.className = 'atlas-scene-transition-snapshot';

    const sideways = rotation === 90 || rotation === 270;
    // The frames are rendered for this box (`windowScreen` reads it): the window's sides swap a quarter turn
    expect([canvas.clientWidth, canvas.clientHeight]).toEqual(sideways ? [600, 1200] : [1200, 600]);
    for (const element of [canvas, snapshot]) {
      const shown = element.getBoundingClientRect();
      expect([shown.left, shown.top, shown.width, shown.height].map(Math.round)).toEqual([0, 0, 1200, 600]);
    }
  });
});

describe('the widgets on the player view', () => {
  const style = document.createElement('style');
  style.textContent = widgetCss + playerCss;
  afterEach(() => {
    document.body.replaceChildren();
    document.body.className = '';
    document.body.removeAttribute('data-tv-rotation');
    document.body.style.removeProperty('--atlas-tv-rotation');
    style.remove();
  });

  /** A 200 × 50 widget bar in the overlay layer as PlayerWindowService builds it. */
  async function widgetBar(rotation: TvRotation, position: PlayerWidgetPosition, scale = 1): Promise<DOMRect> {
    document.head.append(style);
    await page.viewport(1200, 600);
    document.body.className = 'atlas-player-window atlas-player-window--live';
    const overlays = document.body.appendChild(document.createElement('div'));
    overlays.className = PLAYER_OVERLAYS_CLASS;
    applyTableTvLook(document.body, overlays, { ...DEFAULT_TABLE_TV_SETTINGS, rotation, widgetPosition: position, widgetScale: scale });
    const widgets = overlays.appendChild(document.createElement('div'));
    widgets.id = 'atlas-player-widgets';
    const bar = widgets.appendChild(document.createElement('div'));
    bar.className = 'atlas-widget-bar';
    const card = bar.appendChild(document.createElement('div'));
    card.style.cssText = 'width: 200px; height: 50px';
    return bar.getBoundingClientRect();
  }

  it('stand top right, as before these settings, by default', async () => {
    const shown = await widgetBar(0, 'top-right');
    expect([shown.right, shown.top].map(Math.round)).toEqual([1192, 8]);
  });

  it('stand where set as the players see the turned TV, at the size set', async () => {
    // Turned half round, the players' bottom left is the window's top right
    const turned = await widgetBar(180, 'bottom-left', 2);
    expect([turned.right, turned.top, turned.width, turned.height].map(Math.round)).toEqual([1192, 8, 400, 100]);
    document.body.replaceChildren();
    // Sideways, the players' top runs along the window's right edge
    const centred = await widgetBar(90, 'top', 2);
    expect([centred.right, centred.top + centred.height / 2, centred.width, centred.height].map(Math.round)).toEqual([1192, 300, 100, 400]);
  });
});
