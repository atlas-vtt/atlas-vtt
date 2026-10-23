// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { sceneTabDropTarget } from '../../src/app/react/components/scene-tabs/sceneTabDropTarget';

afterEach(() => document.body.replaceChildren());

function stripFixture(scrollLeft = 0, width = 500): HTMLElement {
  const strip = document.createElement('div');
  document.body.append(strip);
  strip.scrollLeft = scrollLeft;
  strip.getBoundingClientRect = () => new DOMRect(100, 50, width, 28);
  let left = 100 - scrollLeft;
  for (const [id, size] of [['a', 80], ['b', 120], ['c', 110], ['d', 90]] as const) {
    const tab = document.createElement('div');
    tab.dataset.sceneTabId = id;
    const x = left;
    tab.getBoundingClientRect = () => new DOMRect(x, 50, size, 28);
    strip.append(tab);
    left += size + 4;
  }
  return strip;
}

describe('scene tab insertion geometry', () => {
  it('places before, between and after variable-width tabs, excluding the source', () => {
    const strip = stripFixture();
    expect(sceneTabDropTarget(strip, 'b', 120, 64)).toEqual({ beforeTabId: 'a', indicatorLeft: 0 });
    expect(sceneTabDropTarget(strip, 'b', 250, 64)).toEqual({ beforeTabId: 'c', indicatorLeft: 208 });
    expect(sceneTabDropTarget(strip, 'b', 400, 64)).toEqual({ beforeTabId: 'd', indicatorLeft: 322 });
    expect(sceneTabDropTarget(strip, 'b', 520, 64)).toEqual({ beforeTabId: null, indicatorLeft: 412 });
  });

  it('returns content coordinates after the strip scrolls', () => {
    const strip = stripFixture(110, 300);
    expect(sceneTabDropTarget(strip, 'b', 220, 64)).toEqual({ beforeTabId: 'c', indicatorLeft: 208 });
    expect(sceneTabDropTarget(strip, 'b', 390, 64)).toEqual({ beforeTabId: null, indicatorLeft: 412 });
  });

  it('rejects outside drops and missing source IDs', () => {
    const strip = stripFixture();
    for (const [x, y] of [[99, 64], [601, 64], [250, 49], [250, 79]]) {
      expect(sceneTabDropTarget(strip, 'b', x!, y!)).toBeNull();
    }
    expect(sceneTabDropTarget(strip, 'closed', 250, 64)).toBeNull();
  });
});
