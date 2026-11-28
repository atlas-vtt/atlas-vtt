// @vitest-environment jsdom
import React, { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PickerField } from '../../src/app/packages/components/asset-manager/components/PickerField';

/*
 * The field closes its list a moment after it loses focus, so a press on a row still lands. A dialog that goes within
 * that moment takes the field with it: the timer must go too, or it sets state on a field that is gone.
 */

function field(setListOpen: (open: boolean) => void): React.JSX.Element {
  return (
    <PickerField
      label="Folder"
      placeholder="Search"
      fieldRef={createRef<HTMLInputElement>()}
      text=""
      onText={() => undefined}
      listOpen
      setListOpen={setListOpen}
      choices={['Beasts', 'Undead']}
      chosen="Beasts"
      choose={() => undefined}
      onConfirm={() => undefined}
      keyOf={(choice) => choice}
      renderOption={(choice, { selected, ...row }) => <div {...row} data-selected={selected}>{choice}</div>}
    />
  );
}

describe('a picker field that loses focus', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('closes its list a moment later', () => {
    const setListOpen = vi.fn();
    render(field(setListOpen));
    setListOpen.mockClear();
    fireEvent.blur(screen.getByRole('combobox'));
    expect(setListOpen).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(setListOpen).toHaveBeenCalledWith(false);
  });

  it('leaves no timer behind when it goes before that moment', () => {
    const setListOpen = vi.fn();
    const { unmount } = render(field(setListOpen));
    setListOpen.mockClear();
    const timers = vi.getTimerCount();
    fireEvent.blur(screen.getByRole('combobox'));
    expect(vi.getTimerCount()).toBe(timers + 1);
    unmount();
    expect(vi.getTimerCount()).toBeLessThanOrEqual(timers);
    vi.advanceTimersByTime(1_000);
    expect(setListOpen).not.toHaveBeenCalled();
  });

  it('keeps one timer when it loses focus twice', () => {
    render(field(vi.fn()));
    const input = screen.getByRole('combobox');
    const timers = vi.getTimerCount();
    fireEvent.blur(input);
    fireEvent.blur(input);
    expect(vi.getTimerCount()).toBe(timers + 1);
  });
});
