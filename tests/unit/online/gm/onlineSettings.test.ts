// @vitest-environment jsdom
import { Setting } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { AccountControl } from '../../../../src/app/online/gm/account/AccountControl.ts';
import type { HttpRequest, HttpResponse } from '../../../../src/app/online/gm/account/http.ts';
import { DEFAULT_SETTINGS, onlineSettingsSections, readSettings, type OnlineSettings } from '../../../../src/app/online/gm/settings.ts';

const MARA = { id: 'acc_mara', handle: 'mara', name: 'Mara' };

describe('online play\'s settings data', () => {
  it('reports no errors until the GM switches it on', () => {
    expect(DEFAULT_SETTINGS).toEqual({ reportErrors: false });
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(readSettings({ reportErrors: 'yes' })).toEqual(DEFAULT_SETTINGS);
    expect(readSettings({ reportErrors: true })).toEqual({ reportErrors: true });
  });

  it('keeps nothing of a key that made tables without an account', () => {
    const read = readSettings({ createKey: 'owner-key', reportErrors: false });
    expect(read).toEqual(DEFAULT_SETTINGS);
    expect(Object.keys(read)).toEqual(['reportErrors']);
  });
});

describe('online play\'s settings', () => {
  /** Online play's settings with a GM signed in. */
  function host(me: HttpResponse): { settings: OnlineSettings; account: AccountControl; saveSettings: () => Promise<void>; opened: string[]; saved: OnlineSettings[]; requests: HttpRequest[] } {
    const settings = { ...DEFAULT_SETTINGS };
    const opened: string[] = [];
    const saved: OnlineSettings[] = [];
    const requests: HttpRequest[] = [];
    let token: string | null = 'tok';
    const account = new AccountControl({
      http: (request) => (requests.push(request), Promise.resolve(me)),
      timers: { now: () => 0, setTimer: () => 0, clearTimer: () => undefined },
      tokens: { get: () => token, set: (next) => (token = next), clear: () => (token = null) },
      openUrl: (url) => void opened.push(url),
      notify: () => undefined,
    });
    return { settings, account, opened, saved, requests, saveSettings: () => Promise.resolve(void saved.push({ ...settings })) };
  }

  /** The sections drawn as the settings tab draws them. */
  function draw(of: ReturnType<typeof host>): { headings: string[]; names: string[]; row(name: string): Setting } {
    const sections = onlineSettingsSections(of);
    const rows = new Map<string, Setting>();
    for (const section of sections) {
      for (const row of section.rows) {
        const setting = new Setting(document.body.createDiv()).setName(row.name);
        if (row.desc !== undefined) setting.setDesc(row.desc);
        row.render(setting);
        rows.set(row.name, setting);
      }
    }
    return {
      headings: sections.map((section) => section.heading),
      names: [...rows.keys()],
      row: (name) => {
        const row = rows.get(name);
        if (row === undefined) throw new Error(`no row ${name}`);
        return row;
      },
    };
  }

  const buttonsOf = (setting: Setting): string[] => [...setting.controlEl.querySelectorAll('button')].map((button) => button.textContent ?? '');

  it('have the account and error reports, and neither a key that creates tables nor the relay\'s account data', () => {
    const drawn = draw(host({ status: 200, json: { account: MARA, access: null, reason: 'no-access' } }));
    expect(drawn.headings).toEqual(['Online account', 'Online diagnostics']);
    expect(drawn.names).toEqual(['Atlas account', 'Send error reports']);
  });

  it('say in the account row why the account may not host, with the way to the account page', async () => {
    const of = host({ status: 200, json: { account: MARA, access: null, reason: 'access-revoked' } });
    const row = draw(of).row('Atlas account');
    expect(row.descEl.textContent).toBe('Checking your account…');
    await of.account.refresh(true);
    expect(row.descEl.textContent).toBe('Signed in as Mara (@mara). Your access to online play was withdrawn. See your account page.');
    expect(buttonsOf(row)).toEqual(['Sign out', 'Open account page']);
    row.controlEl.querySelectorAll('button')[1]?.click();
    expect(of.opened).toEqual(['https://atlas-vtt.dev/account']);
    expect(row.controlEl.querySelector('input')).toBeNull();
  });

  it('say what an account that may host holds, asked of Atlas\'s table server', async () => {
    const of = host({ status: 200, json: { account: MARA, access: { plan: 'beta', maxPlayers: 12, endsAt: null } } });
    const row = draw(of).row('Atlas account');
    await of.account.refresh(true);
    expect(row.descEl.textContent).toBe('Signed in as Mara (@mara) · Early access · up to 12 players');
    expect(buttonsOf(row)).toEqual(['Sign out', 'Open account page']);
    expect(of.requests.map((request) => request.url)).toEqual(['https://play.atlas-vtt.dev/api/me']);
  });
});
