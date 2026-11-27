// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GmScreenDeviceView } from '../../../../src/app/online/gmScreen/index.ts';
import { foldAfter, restingFold } from '../../../../src/app/online/gmScreen/ui/deviceFold.ts';
import { DeviceList } from '../../../../src/app/online/gmScreen/ui/DeviceList';
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

  it('removes an away device on one press', () => {
    const removed: string[] = [];
    render(<DeviceList devices={[phone(false)]} remove={(id) => removed.push(id)} />);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mira’s phone' }));
    expect(removed).toEqual(['phone']);
  });

  it('asks lightly before it removes a connected device: a second press removes it, a pause lets it go', () => {
    vi.useFakeTimers();
    const removed: string[] = [];
    render(<DeviceList devices={[phone(true)]} remove={(id) => removed.push(id)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mira’s phone' }));
    expect(removed).toEqual([]);
    const confirm = screen.getByRole('button', { name: 'Press again to remove Mira’s phone' });
    expect(confirm.textContent).toBe('Remove');
    act(() => vi.advanceTimersByTime(CONFIRM_MS));
    expect(screen.getByRole('button', { name: 'Remove Mira’s phone' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mira’s phone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Press again to remove Mira’s phone' }));
    expect(removed).toEqual(['phone']);
  });

  it('lets the confirm go when the focus leaves it, and removes at once a device that left meanwhile', () => {
    const removed: string[] = [];
    const { rerender } = render(<DeviceList devices={[phone(true)]} remove={(id) => removed.push(id)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mira’s phone' }));
    fireEvent.blur(screen.getByRole('button', { name: 'Press again to remove Mira’s phone' }));
    expect(screen.getByRole('button', { name: 'Remove Mira’s phone' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mira’s phone' }));
    rerender(<DeviceList devices={[phone(false)]} remove={(id) => removed.push(id)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mira’s phone' }));
    expect(removed).toEqual(['phone']);
  });
});
