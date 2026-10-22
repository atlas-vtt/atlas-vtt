// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressBar } from '../../src/app/packages/components/primitives/ProgressBar';
import { ProgressStatus } from '../../src/app/packages/components/primitives/ProgressStatus';
import { useFrameProgress } from '../../src/app/packages/components/primitives/useFrameProgress';
import { useLingeringTask, type ProgressTask } from '../../src/app/packages/components/primitives/useLingeringTask';
import { useBatchProgress } from '../../src/app/packages/components/asset-manager/token-creator/useBatchProgress';

const task = (done: number, total = 10): ProgressTask => ({ label: 'Creating tokens', done, total });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useLingeringTask', () => {
  it('shows a task only once it has run for a moment, then briefly as complete', () => {
    const { result, rerender } = renderHook(({ current }: { current: ProgressTask | null }) => useLingeringTask(current), { initialProps: { current: task(0) } });
    expect(result.current).toBeNull();
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toEqual(task(0));
    rerender({ current: task(4) });
    expect(result.current).toEqual(task(4));

    rerender({ current: null });
    expect(result.current).toEqual(task(10));
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBeNull();
  });

  it('never shows work that ends quickly', () => {
    const { result, rerender } = renderHook(({ current }: { current: ProgressTask | null }) => useLingeringTask(current), { initialProps: { current: task(0) } });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ current: null });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBeNull();
  });
});

describe('ProgressStatus', () => {
  it('says what runs at once, adds the bar and count after a moment and ends with a full bar', () => {
    const view = render(<ProgressStatus task={task(3)}>12 tokens ready</ProgressStatus>);
    expect(screen.getByText('Creating tokens')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();

    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('3 of 10');

    view.rerender(<ProgressStatus task={null}>12 tokens ready</ProgressStatus>);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('10');
    expect(view.container.querySelector('.atlas-progress-status__check')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByText('12 tokens ready')).toBeTruthy();
  });

  it('shows no bar for a single step and no completion after a failure', () => {
    const view = render(<ProgressStatus task={task(0, 1)}>Idle</ProgressStatus>);
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('Creating tokens')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();

    view.rerender(<ProgressStatus task={null} failed>Saved 0 of 1.</ProgressStatus>);
    expect(screen.getByText('Saved 0 of 1.')).toBeTruthy();
  });
});

describe('ProgressBar', () => {
  it('clamps its value and describes it for screen readers', () => {
    render(<ProgressBar value={14} max={12} label="Loading images" valueText="12 of 12" />);
    const bar = screen.getByRole('progressbar', { name: 'Loading images' });
    expect(bar.getAttribute('aria-valuenow')).toBe('12');
    expect(bar.getAttribute('aria-valuemax')).toBe('12');
  });
});

describe('useBatchProgress', () => {
  it('counts a batch, takes out cancelled items and starts a new batch after the last one ended', () => {
    const { result } = renderHook(() => useBatchProgress());
    act(() => result.current.start(3));
    act(() => result.current.finish());
    act(() => result.current.start(2));
    expect(result.current.progress).toEqual({ done: 1, total: 5 });
    act(() => result.current.drop());
    act(() => { result.current.finish(); result.current.finish(); result.current.finish(); });
    expect(result.current.progress).toBeNull();
    act(() => result.current.start(4));
    expect(result.current.progress).toEqual({ done: 0, total: 4 });
  });
});

describe('useFrameProgress', () => {
  it('renders at most once a frame, with the latest report', () => {
    let renders = 0;
    const { result } = renderHook(() => { renders += 1; return useFrameProgress(); });
    const before = renders;
    act(() => { for (let i = 0; i < 1000; i++) result.current.report(i, 6719); });
    expect(result.current.progress).toBeNull();
    act(() => { vi.advanceTimersToNextFrame(); });
    expect(result.current.progress).toEqual({ done: 999, total: 6719 });
    expect(renders - before).toBe(1);
  });
});
