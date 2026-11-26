import { apiVersion, Platform, type App, type PluginManifest } from 'obsidian';
import { isRecord } from '../utils/guards';

export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
}

/** Environment facts a maintainer needs to reproduce a report. Never includes vault names, paths or content. */
export interface IssueDiagnostics {
  pluginVersion: string;
  obsidianVersion: string;
  electronVersion: string | null;
  system: string;
  language: string;
  theme: string;
  plugins: InstalledPlugin[];
}

const collator = new Intl.Collator('en');

/** Obsidian's mobile apps first: an iPad also says it is a Mac (`Platform.isMacOS`), and Android says nothing else. */
function operatingSystem(): string {
  if (Platform.isIosApp) return Platform.isPhone ? 'iOS' : 'iPadOS';
  if (Platform.isAndroidApp) return 'Android';
  if (Platform.isMacOS) return 'macOS';
  if (Platform.isWin) return 'Windows';
  if (Platform.isLinux) return 'Linux';
  return 'Unknown OS';
}

/** Node's `process`, which only the desktop app has; one that some script put on the window says nothing of Node. */
function nodeProcess(): { versions: Record<string, unknown>; arch: string } | undefined {
  const candidate: unknown = typeof window === 'undefined' ? undefined : Reflect.get(window, 'process');
  return isRecord(candidate) && isRecord(candidate.versions) && typeof candidate.arch === 'string' ? { versions: candidate.versions, arch: candidate.arch } : undefined;
}

function enabledPlugins(app: App, ownId: string): InstalledPlugin[] {
  const registry = app.plugins;
  if (!registry) return [];
  return Object.entries(registry.plugins)
    .filter(([id]) => id !== ownId && registry.enabledPlugins.has(id))
    .map(([id, plugin]) => ({ id, name: plugin.manifest.name, version: plugin.manifest.version }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

export function collectDiagnostics(app: App, manifest: PluginManifest): IssueDiagnostics {
  const proc = nodeProcess();
  return {
    pluginVersion: manifest.version,
    obsidianVersion: apiVersion,
    electronVersion: typeof proc?.versions.electron === 'string' ? proc.versions.electron : null,
    system: proc ? `${operatingSystem()} ${proc.arch}` : operatingSystem(),
    language: typeof navigator === 'undefined' ? 'unknown' : navigator.language,
    theme: app.customCss?.theme || 'Default',
    plugins: enabledPlugins(app, manifest.id),
  };
}

/** Markdown bullet list for the issue form's environment field. */
export function formatDiagnostics(diagnostics: IssueDiagnostics, { includePlugins }: { includePlugins: boolean }): string {
  const obsidian = diagnostics.electronVersion
    ? `${diagnostics.obsidianVersion} (Electron ${diagnostics.electronVersion})`
    : diagnostics.obsidianVersion;
  const lines = [
    `- Atlas VTT: ${diagnostics.pluginVersion}`,
    `- Obsidian: ${obsidian}`,
    `- System: ${diagnostics.system}, language ${diagnostics.language}`,
    `- Theme: ${diagnostics.theme}`,
  ];
  if (includePlugins) {
    const list = diagnostics.plugins.map(plugin => `${plugin.name} ${plugin.version}`).join(', ');
    lines.push(`- Enabled community plugins (${diagnostics.plugins.length}): ${list || 'none'}`);
  }
  return lines.join('\n');
}
