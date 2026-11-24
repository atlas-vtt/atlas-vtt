import { afterEach, expect, it } from 'vitest';
import type { App, Plugin } from 'obsidian';
import css from '../../styles/looks/atlas-looks.css?inline';
import { SettingsService } from '../../src/app/services/SettingsService';
import { LookService } from '../../src/app/appearance/lookService';
import { registerLookSync } from '../../src/app/appearance/atlasLook';
import { PAINTED_IVY_CLASS } from '../../src/app/appearance/paintedIvy';

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.head.querySelectorAll('style[data-test-looks]').forEach((style) => style.remove());
  document.body.className = '';
});

/** An app on this device with the Medieval look and pink ivy stored, as after a reload. */
function reloadedApp(): App {
  const storage = new Map<string, unknown>([['atlas-vtt:look', 'mediaeval'], ['atlas-vtt:ivy-colour', '#d46a8a']]);
  return {
    vault: { adapter: { exists: async () => true, write: async () => {} }, getConfig: () => null, setConfig: () => {}, on: () => ({}), offref: () => {} },
    workspace: { on: () => ({}), offref: () => {}, trigger: () => {}, iterateAllLeaves: () => {} },
    loadLocalStorage: (key: string) => storage.get(key) ?? null,
    saveLocalStorage: (key: string, value: unknown) => { storage.set(key, value); },
    customCss: { theme: '', themes: {}, setTheme: () => {} },
  } as unknown as App;
}

it('paints the stored ivy colour once Obsidian adds the stylesheet, which it does only after onload', async () => {
  const app = reloadedApp();
  const looks = LookService.forApp(app, new SettingsService(app));
  disposers.push(() => LookService.release(app));
  const plugin = {
    app,
    register: (dispose: () => void) => { disposers.push(dispose); },
    registerEvent: () => {},
    registerDomEvent: () => {},
  } as unknown as Plugin;

  // onload: the stylesheet is not in the document yet
  registerLookSync(plugin, looks);
  expect(document.body.classList.contains(PAINTED_IVY_CLASS)).toBe(false);

  // then Obsidian inserts styles.css (`Plugin.loadCSS`), announcing nothing
  document.head.createEl('style', { text: css, attr: { 'data-test-looks': '' } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(document.body.classList.contains(PAINTED_IVY_CLASS)).toBe(true);
});
