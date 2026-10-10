import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getHistoryStore } from '../../src/app/stores/history';
import { renderToolbar, setUpToolbarTestDom } from './toolbarEditorHarness';

setUpToolbarTestDom();

describe('the TV viewport menu', () => {
  it('offers Remove viewport only while there is a frame, and removing it is one undo step', async () => {
    const harness = renderToolbar({ stored: { shown: ['viewport'] } });
    const openMenu = (): void => { fireEvent.click(screen.getByRole('button', { name: 'TV Viewport Options' })); };

    openMenu();
    expect(screen.queryByRole('button', { name: 'Remove viewport' })).toBeNull();
    openMenu();

    harness.store.getState().addViewport({ x: 0, y: 0, width: 400, height: 200, locked: true, active: true });
    harness.store.getState().addViewport({ x: 50, y: 50, width: 400, height: 200, locked: true, active: false });
    const history = getHistoryStore(harness.store)!.getState();
    const before = history.pastStates.length;

    openMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove viewport' }));

    expect(harness.store.getState().objects.viewports).toEqual({});
    expect(getHistoryStore(harness.store)!.getState().pastStates.length).toBe(before + 1);
    getHistoryStore(harness.store)!.getState().undo();
    await waitFor(() => expect(Object.keys(harness.store.getState().objects.viewports)).toHaveLength(2));
  });
  it('picks the screen shape with one tap and marks the shape the saved resolution has', async () => {
    const harness = renderToolbar({ stored: { shown: ['viewport'] } });
    fireEvent.click(screen.getByRole('button', { name: 'TV Viewport Options' }));

    // The default 3840 x 2160 is a 16:9 screen.
    await screen.findByRole('radio', { name: '16:9' });
    expect(screen.getByRole('radio', { name: '16:9' }).getAttribute('aria-checked')).toBe('true');

    fireEvent.click(screen.getByRole('radio', { name: '21:9' }));

    const { resolutionWidth, resolutionHeight } = harness.settings.getTVCalibration();
    expect(resolutionWidth / resolutionHeight).toBeCloseTo(21 / 9, 1);
    await waitFor(() => expect(screen.getByRole('radio', { name: '21:9' }).getAttribute('aria-checked')).toBe('true'));
  });
  it('sizes a square as one inch (2.54 cm) by default, and can show it in centimetres', async () => {
    const harness = renderToolbar({ stored: { shown: ['viewport'] } });
    expect(harness.settings.getTVCalibration()).toMatchObject({ targetSquareCm: 2.54, squareUnit: 'in' });

    fireEvent.click(screen.getByRole('button', { name: 'TV Viewport Options' }));
    expect((await screen.findByRole('radio', { name: 'Inches' })).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Centimetres' }));

    // Only the unit shown changes: the square stays 2.54 cm.
    expect(harness.settings.getTVCalibration()).toMatchObject({ targetSquareCm: 2.54, squareUnit: 'cm' });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Centimetres' }).getAttribute('aria-checked')).toBe('true'));
  });
});
