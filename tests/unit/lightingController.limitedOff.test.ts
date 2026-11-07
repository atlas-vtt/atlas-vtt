// @vitest-environment jsdom
// The harness first: it mocks what the controller imports.
import { contextMenuOpened, setup } from './lightingControllerHarness';
import { describe, expect, it } from 'vitest';
import { LIMITED_WALLS } from '../../src/app/featureFlags';

describe('limited walls switched off', () => {
  it('is how the release is built', () => {
    expect(LIMITED_WALLS).toBe(false);
  });

  it('offers no Limited switch in the wall menu, for a plain wall or for one whose file says it is limited', () => {
    const { store, contextMenu } = setup();
    store.getState().setActiveTool('wall');
    store.getState().addWall({ type: 'solid', p1: { x: 100, y: 100 }, p2: { x: 300, y: 100 } });
    store.getState().addWall({ type: 'solid', p1: { x: 100, y: 500 }, p2: { x: 300, y: 500 }, limited: true });
    for (const y of [100, 500]) {
      contextMenuOpened.mockClear();
      contextMenu(200, y, 10, 10);
      const labels = (contextMenuOpened.mock.calls[0]![0] as { label: string }[]).map((entry) => entry.label);
      expect(labels).toContain('Blocks');
      expect(labels.some((label) => label.startsWith('Limited'))).toBe(false);
    }
  });
});
