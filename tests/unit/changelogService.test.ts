// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { SettingsService } from '../../src/app/services/SettingsService';
import { ChangelogService, CHANGELOG_STORAGE_KEY } from '../../src/app/changelog/ChangelogService';

const dialogs = vi.hoisted(() => [] as Array<{ options: any; open: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }>);
vi.mock('../../src/app/changelog/ChangelogModal', () => ({
  ChangelogModal: class {
    open = vi.fn();
    close = vi.fn(() => this.options.onClose(true));
    constructor(_app: unknown, public options: any) { dialogs.push(this); }
  },
}));
const bundle = { version: '0.1.10', releases: ['0.1.10', '0.1.9', '0.1.8'].map(version => ({ version, date: '2026-09-20', title: 'Changes', markdown: '## Fixed\n- Scene saving.' })) };
function setup({ last = null as unknown, enabled = true, majorOnly = false, existing = true, releaseBuild = true, version = bundle.version, bundleVersion = version, bundle: releases = bundle } = {}) {
  const values = new Map([[CHANGELOG_STORAGE_KEY, last]]);
  const app = {
    loadLocalStorage: (key: string) => values.get(key),
    saveLocalStorage: vi.fn((key: string, value: unknown) => values.set(key, value)),
  } as unknown as App;
  const settings = { getSetting: (key: string) => key === 'changelogMajorUpdatesOnly' ? majorOnly : enabled, setSetting: vi.fn() } as unknown as SettingsService;
  const service = new ChangelogService(app, settings, { bundle: { ...releases, version: bundleVersion }, installedVersion: version, existingInstallation: existing, releaseBuild });
  return { service, values, app, settings };
}
beforeEach(() => dialogs.splice(0));
afterEach(() => vi.unstubAllGlobals());

describe('changelog announcements', () => {
  it('skips patch announcements in feature-only mode but keeps history available', () => {
    const { service, values } = setup({ last: '0.1.8', majorOnly: true });
    service.showUpdates();
    expect(dialogs).toHaveLength(0);
    expect(values.get(CHANGELOG_STORAGE_KEY)).toBe('0.1.10');
    service.open();
    expect(dialogs[0]!.options.majorUpdatesOnly).toBe(true);
    expect(dialogs[0]!.options.releases).toHaveLength(3);
  });
  it.each([
    ['0.1.9', '0.2.0', true],
    ['0.1.9', '0.2.3', true],
    ['0.2.0', '0.2.3', false],
    ['0.9.8', '1.0.0', true],
    ['1.2.0', '1.3.0', true],
    ['1.2.4', '1.3.2', true],
    ['1.2.0', '1.2.1', false],
    ['1.3.0', '1.4.0', true],
    ['2.1.0', '2.2.0', true],
    ['2.1.0', '2.1.3', false],
    ['1.9.0', '2.0.2', true],
    ['2.0.0', '1.9.0', false],
  ])('feature-only announcement from %s to %s: %s', (last, version, announce) => {
    const { service } = setup({ last, version, majorOnly: true });
    service.showUpdates();
    expect(dialogs).toHaveLength(announce ? 1 : 0);
  });
  it('waits until the main window has focus before automatically opening', async () => {
    vi.stubGlobal('activeWindow', {});
    const { service } = setup({ last: '0.1.8' });
    service.showUpdates();
    expect(dialogs).toHaveLength(0);
    vi.stubGlobal('activeWindow', window);
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    expect(dialogs).toHaveLength(1);
    service.destroy();
  });
  it('cancels a deferred main-window announcement on unload', async () => {
    vi.stubGlobal('activeWindow', {});
    const { service } = setup();
    service.showUpdates(); service.destroy();
    vi.stubGlobal('activeWindow', window);
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    expect(dialogs).toHaveLength(0);
  });
  it('shows all skipped releases once, then remembers user dismissal', () => {
    const { service, values } = setup({ last: '0.1.8' });
    service.showUpdates(); service.showUpdates(); service.open();
    expect(dialogs).toHaveLength(1);
    expect([...dialogs[0]!.options.newVersions]).toEqual(['0.1.10', '0.1.9']);
    expect(values.get(CHANGELOG_STORAGE_KEY)).toBe('0.1.8');
    dialogs[0]!.options.onClose(true);
    expect(values.get(CHANGELOG_STORAGE_KEY)).toBe('0.1.10');
    service.showUpdates();
    expect(dialogs).toHaveLength(1);
  });
  it('lets beta builds browse the targeted release without announcing or acknowledging', () => {
    const { service, values } = setup({ last: '0.1.8', version: '0.1.10-beta.2', bundleVersion: '0.1.10-beta.2' });
    service.showUpdates();
    expect(dialogs).toHaveLength(0);
    service.open();
    expect(dialogs[0]!.options.releases.map((release: { version: string }) => release.version)).toEqual(['0.1.10', '0.1.9', '0.1.8']);
    expect([...dialogs[0]!.options.newVersions]).toEqual(['0.1.10', '0.1.9']);
    dialogs[0]!.options.onClose(true);
    expect(values.get(CHANGELOG_STORAGE_KEY)).toBe('0.1.8');
  });
  it('shows a beta build its own pending notes ahead of the published history', () => {
    const pending = { version: '0.2.0-beta.2', title: 'Coming in 0.2.0', markdown: '## New\n- Preview.' };
    const { service } = setup({ last: '0.1.9', version: pending.version, bundleVersion: pending.version, bundle: { version: pending.version, releases: [pending, ...bundle.releases] } });
    service.open();
    expect(dialogs[0]!.options.releases.map((release: { version: string }) => release.version)).toEqual([pending.version, '0.1.10', '0.1.9', '0.1.8']);
    expect([...dialogs[0]!.options.newVersions]).toEqual([pending.version, '0.1.10']);
  });
  it('baselines fresh installs without interrupting onboarding', () => {
    const { service, values } = setup({ existing: false });
    service.showUpdates();
    expect(dialogs).toHaveLength(0);
    expect(values.get(CHANGELOG_STORAGE_KEY)).toBe('0.1.10');
    service.open();
    expect(dialogs).toHaveLength(1);
  });
  it('announces only the installed release to existing users receiving the feature', () => {
    setup().service.showUpdates();
    expect(dialogs).toHaveLength(1);
    expect([...dialogs[0]!.options.newVersions]).toEqual(['0.1.10']);
  });
  it.each(['0.1.10', '0.2.0'])('does not reannounce equal or downgraded versions (%s)', last => {
    const { service, values } = setup({ last });
    service.showUpdates();
    expect(dialogs).toHaveLength(0);
    service.open(); dialogs[0]!.options.onClose(true);
    expect(values.get(CHANGELOG_STORAGE_KEY)).toBe(last);
  });
  it('advances the baseline when disabled, while allowing manual browsing', () => {
    const { service, values } = setup({ last: '0.1.8', enabled: false });
    service.showUpdates();
    expect(dialogs).toHaveLength(0);
    expect(values.get(CHANGELOG_STORAGE_KEY)).toBe('0.1.10');
    service.open();
    expect(dialogs[0]!.options.showOnUpdate).toBe(false);
  });
  it('leaves failed or incomplete rendering unacknowledged', () => {
    const { service, values } = setup({ last: '0.1.8' });
    service.showUpdates(); dialogs[0]!.options.onClose(false);
    expect(values.get(CHANGELOG_STORAGE_KEY)).toBe('0.1.8');
  });
  it('does not acknowledge unload or allow callbacks to reopen after unload', () => {
    const { service, values } = setup({ last: '0.1.8' });
    service.showUpdates(); service.destroy(); service.showUpdates(); service.open();
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]!.close).toHaveBeenCalledOnce();
    expect(values.get(CHANGELOG_STORAGE_KEY)).toBe('0.1.8');
  });
  it.each([{ releaseBuild: false }, { version: '0.1.9', bundleVersion: bundle.version }])('suppresses automatic notes for development/mismatched builds: %o', overrides => {
    const { service, app } = setup(overrides);
    service.showUpdates();
    expect(dialogs).toHaveLength(0);
    expect(app.saveLocalStorage).not.toHaveBeenCalled();
    service.open();
    expect(dialogs).toHaveLength(1);
  });
  it('treats corrupt local markers as an existing-install bootstrap', () => {
    setup({ last: { invalid: true } }).service.showUpdates();
    expect([...dialogs[0]!.options.newVersions]).toEqual(['0.1.10']);
  });
});
