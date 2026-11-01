// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { roomForRow } from '../../src/app/react/components/useWidgetStack';

/** A top bar 1000 px wide with scene tabs, whose slot below them is `below` px wide. */
function topBar(below: number): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'atlas-top-bar-row';
  bar.style.columnGap = '8px';
  bar.innerHTML = '<div class="atlas-top-bar-start"><div class="atlas-scene-tab-bar"></div><div class="atlas-top-bar-start__below"></div></div>';
  Object.defineProperty(bar, 'clientWidth', { value: 1000 });
  Object.defineProperty(bar.querySelector('.atlas-top-bar-start__below'), 'offsetWidth', { value: below });
  document.body.append(bar);
  return bar;
}

describe('the room a row of widgets has', () => {
  it('leaves the scene tabs what they keep', () => {
    expect(roomForRow(topBar(0))).toBe(1000 - 240 - 8);
  });

  it('leaves more where the player window bar below the tabs is wider', () => {
    expect(roomForRow(topBar(250))).toBe(1000 - 250 - 8);
  });
});
