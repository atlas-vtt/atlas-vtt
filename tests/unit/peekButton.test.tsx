// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { PeekButton } from '../../src/app/packages/components/toolbar/PeekButton';
import { LIGHTING_PEEK_EVENT } from '../../src/app/lighting/lightingPeek';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { EventEmitter } from '../../src/app/utils/typedEmitter';
import { createInMemoryApp } from '../mocks/inMemoryVault';

beforeEach(() => {
  // jsdom has no pointer capture; a browser keeps the release on the button with it.
  Element.prototype.setPointerCapture = (): void => undefined;
});
afterEach(cleanup);

function mount(): { store: ReturnType<typeof createViewAtlasStore>; peeks: boolean[]; unmount: () => void } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `peek-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const bus = new EventEmitter();
  const peeks: boolean[] = [];
  bus.on(LIGHTING_PEEK_EVENT, (held: boolean) => peeks.push(held));
  const ui = { app, view: { serviceManager: { getEventBus: () => bus } }, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
  const { unmount } = render(
    <AtlasUIContext.Provider value={ui}>
      <ViewStoreProvider store={store}><PeekButton /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  return { store, peeks, unmount };
}

const button = (): HTMLElement => screen.getByRole('button', { name: 'Hold to see what the players see' });
// jsdom has no PointerEvent: a mouse event of the pointer's type carries the button as one does.
const press = (): boolean => fireEvent(button(), new MouseEvent('pointerdown', { bubbles: true, button: 0 }));

it('peeks while it is held and ends the peek when the finger lifts', () => {
  const { peeks } = mount();
  press();
  expect(peeks).toEqual([true]);
  expect(button().getAttribute('aria-pressed')).toBe('true');
  fireEvent.pointerUp(button(), { pointerId: 1 });
  expect(peeks).toEqual([true, false]);
  expect(button().getAttribute('aria-pressed')).toBe('false');
});

it('ends the peek when the system takes the press away, once', () => {
  const { peeks } = mount();
  press();
  fireEvent.pointerCancel(button(), { pointerId: 1 });
  fireEvent.lostPointerCapture(button(), { pointerId: 1 });
  expect(peeks).toEqual([true, false]);
});

it('ends the peek when it goes while held, and takes no press in the session view', () => {
  const { store, peeks, unmount } = mount();
  act(() => { store.getState().setGMView(false); });
  press();
  expect(peeks).toEqual([]);
  act(() => { store.getState().setGMView(true); });
  press();
  unmount();
  expect(peeks).toEqual([true, false]);
});
