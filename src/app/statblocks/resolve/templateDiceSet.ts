import type { App } from 'obsidian';
import { findDiceSet } from '../../gameSystems/diceSetResolution';
import { diceSetsOf } from '../../services/diceSets/collectionDiceSets';
import type { DiceSet } from '../../types/diceSetTypes';
import { cachedTemplateId } from '../notes/statblockSource';
import { libraryTemplates } from './readStatblock';

/**
 * The dice set the template of a statblock note names, which its bare bonuses
 * roll with; undefined where the note has no Atlas template (Fantasy Statblocks'
 * notes), its template names none, or the library lacks the set: the
 * collection's dice roll then.
 */
export function templateDiceSet(app: App, notePath: string | undefined): DiceSet | undefined {
  const file = notePath ? app.vault.getFileByPath(notePath) : null;
  const templateId = file ? cachedTemplateId(app, file) : null;
  if (!templateId) return undefined;
  return findDiceSet(diceSetsOf(app), libraryTemplates(app).get(templateId)?.template.diceSetId);
}
