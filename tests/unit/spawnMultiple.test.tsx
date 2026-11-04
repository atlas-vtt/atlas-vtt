// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { AssetCard } from '../../src/app/packages/components/asset-manager/components/AssetCard';
import type { AssetCardHandlers } from '../../src/app/packages/components/asset-manager/hooks/useAssetCardHandlers';
import type { TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import { useSpawnCountTyping } from '../../src/app/packages/components/asset-manager/hooks/useSpawnCountTyping';
import { MAX_SPAWN_COUNT, typeSpawnCountDigit } from '../../src/app/packages/components/asset-manager/utils/spawnCount';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { beginHistoryTransaction, endHistoryTransaction, getHistoryStore } from '../../src/app/stores/history';
import { copyDragSelection } from '../../src/app/pixi/token-renderer/dragCopy';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const goblin: TokenAsset = { id: 'goblin', name: 'Goblin', type: 'tokens', imageUrl: 'app://goblin.png', imagePath: 'tokens/goblin.png', modifiedAt: 0 };

describe('typing a spawn count', () => {
  it('builds multi-digit counts from quick keystrokes on the same card', () => {
    const one = typeSpawnCountDigit(null, 'goblin', '1', 0)!;
    const twelve = typeSpawnCountDigit(one, 'goblin', '2', 500)!;
    expect([one.count, twelve.count]).toEqual([1, 12]);
    expect(typeSpawnCountDigit(twelve, 'goblin', '4', 3000)!.count).toBe(4);
    expect(typeSpawnCountDigit(twelve, 'wolf', '4', 600)!.count).toBe(4);
    expect(typeSpawnCountDigit(twelve, 'goblin', '5', 900)!.count).toBe(5);
    expect(typeSpawnCountDigit(null, 'goblin', '0', 0)).toBeNull();
    expect(MAX_SPAWN_COUNT).toBe(99);
  });

  it('sets the count of the hovered token card and leaves inputs and shortcuts alone', () => {
    vi.useFakeTimers();
    const setCount = vi.fn();
    function Grid(): React.JSX.Element {
      const [container, setContainer] = useState<HTMLDivElement | null>(null);
      useSpawnCountTyping(container, setCount);
      return (
        <div ref={setContainer}>
          <div className="atlas-asset-card" data-type="tokens" data-asset-id="goblin"><span id="goblin">Goblin</span></div>
          <div className="atlas-asset-card" data-type="maps" data-asset-id="cave"><span id="cave">Cave</span></div>
          <input id="search" />
        </div>
      );
    }
    render(<Grid />);

    fireEvent.keyDown(document, { key: '3' });
    expect(setCount).not.toHaveBeenCalled();

    fireEvent.pointerOver(document.getElementById('goblin')!);
    fireEvent.keyDown(document, { key: '1' });
    fireEvent.keyDown(document, { key: '0' });
    expect(setCount.mock.calls).toEqual([['goblin', 1], ['goblin', 10]]);

    fireEvent.keyDown(document, { key: '4', metaKey: true });
    fireEvent.keyDown(document.getElementById('search')!, { key: '4' });
    fireEvent.pointerOver(document.getElementById('cave')!);
    fireEvent.keyDown(document, { key: '4' });
    expect(setCount).toHaveBeenCalledTimes(2);
  });

  it('steps the card counter to absolute counts', () => {
    const onSpawnCountChange = vi.fn();
    const handlers: AssetCardHandlers = {
      onSelect: vi.fn(), onContextMenu: vi.fn(), onOpen: vi.fn(), onDragStart: vi.fn(), onDragEnd: vi.fn(),
      onSpawnCountChange, onOpenStatblock: vi.fn(),
    };
    render(<TooltipProvider><AssetCard asset={goblin} isSelected={false} isDragging={false} spawnCount={3} {...handlers} /></TooltipProvider>);
    fireEvent.click(screen.getByText('+'));
    fireEvent.click(screen.getByText('−'));
    expect(onSpawnCountChange.mock.calls).toEqual([['goblin', 4], ['goblin', 2]]);
    fireEvent.click(screen.getByText('Go'));
    expect(handlers.onOpen).toHaveBeenCalledWith(goblin, 3);
  });
});

describe('spawning and dragging out copies', () => {
  function createStore() {
    const { app } = createInMemoryApp();
    return createViewAtlasStore(app, `spawn-multiple-${Math.random()}`);
  }

  it('adds a batch of tokens as one undo step with running instance numbers', () => {
    const store = createStore();
    const steps = getHistoryStore(store)!.getState().pastStates.length;
    const ids = store.getState().addTokens([1, 2, 3].map((n) => ({ x: n * 50, y: 0, imagePath: 'tokens/goblin.png' })));
    expect(ids).toHaveLength(3);
    expect(ids.map((id) => store.getState().objects.tokens[id]!.instanceNumber)).toEqual([1, 2, 3]);
    expect(getHistoryStore(store)!.getState().pastStates.length).toBe(steps + 1);
  });

  it('Alt-drag leaves the originals in place and drags selected copies, all in one undo step', () => {
    const store = createStore();
    const [a, b] = store.getState().addTokens([
      { x: 25, y: 25, imagePath: 'tokens/goblin.png' },
      { x: 75, y: 25, imagePath: 'tokens/goblin.png' },
    ]);
    const history = getHistoryStore(store)!.getState();
    const steps = history.pastStates.length;
    const start = { [a!]: { x: 25, y: 25 }, [b!]: { x: 75, y: 25 } };

    beginHistoryTransaction(store);
    const copies = copyDragSelection(store, [a!, b!, 'drawing_1'], start)!;
    store.getState().setTokenPositions(copies.ids.map((id) => ({ id, x: copies.initialPositions[id]!.x + 100, y: 25 })));
    endHistoryTransaction(store);

    const tokens = store.getState().objects.tokens;
    expect(copies.ids.map((id) => [tokens[id]!.x, tokens[id]!.instanceNumber])).toEqual([[125, 3], [175, 4]]);
    expect([tokens[a!]!.x, tokens[b!]!.x]).toEqual([25, 75]);
    expect(store.getState().selectedIds).toEqual(copies.ids);
    expect(getHistoryStore(store)!.getState().pastStates.length).toBe(steps + 1);
  });

  it('Alt-drag copies selected drawings too and keeps the moving group selected', () => {
    const store = createStore();
    const [token] = store.getState().addTokens([{ x: 25, y: 25, imagePath: 'tokens/goblin.png' }]);
    const drawing = store.getState().addDrawing({ type: 'line', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }], color: '#fff', width: 2, opacity: 1 });
    store.getState().setSelection([token!, drawing]);

    const copies = copyDragSelection(store, [token!, drawing], { [token!]: { x: 25, y: 25 } })!;

    const drawings = Object.keys(store.getState().objects.drawings);
    expect(drawings).toHaveLength(2);
    expect(store.getState().selectedIds).toEqual([...copies.ids, drawing]);
  });
});
