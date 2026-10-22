// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkdownRenderer } from 'obsidian';
import { ChangelogContent } from '../../src/app/changelog/ChangelogContent';

const releases = ['0.1.10', '0.1.9'].map(version => ({ version, title: `Release ${version}`, date: '2026-09-20', markdown: `## Fixed\n\n- Fix from ${version}.` }));
function props() {
  return { app: {} as any, releases, currentVersion: '0.1.10', newVersions: new Set(['0.1.10']), showOnUpdate: true,
    majorUpdatesOnly: false, onMajorUpdatesChange: vi.fn(),
    onPreferenceChange: vi.fn(), onCurrentRendered: vi.fn(), onClose: vi.fn() };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('release history accordion', () => {
  it('supports every update, feature updates only, and no automatic announcements', () => {
    const options = props(); render(<ChangelogContent {...options} />);
    const enabled = screen.getByRole('checkbox', { name: 'Show changelog after updates' }) as HTMLInputElement;
    const major = screen.getByRole('checkbox', { name: 'Feature updates only' }) as HTMLInputElement;
    expect(major.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(major.getAttribute('aria-describedby')!)!.textContent).toMatch(/1\.2\.1/);
    expect(enabled.checked).toBe(true);
    expect(major.checked).toBe(false);
    fireEvent.click(major);
    expect(options.onMajorUpdatesChange).toHaveBeenCalledWith(true);
    fireEvent.click(enabled);
    expect(major.disabled).toBe(true);
    expect(options.onPreferenceChange).toHaveBeenCalledWith(false);
    fireEvent.click(enabled);
    expect(major.disabled).toBe(false);
    expect(major.checked).toBe(true);
  });
  it('opens the current entry, renders older notes on demand, and permits multiple expanded entries', async () => {
    const options = props();
    render(<ChangelogContent {...options} />);
    await screen.findByText(/Fix from 0.1.10/);
    expect(screen.queryByText(/Fix from 0.1.9/)).toBeNull();
    const older = screen.getByRole('button', { name: /Release 0.1.9/ });
    expect(older.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(older);
    await screen.findByText(/Fix from 0.1.9/);
    expect(screen.getByRole('button', { name: /Release 0.1.10/ }).getAttribute('aria-expanded')).toBe('true');
    expect(older.getAttribute('aria-expanded')).toBe('true');
    expect(options.onCurrentRendered).toHaveBeenCalled();
  });
  it('leads with the current release, labels older ones, and keeps opened notes mounted while collapsed', async () => {
    render(<ChangelogContent {...props()} />);
    const [current, older] = screen.getAllByRole('article');
    expect(current!.hasAttribute('data-current')).toBe(true);
    expect(older!.hasAttribute('data-current')).toBe(false);
    expect(screen.getByRole('region', { name: 'Previous releases' }).contains(older!)).toBe(true);
    expect(screen.getAllByText('New')).toHaveLength(1);
    await screen.findByRole('heading', { level: 4, name: 'Fixed' });
    const trigger = screen.getByRole('button', { name: /Release 0.1.10/ });
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    const panel = document.getElementById(trigger.getAttribute('aria-controls')!)!;
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(panel.textContent).toContain('Fix from 0.1.10');
  });
  it('marks beta entries and shows dates only for published releases', () => {
    const beta = { version: '0.2.0-beta.1', title: 'Coming in 0.2.0', markdown: '## New\n\n- Preview.' };
    render(<ChangelogContent {...props()} releases={[beta, ...releases]} currentVersion={beta.version} newVersions={new Set()} />);
    const [current] = screen.getAllByRole('article');
    expect(current!.textContent).toContain('Beta');
    expect(current!.querySelector('time')).toBeNull();
    expect(screen.getAllByRole('article')[1]!.querySelector('time')).not.toBeNull();
  });
  it('offers a labeled opt-out and a close action', () => {
    const options = props(); render(<ChangelogContent {...options} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show changelog after updates' }));
    expect(options.onPreferenceChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(options.onClose).toHaveBeenCalledOnce();
  });
  it('does not acknowledge failed Markdown rendering and shows a readable fallback', async () => {
    vi.spyOn(MarkdownRenderer, 'render').mockRejectedValue(new Error('renderer failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const options = props(); render(<ChangelogContent {...options} />);
    await screen.findByRole('alert');
    expect(screen.getByText(/Fix from 0.1.10/)).toBeTruthy();
    expect(options.onCurrentRendered).not.toHaveBeenCalled();
  });
  it('ignores rendering that finishes after closing', async () => {
    let finish!: () => void;
    vi.spyOn(MarkdownRenderer, 'render').mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const options = props(); const result = render(<ChangelogContent {...options} />);
    result.unmount();
    await act(async () => finish());
    expect(options.onCurrentRendered).not.toHaveBeenCalled();
  });
});
