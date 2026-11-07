// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Setting, type App } from 'obsidian';
import { IssueReportModal, type IssueReportModalOptions } from '../../src/app/support/IssueReportModal';
import { supportSettingsSection } from '../../src/app/settings/supportSettingsSection';

function openModal(overrides: Partial<IssueReportModalOptions> = {}) {
  const options: IssueReportModalOptions = {
    preset: {},
    diagnostics: { pluginVersion: '0.2.0-beta.1', obsidianVersion: '1.13.1', electronVersion: '37.2.0', system: 'macOS arm64', language: 'en-US', theme: 'Default', plugins: [{ id: 'brat', name: 'BRAT', version: '1.1.0' }] },
    errors: [{ at: '12:00:00', message: '[Atlas] Fog failed' }],
    openExternal: vi.fn(),
    submitReport: vi.fn(async () => ({ number: 42, url: 'https://github.com/ByteMirror/atlas-vtt/issues/42' })),
    copyText: vi.fn(async () => {}),
    ...overrides,
  };
  const modal = new IssueReportModal({} as App, options);
  act(() => modal.onOpen());
  const el = modal.contentEl;
  const set = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    element.value = value;
    element.dispatchEvent(new Event('input'));
    element.dispatchEvent(new Event('change'));
  };
  const button = (text: string) => [...el.querySelectorAll('button')].find(entry => entry.textContent === text)!;
  /** Opens the custom select named `label` and picks the option with `text`; each click renders before the next. */
  const choose = async (label: string, text: string) => {
    const trigger = [...el.querySelectorAll<HTMLButtonElement>('[role="combobox"]')].find(entry => el.querySelector(`#${entry.getAttribute('aria-labelledby')}`)?.textContent === label)!;
    await act(() => trigger.click());
    await act(() => [...el.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(option => option.textContent === text)!.click());
  };
  return { modal, el, options, set, button, choose };
}

describe('issue report modal', () => {
  it('refuses to submit without a title and description', () => {
    const { button, options } = openModal();
    button('Submit report').click();
    expect(options.submitReport).not.toHaveBeenCalled();
  });
  it('submits the selected categories and diagnostics without opening GitHub', async () => {
    const { el, set, button, options, choose } = openModal();
    await choose('Issue type', 'Conflict with another plugin or theme');
    await choose('Area', 'Tokens');
    set(el.querySelector('input')!, 'Tokens vanish with Dataview');
    const [description, steps] = el.querySelectorAll('textarea');
    set(description!, 'After enabling Dataview the tokens disappear.');
    set(steps!, '1. Enable Dataview');
    button('Submit report').click();
    await vi.waitFor(() => expect(el.textContent).toContain('Report submitted'));
    expect(options.submitReport).toHaveBeenCalledWith(expect.objectContaining({
      type: 'compatibility', area: 'tokens', title: 'Tokens vanish with Dataview',
      steps: '1. Enable Dataview', environment: expect.stringContaining('BRAT 1.1.0'),
      errors: '12:00:00 [Atlas] Fog failed',
    }), expect.any(String));
    expect(options.openExternal).not.toHaveBeenCalled();
    expect(el.textContent).toContain('#42');
  });
  it('blocks double submission and keeps the draft on a failed request', async () => {
    let reject!: (reason: Error) => void;
    const submitReport = vi.fn(() => new Promise<never>((_, fail) => { reject = fail; }));
    const { el, set, button } = openModal({ submitReport });
    set(el.querySelector('input')!, 'Fog issue');
    set(el.querySelector('textarea')!, 'The fog vanished.');
    const submit = button('Submit report');
    submit.click();
    submit.click();
    expect(submitReport).toHaveBeenCalledTimes(1);
    expect(submit.disabled).toBe(true);
    expect(el.querySelector('input')!.disabled).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('[role="combobox"]')!.disabled).toBe(true);
    reject(new Error('Connection unavailable'));
    await vi.waitFor(() => expect(submit.disabled).toBe(false));
    expect(el.querySelector('input')!.value).toBe('Fog issue');
    expect(el.querySelector('input')!.disabled).toBe(false);
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('Connection unavailable');
    submit.click();
    expect(submitReport.mock.calls[1]![1]).toBe(submitReport.mock.calls[0]![1]);
    reject(new Error('Connection unavailable'));
    await vi.waitFor(() => expect(submit.disabled).toBe(false));
  });
  it('switches wording for feature requests and copies a markdown report', async () => {
    const { modal, el, set, button, options, choose } = openModal({ preset: { type: 'feature', area: 'dice' } });
    expect(modal.titleEl.textContent).toBe('Suggest a feature');
    expect(el.textContent).toContain('What would you like to do?');
    expect(el.querySelectorAll('[role="combobox"]')[1]!.textContent).toBe('Dice');
    expect(el.querySelector('[aria-label]')).toBeNull();
    await choose('Issue type', "Something doesn't work");
    expect(modal.titleEl.textContent).toBe('Report an issue');
    expect(el.textContent).toContain('Steps to reproduce');
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    await choose('Issue type', 'Feature request');
    set(el.querySelector('input')!, 'Dice presets');
    set(el.querySelector('textarea')!, 'Save common rolls.');
    button('Copy report').click();
    await Promise.resolve();
    const text = vi.mocked(options.copyText).mock.calls[0]![0];
    expect(text).toContain('# Dice presets');
    expect(text).toContain('Feature request · Dice');
    expect(text).not.toContain('Recent errors');
  });
  it('is reachable from the settings tab', () => {
    const reporter = { open: vi.fn() };
    const section = supportSettingsSection(reporter as never);
    const container = document.createElement('div');
    for (const row of section.rows) row.render(new Setting(container));
    for (const button of container.querySelectorAll('button')) button.click();
    expect(reporter.open).toHaveBeenCalledWith({ type: 'bug' });
    expect(reporter.open).toHaveBeenCalledWith({ type: 'feature' });
  });
});
