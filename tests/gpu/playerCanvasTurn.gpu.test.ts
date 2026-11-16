import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import playerCss from '../../src/app/services/player-window.scss?inline';
import widgetCss from '../../src/app/react/components/widget-bar.scss?inline';
import { applyTableTvLook, PLAYER_OVERLAYS_CLASS } from '../../src/app/services/playerWindowTurn';
import { DEFAULT_TABLE_TV_SETTINGS, type TvRotation } from '../../src/app/services/tableTvSettings';

describe('the player canvas on a turned table TV', () => {
  const style = document.createElement('style');
  style.textContent = playerCss;
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

    const sideways = rotation === 90 || rotation === 270;
    // The frames are rendered for this box (`windowScreen` reads it): the window's sides swap a quarter turn
    expect([canvas.clientWidth, canvas.clientHeight]).toEqual(sideways ? [600, 1200] : [1200, 600]);
    const shown = canvas.getBoundingClientRect();
    expect([shown.left, shown.top, shown.width, shown.height].map(Math.round)).toEqual([0, 0, 1200, 600]);
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
  async function widgetBar(rotation: TvRotation): Promise<DOMRect> {
    document.head.append(style);
    await page.viewport(1200, 600);
    document.body.className = 'atlas-player-window atlas-player-window--live';
    const overlays = document.body.appendChild(document.createElement('div'));
    overlays.className = PLAYER_OVERLAYS_CLASS;
    applyTableTvLook(document.body, overlays, {
      prefs: DEFAULT_TABLE_TV_SETTINGS, trueScale: false, cellMm: 25.4, setup: null, rotation,
      devicePixelRatio: 1, screenKey: '1200x600',
    });
    const widgets = overlays.appendChild(document.createElement('div'));
    widgets.id = 'atlas-player-widgets';
    const bar = widgets.appendChild(document.createElement('div'));
    bar.className = 'atlas-widget-bar';
    const card = bar.appendChild(document.createElement('div'));
    card.style.cssText = 'width: 200px; height: 50px';
    return bar.getBoundingClientRect();
  }

  it('stand top right', async () => {
    const shown = await widgetBar(0);
    expect([shown.right, shown.top].map(Math.round)).toEqual([1192, 8]);
  });

  it('stand top right as the players see the turned TV', async () => {
    // Turned half round, the players' top right is the window's bottom left
    const turned = await widgetBar(180);
    expect([turned.left, turned.bottom, turned.width, turned.height].map(Math.round)).toEqual([8, 592, 200, 50]);
    document.body.replaceChildren();
    // Sideways (90° clockwise), the players' top runs along the window's right edge and their right is the window's bottom
    const sideways = await widgetBar(90);
    expect([sideways.right, sideways.bottom, sideways.width, sideways.height].map(Math.round)).toEqual([1192, 592, 50, 200]);
  });
});
