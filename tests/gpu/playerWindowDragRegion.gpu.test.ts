import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import css from '../../src/app/services/player-window.scss?inline';

/** Obsidian's own rule (app.css): whatever follows its app container in the body takes no drag. */
const OBSIDIAN_RULE = 'body.is-frameless > .app-container ~ * { -webkit-app-region: no-drag; }';

const regionOf = (element: Element): string => getComputedStyle(element).getPropertyValue('-webkit-app-region');

/**
 * The player window moves by dragging it anywhere, in a frameless window through its drag regions.
 * Chromium takes a region from a box whatever its opacity or pointer-events, and a later no-drag
 * box subtracts from what came before. So a sheet over the whole window must claim no region.
 */
describe('the player window\'s drag regions', () => {
  const obsidian = document.createElement('style');
  obsidian.textContent = OBSIDIAN_RULE;
  const plugin = document.createElement('style');
  plugin.textContent = css;
  const appContainer = document.createElement('div');
  appContainer.className = 'app-container';
  const curtain = document.createElement('div');
  curtain.className = 'atlas-player-curtain';

  beforeEach(() => {
    document.head.append(obsidian, plugin);
    document.body.classList.add('is-frameless', 'atlas-player-window');
    document.body.append(appContainer, curtain);
  });

  afterEach(() => {
    appContainer.remove();
    curtain.remove();
    obsidian.remove();
    plugin.remove();
    document.body.classList.remove('is-frameless', 'atlas-player-window', 'atlas-player-window--curtain');
  });

  it('leaves the window draggable under the curtain, lifted or down', () => {
    expect(regionOf(document.body)).toBe('drag');
    expect(regionOf(curtain)).toBe('none');
    document.body.classList.add('atlas-player-window--curtain');
    expect(regionOf(curtain)).toBe('none');
  });

  it('keeps what players press out of the drag region', () => {
    const rolls = appContainer.appendChild(document.createElement('div'));
    rolls.className = 'atlas-dice-rolls';
    expect(regionOf(rolls)).toBe('no-drag');
  });
});
