// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OPEN_SHAPE_CONTROL, OpenShape, isOpenShapeControl, openShapeOf } from '../../src/app/pixi/utils/openShape';
import { PlacementHand } from '../../src/app/pixi/tokenPlacement/placementHand';
import type { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';
import { OpenShapeStrip } from '../../src/app/react/components/OpenShapeStrip';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const pointer = vi.hoisted(() => ({ coarse: false }));
vi.mock('../../src/app/platform/useCoarsePointer', () => ({ useCoarsePointer: () => pointer.coarse }));

afterEach(() => {
  cleanup();
  pointer.coarse = false;
});

function renderStrip(): { store: ViewAtlasStore; shape: OpenShape; hand: PlacementHand } {
  const store = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `open-shape-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const hand = new PlacementHand();
  const ui = { app: {}, view: null, pixiApp: null, renderer: { placementHand: hand } as unknown as PixiRendererOrchestrator } as AtlasUIContextValue;
  render(<AtlasUIContext.Provider value={ui}><ViewStoreProvider store={store}><OpenShapeStrip /></ViewStoreProvider></AtlasUIContext.Provider>);
  return { store, shape: openShapeOf(store), hand };
}

const button = (name: string): HTMLElement => screen.getByRole('button', { name });

it('gives a finger Done and Undo point while a shape waits for its next point, and does what its tool says they do', async () => {
  pointer.coarse = true;
  const { shape } = renderStrip();
  expect(screen.queryByRole('toolbar')).toBeNull();
  const calls: string[] = [];
  const tool = {};
  const controls = { finish: () => calls.push('finish'), back: () => calls.push('back') };
  act(() => shape.show(tool, controls, { canFinish: true, canGoBack: false }));
  expect(screen.getByRole('toolbar', { name: 'Shape under way' })).toBeTruthy();
  // The first point stays: there is none to take back, and the button keeps its place.
  expect((button('Undo point') as HTMLButtonElement).disabled).toBe(true);
  act(() => shape.show(tool, controls, { canFinish: true, canGoBack: true }));
  fireEvent.click(button('Undo point'));
  fireEvent.click(button('Done'));
  expect(calls).toEqual(['back', 'finish']);
  act(() => shape.end(tool));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Done' })).toBeNull());
});

it('is not there for a mouse, whose keyboard has Enter and Backspace', () => {
  const { shape } = renderStrip();
  act(() => shape.show({}, { finish: () => undefined, back: () => undefined }, { canFinish: true, canGoBack: true }));
  expect(screen.queryByRole('toolbar')).toBeNull();
});

it('makes way for the strip of tokens in hand', async () => {
  pointer.coarse = true;
  const { shape, hand } = renderStrip();
  act(() => shape.show({}, { finish: () => undefined, back: () => undefined }, { canFinish: true, canGoBack: true }));
  expect(screen.queryByRole('toolbar')).not.toBeNull();
  act(() => hand.set(2));
  await waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
});

it('marks its buttons as the shape\'s own: a press on them is no press beside the map', () => {
  pointer.coarse = true;
  const { shape } = renderStrip();
  act(() => shape.show({}, { finish: () => undefined, back: () => undefined }, { canFinish: true, canGoBack: true }));
  expect(screen.getByRole('toolbar').hasAttribute(OPEN_SHAPE_CONTROL)).toBe(true);
  expect(isOpenShapeControl(button('Done'))).toBe(true);
  expect(isOpenShapeControl(document.body)).toBe(false);
  expect(isOpenShapeControl(null)).toBe(false);
});

it('keeps one shape per view: a tool that ends tells nothing of another tool\'s shape, and listeners hear only changes', () => {
  const shape = new OpenShape();
  let heard = 0;
  const stop = shape.subscribe(() => { heard++; });
  const draw = {};
  const walls = {};
  const controls = { finish: () => undefined, back: () => undefined };
  shape.show(draw, controls, { canFinish: true, canGoBack: false });
  shape.show(draw, controls, { canFinish: true, canGoBack: false });
  expect(heard).toBe(1);
  shape.end(walls);
  expect(shape.state).toEqual({ canFinish: true, canGoBack: false });
  shape.end(draw);
  expect(shape.state).toBeNull();
  expect(heard).toBe(2);
  stop();
  shape.show(walls, controls, { canFinish: false, canGoBack: true });
  expect(heard).toBe(2);
  expect(openShapeOf(draw)).toBe(openShapeOf(draw));
  expect(openShapeOf(draw)).not.toBe(openShapeOf(walls));
});
