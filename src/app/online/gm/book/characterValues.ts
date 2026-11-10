import type { App } from 'obsidian';
import { CampaignPlay } from '../../../campaigns/campaignPlay';
import { PartySync } from '../../../campaigns/partyValues/PartySync';
import { withCurrent } from '../../../resources/resourceValues';
import { withMaxValue, type ResourceEdit } from './resourceEdit.ts';

/** An edit of the values the played campaign keeps of a character. */
export type CharacterResourceEdit = Extract<ResourceEdit, { readonly kind: 'character' }>;

/**
 * Writes a player's edit into the values the campaign this device plays keeps of their character
 * (`PartySync`), for a character whose token the shared scene does not hold: every open scene that
 * holds it shows the value, and no undo step is made. Returns the current value the campaign keeps
 * then, clamped to the value's range, or null when it is refused: no campaign is played, the
 * campaign cannot be changed, the token was placed from no player character, or the campaign keeps
 * no such value of it (a tracked number, or a gauge its template places, starts where its sheet offered it).
 * A maximum the player set is the campaign's by hand (`maxByHand`), unless it is the note's
 * (`MaxRoute`), which the campaign's value then only follows.
 */
export function writeCharacterValue(app: App, edit: CharacterResourceEdit): { readonly current: number; readonly max: number } | null {
  const sync = PartySync.forApp(app);
  const campaignId = sync === undefined ? null : CampaignPlay.forApp(app).playing();
  if (sync === undefined || campaignId === null) return null;
  const characterId = sync.characterOf(edit.placed);
  const value = characterId === null ? undefined : sync.value(campaignId, characterId, edit.key) ?? edit.tracked;
  if (characterId === null || value === undefined) return null;
  const { max } = edit;
  const next = max === undefined ? withCurrent(value, edit.current) : withMaxValue(value, edit.current, max.value, max.fixed);
  const wasByHand = 'maxByHand' in value && value.maxByHand === true;
  const byHand = wasByHand || max?.route.kind === 'hand';
  if (next.current === value.current && next.max === value.max && byHand === wasByHand) return next;
  return sync.setValue(campaignId, characterId, edit.key, { ...next, ...(byHand && { maxByHand: true as const }) }) ? next : null;
}
