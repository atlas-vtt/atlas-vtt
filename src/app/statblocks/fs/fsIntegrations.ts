/**
 * Buttons Fantasy Statblocks' layouts carry for other plugins, which Atlas
 * does itself: Basic 5e's two Initiative Tracker buttons ("Add to a new
 * encounter", "Add to the encounter"). An import leaves such a button out and
 * says why once, where any other button stays a script block. Recognised by
 * what the button calls, never by its id or icon: the plugin's global
 * (`InitiativeTracker.addCreatures`), the plugin by its id
 * (`app.plugins.getPlugin("initiative-tracker")`), or one of its commands.
 * The code is read as text, never run. Pure.
 */

import { own } from '../format/jsonValues';
import { t } from '../../i18n';

interface Integration {
  /** Whether the button's code or command reaches the plugin. */
  calls: (code: string, command: string) => boolean;
  /** The report's sentence, once per import. */
  sentence: string;
}

const INITIATIVE_TRACKER_ID = 'initiative-tracker';
/** `InitiativeTracker.newEncounter(…)`, `window.InitiativeTracker?.addCreatures(…)`. */
const TRACKER_GLOBAL = /(?<![\w$.])(?:window\s*\.\s*)?InitiativeTracker\s*(?:\?\.|\.|\[)/;
/** `plugins.getPlugin("initiative-tracker")`, `plugins.plugins["initiative-tracker"]`. */
const TRACKER_PLUGIN = /\bplugins\s*(?:\.\s*getPlugin\s*\(|(?:\.\s*plugins\s*)?\[)\s*(["'`])initiative-tracker\1/;

const INTEGRATIONS: readonly Integration[] = [
  {
    calls: (code, command) => TRACKER_GLOBAL.test(code) || TRACKER_PLUGIN.test(code) || command.startsWith(`${INITIATIVE_TRACKER_ID}:`),
    sentence: t('statblockEditor.fs.initiativeButtons'),
  },
];

function text(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = own(record, key);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The report's sentence for a button that reaches a plugin Atlas stands in
 * for, or null for any other block (it is then kept as FS wrote it).
 */
export function replacedIntegration(record: Readonly<Record<string, unknown>>): string | null {
  if (own(record, 'type') !== 'action') return null;
  const code = text(record, 'callback');
  const command = text(record, 'action');
  if (!code && !command) return null;
  return INTEGRATIONS.find((integration) => integration.calls(code, command))?.sentence ?? null;
}
