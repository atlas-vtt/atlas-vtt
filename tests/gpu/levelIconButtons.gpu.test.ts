import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';

/** What Obsidian gives every `<button>` (app.css): padding of its own, inside the button's box. */
const OBSIDIAN_BUTTONS = 'button { box-sizing: border-box; padding: 4px 12px; } body { --input-height: 30px; }';

const ICON = '<svg viewBox="0 0 24 24"><rect width="24" height="24" /></svg>';

/** A row of the Scene levels page and a floor of the Universal VTT floors dialog, with their icon buttons. */
const ROWS = `
  <div class="atlas-vtt-plugin">
    <div class="atlas-scene-level">
      <input class="atlas-scene-level__name" />
      <div class="atlas-scene-level__actions">
        <button class="atlas-scene-level__button">${ICON}</button>
        <button class="atlas-scene-level__button atlas-scene-level__button--destructive">${ICON}</button>
      </div>
    </div>
    <ul class="atlas-uvtt-floors__list">
      <li class="atlas-uvtt-floors__floor">
        <div class="atlas-uvtt-floors__names"><input class="atlas-uvtt-floors__input" /></div>
        <button class="atlas-uvtt-floors__move">${ICON}</button>
      </li>
    </ul>
  </div>
`;

describe('the icon buttons of the Scene levels page and the floors dialog', () => {
  const styles = [OBSIDIAN_BUTTONS, css].map((text) => {
    const style = document.createElement('style');
    style.textContent = text;
    return style;
  });
  const host = document.createElement('div');
  host.style.width = '600px';

  beforeEach(async () => {
    await page.viewport(800, 400);
    document.head.append(...styles);
    host.innerHTML = ROWS;
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    for (const style of styles) style.remove();
  });

  it.each(['.atlas-scene-level__button', '.atlas-uvtt-floors__move'])('show %s\'s icon whole, as tall as the row\'s field', (selector) => {
    const button = host.querySelector(selector)!;
    const icon = button.querySelector('svg')!.getBoundingClientRect();
    const field = button.closest('li, .atlas-scene-level')!.querySelector('input')!.getBoundingClientRect();

    expect(icon.width).toBe(16);
    expect(icon.height).toBe(16);
    expect(button.getBoundingClientRect().height).toBe(field.height);
    expect(button.getBoundingClientRect().width).toBe(field.height);
  });
});
