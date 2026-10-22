// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { App, PluginManifest } from 'obsidian';
import { collectDiagnostics, formatDiagnostics } from '../../src/app/support/diagnostics';
import { AtlasErrorLog, formatErrors } from '../../src/app/support/errorLog';

const manifest = { id: 'atlas-vtt', version: '0.2.0-beta.1' } as PluginManifest;
const plugin = (name: string, version: string) => ({ manifest: { name, version } });

describe('issue diagnostics', () => {
  it('collects versions, system facts and enabled plugins without vault details', () => {
    const app = {
      plugins: {
        plugins: { 'atlas-vtt': plugin('Atlas VTT', '0.2.0-beta.1'), dataview: plugin('Dataview', '0.5.68'), disabled: plugin('Off', '1.0.0'), brat: plugin('BRAT', '1.1.0') },
        enabledPlugins: new Set(['atlas-vtt', 'dataview', 'brat']),
      },
      customCss: { theme: 'Minimal' },
    } as unknown as App;
    const diagnostics = collectDiagnostics(app, manifest);
    expect(diagnostics.pluginVersion).toBe('0.2.0-beta.1');
    expect(diagnostics.obsidianVersion).toBe('1.13.1');
    expect(diagnostics.theme).toBe('Minimal');
    expect(diagnostics.plugins.map(entry => entry.id)).toEqual(['brat', 'dataview']);
    expect(JSON.stringify(diagnostics)).not.toMatch(/vault|\.md/i);
  });
  it('degrades gracefully without the internal plugin registry', () => {
    const diagnostics = collectDiagnostics({} as App, manifest);
    expect(diagnostics.plugins).toEqual([]);
    expect(diagnostics.theme).toBe('Default');
    const text = formatDiagnostics(diagnostics, { includePlugins: true });
    expect(text).toContain('- Atlas VTT: 0.2.0-beta.1');
    expect(text).toContain('- Obsidian: 1.13.1');
    expect(text).toContain('Enabled community plugins (0): none');
    expect(formatDiagnostics(diagnostics, { includePlugins: false })).not.toContain('community plugins');
  });
});

describe('Atlas error log', () => {
  it('records only Atlas console errors and plugin-originated uncaught errors, newest last', () => {
    const log = new AtlasErrorLog(2);
    const original = console.error;
    const spy = vi.fn();
    console.error = spy;
    const detach = log.attach(window);
    console.error('[Atlas] Could not load map', new Error('boom'));
    console.error('Some other plugin failed');
    const foreign = new Error('elsewhere');
    foreign.stack = 'Error: elsewhere\n    at plugin:other-plugin:1:1';
    window.dispatchEvent(new ErrorEvent('error', { message: 'elsewhere', error: foreign }));
    const own = new Error('renderer died');
    own.stack = 'Error: renderer died\n    at plugin:atlas-vtt:10:2';
    window.dispatchEvent(new ErrorEvent('error', { message: 'renderer died', error: own }));
    console.error('[Atlas]   third   error');
    expect(spy).toHaveBeenCalledTimes(3);
    expect(log.recent().map(entry => entry.message)).toEqual(['renderer died', '[Atlas] third error']);
    expect(formatErrors(log.recent())).toMatch(/^\d{2}:\d{2}:\d{2} renderer died\n\d{2}:\d{2}:\d{2} \[Atlas\] third error$/);
    detach();
    expect(console.error).toBe(spy);
    console.error = original;
    console.error('[Atlas] after detach');
    expect(log.recent()).toHaveLength(2);
  });
});
