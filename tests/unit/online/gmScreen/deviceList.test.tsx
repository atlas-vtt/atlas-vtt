// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GmScreenDeviceView } from '../../../../src/app/online/gmScreen/index.ts';
import { foldAfter, restingFold } from '../../../../src/app/online/gmScreen/ui/deviceFold.ts';
import { DeviceList } from '../../../../src/app/online/gmScreen/ui/DeviceList';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import { CONFIRM_MS, deviceState } from '../../../../src/app/online/gmScreen/ui/DeviceRow';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOW = 1_700_000_000_000;
const phone = (connected: boolean, lastSeen = NOW): GmScreenDeviceView => ({ id: 'phone', name: 'Mira’s phone', connected, lastSeen });
const tablet = (connected: boolean, lastSeen = NOW): GmScreenDeviceView => ({ id: 'tablet', name: 'Tablet', connected, lastSeen });

const toggle = (): HTMLButtonElement => screen.getByRole('button', { name: /Devices/ });

describe('the devices section that folds', () => {
  it('rests open while a device is connected and folded while all are away', () => {
    expect(restingFold([phone(true), tablet(false)]).open).toBe(true);
    expect(restingFold([phone(false), tablet(false)]).open).toBe(false);
    expect(restingFold([]).open).toBe(false);
  });

  it('opens for a device that arrives or connects again, and otherwise keeps what the GM chose', () => {
    const folded = restingFold([phone(false)]);
    expect(foldAfter(folded, [phone(false)])).toBe(folded);
    expect(foldAfter(folded, [phone(false), tablet(false)]).open).toBe(true);
    expect(foldAfter(folded, [phone(true)]).open).toBe(true);
    const closedByGm = { ...restingFold([phone(true)]), open: false };
    expect(foldAfter(closedByGm, [phone(false)]).open).toBe(false);
    expect(foldAfter(closedByGm, [phone(true), tablet(false)]).open).toBe(true);
  });

  it('counts its devices in its heading and folds them out of reach', () => {
    render(<DeviceList devices={[phone(true), tablet(false)]} remove={() => undefined} />);
    expect(toggle().textContent).toBe('Devices2');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    const fold = document.getElementById(toggle().getAttribute('aria-controls') ?? '')!;
    expect(fold.hasAttribute('inert')).toBe(false);
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(fold.hasAttribute('inert')).toBe(true);
    expect(fold.dataset.open).toBe('false');
  });

  it('says there is none yet, with nothing to fold, before a device is allowed, and opens for the first one', () => {
    const { rerender } = render(<DeviceList devices={[]} remove={() => undefined} />);
    expect(screen.getByText('No device allowed yet.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<DeviceList devices={[phone(true)]} remove={() => undefined} />);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.atlas-gm-screen-device')?.hasAttribute('data-arrived')).toBe(true);
  });

  it('lets rows there as it opened stand still', () => {
    render(<DeviceList devices={[phone(true)]} remove={() => undefined} />);
    expect(document.querySelector('.atlas-gm-screen-device')?.hasAttribute('data-arrived')).toBe(false);
  });
});

describe('a device\'s row', () => {
  it('reads as connected while it is, and says when an away device was last seen', () => {
    expect(deviceState(phone(true, 0), NOW)).toBe('Connected');
    expect(deviceState(phone(false, NOW - 20_000), NOW)).toBe('Seen just now');
    expect(deviceState(phone(false, NOW - 5 * 60_000), NOW)).toBe('Seen 5 min ago');
    expect(deviceState(phone(false, NOW - 3 * 3_600_000), NOW)).toBe('Seen 3 h ago');
    expect(deviceState(phone(false, NOW - 86_400_000), NOW)).toBe('Seen 1 day ago');
    expect(deviceState(phone(false, NOW - 4 * 86_400_000), NOW)).toBe('Seen 4 days ago');
    expect(deviceState(phone(false, 0), NOW)).toBe('Away');
  });

  const removeButton = (): HTMLElement => screen.getByRole('button', { name: 'Remove Mira’s phone' });
  const confirmButton = (): HTMLElement => screen.getByRole('button', { name: 'Press again to remove Mira’s phone' });

  it('removes an away device on two presses, as a connected one, the second once the confirm has stood a moment', () => {
    vi.useFakeTimers();
    const removed: string[] = [];
    render(<DeviceList devices={[phone(false)]} remove={(id) => removed.push(id)} />);
    fireEvent.click(toggle());
    fireEvent.click(removeButton());
    expect(removed).toEqual([]);
    act(() => vi.advanceTimersByTime(ARM_MS));
    fireEvent.click(confirmButton());
    expect(removed).toEqual(['phone']);
  });

  it('asks before it removes: a second press removes, a pause lets the confirm go', () => {
    vi.useFakeTimers();
    const removed: string[] = [];
    render(<DeviceList devices={[phone(true)]} remove={(id) => removed.push(id)} />);
    fireEvent.click(removeButton());
    expect(removed).toEqual([]);
    expect(confirmButton().textContent).toBe('Remove');
    act(() => vi.advanceTimersByTime(CONFIRM_MS));
    expect(removeButton()).toBeTruthy();
    fireEvent.click(removeButton());
    act(() => vi.advanceTimersByTime(ARM_MS));
    fireEvent.click(confirmButton());
    expect(removed).toEqual(['phone']);
  });

  it('takes no second press from a double-click: the confirm comes under the pointer and waits before it removes', () => {
    vi.useFakeTimers();
    const removed: string[] = [];
    render(<DeviceList devices={[phone(true)]} remove={(id) => removed.push(id)} />);
    fireEvent.click(removeButton());
    act(() => vi.advanceTimersByTime(150));
    fireEvent.click(confirmButton());
    expect(confirmButton().getAttribute('aria-disabled')).toBe('true');
    expect(removed).toEqual([]);
    act(() => vi.advanceTimersByTime(ARM_MS));
    expect(confirmButton().hasAttribute('aria-disabled')).toBe(false);
  });

  it('lets the confirm go when the focus leaves it', () => {
    render(<DeviceList devices={[phone(true)]} remove={() => undefined} />);
    fireEvent.click(removeButton());
    fireEvent.blur(confirmButton());
    expect(removeButton()).toBeTruthy();
  });

  it('never brings a confirm back by itself: one left as the device dropped is gone when the device comes back', () => {
    vi.useFakeTimers();
    const removed: string[] = [];
    const remove = (id: string): void => void removed.push(id);
    const { rerender } = render(<DeviceList devices={[phone(true)]} remove={remove} />);
    fireEvent.click(removeButton());
    expect(confirmButton()).toBeTruthy();
    // The phone's screen sleeps a second later; ten minutes pass; it wakes. The focus stays on the button.
    act(() => vi.advanceTimersByTime(1000));
    rerender(<DeviceList devices={[phone(false)]} remove={remove} />);
    expect(screen.queryByRole('button', { name: 'Press again to remove Mira’s phone' })).toBeNull();
    act(() => vi.advanceTimersByTime(10 * 60_000 + CONFIRM_MS));
    rerender(<DeviceList devices={[phone(true)]} remove={remove} />);
    expect(screen.queryByRole('button', { name: 'Press again to remove Mira’s phone' })).toBeNull();
    fireEvent.click(document.querySelector('.atlas-gm-screen-device__remove')!);
    expect(removed).toEqual([]);
  });

  it('lets the confirm go when the rows move, so a press meant for what stood there before finds a plain Remove', () => {
    vi.useFakeTimers();
    const removed: string[] = [];
    const remove = (id: string): void => void removed.push(id);
    const { rerender } = render(<DeviceList devices={[phone(true), tablet(true)]} layout="quiet" remove={remove} />);
    fireEvent.click(removeButton());
    act(() => vi.advanceTimersByTime(ARM_MS));
    // A device asks to join: its prompt stands above the rows, which move down under the pointer.
    rerender(<DeviceList devices={[phone(true), tablet(true)]} layout="a device asks" remove={remove} />);
    fireEvent.click(removeButton());
    expect(removed).toEqual([]);
    expect(confirmButton().getAttribute('aria-disabled')).toBe('true');
  });
});
