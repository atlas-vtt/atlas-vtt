import React from 'react';
import { safely } from '../../../extensions/SlotRegistry';
import { paletteSlot } from '../../../extensions/slots';
import { useSlot } from '../../../extensions/useSlot';
import { viewContextOf } from '../../../extensions/viewContext';
import { ObsidianIcon } from '../ObsidianIcon';
import type { PaletteCommand } from '../../../../api/types/ui';
import type { CommandOption } from './types';

export interface ExtensionCommands {
  /** The registered sections, in the order they were added; their options come after Atlas's own. */
  sections: Array<{ id: string; title: string }>;
  options: CommandOption[];
}

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** A command as Atlas keeps it: each field read once, the keywords a frozen copy. */
interface ReadCommand {
  id: string;
  icon: unknown;
  label: string;
  keywords: readonly string[];
  run: () => void;
}

/** One entry read once into a plain command; null when it is no command. */
function readCommand(entry: unknown): ReadCommand | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const { id, icon, label, keywords, run } = entry as Record<keyof PaletteCommand, unknown>;
  if (!isText(id) || !isText(label) || typeof run !== 'function') return null;
  if (keywords !== undefined && !(Array.isArray(keywords) && keywords.every((word) => typeof word === 'string'))) return null;
  return { id, icon, label, keywords: Object.freeze([...(keywords ?? [])]), run: () => { (run as () => void).call(entry); } };
}

/** What `commands()` returned, less the entries that are not commands (logged); throws when it is no list. */
function validCommands(owner: string, returned: unknown): ReadCommand[] {
  const commands: ReadCommand[] = [];
  for (const entry of [...(returned as Iterable<unknown>)]) {
    const command = readCommand(entry);
    if (command) commands.push(command);
    else console.error(`[Atlas API] ${owner}: a palette command is malformed and was skipped:`, entry);
  }
  return commands;
}

/** The commands other plugins added to the palette. Their callbacks run guarded: a section that throws shows nothing. */
export function useExtensionCommands(
  viewId: string | undefined,
  store: { getState(): { isPlayerView?: boolean } },
  onClose: () => void,
): ExtensionCommands {
  const entries = useSlot(paletteSlot);
  const result: ExtensionCommands = { sections: [], options: [] };
  if (!viewId) return result;
  const ctx = viewContextOf({ viewId }, store);
  for (const { owner, item: section } of entries) {
    const sectionId = `ext:${owner}:${section.id}`;
    const commands = safely(owner, `palette section "${section.id}"`, () => validCommands(owner, section.commands(ctx)), []);
    if (commands.length === 0) continue;
    result.sections.push({ id: sectionId, title: section.title });
    for (const command of commands) {
      result.options.push({
        id: `${sectionId}:${command.id}`,
        icon: isText(command.icon) ? <ObsidianIcon name={command.icon} /> : null,
        label: command.label,
        keywords: [...command.keywords],
        section: sectionId,
        action: () => {
          safely(owner, `palette command "${command.id}"`, () => { command.run(); }, undefined);
          onClose();
        },
      });
    }
  }
  return result;
}
