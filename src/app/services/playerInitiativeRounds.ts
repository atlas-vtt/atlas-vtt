import type { Combatant } from './playerInitiativeList';
import type { ListSegment } from '../initiative/listSegments';
import { TURN_KEY_ATTRIBUTE } from '../initiative/motion/turnMotion';
import { t } from '../i18n';

/** One round's cards in a row, over the round's name; the row of cards it returns takes them. */
function roundGroup(entries: HTMLElement, round: number): HTMLElement {
  const name = t('playerInit.round', { round });
  const group = entries.createDiv({ cls: 'atlas-player-initiative__round-group' });
  const cards = group.createDiv({ cls: 'atlas-player-initiative__round-cards', attr: { role: 'list', 'aria-label': name } });
  // The name, and a line from it to the round's end: how far the round still runs. It moves on with its cards
  group.createDiv({ cls: 'atlas-player-initiative__round-label', attr: { 'aria-hidden': 'true', [TURN_KEY_ATTRIBUTE]: `round:${round}` } })
    .createSpan({ cls: 'atlas-player-initiative__round-name', text: name });
  return cards;
}

/**
 * A row in turn order during a fight: the cards of this round and of the next each over their round's name, a
 * slim line between them in place of the column's divider, so the names move on with the cards. The line is an
 * element of its own, marked by its round, so it glides with the cards as the turn passes (`turnMotion.ts`). Returns
 * the rows of cards, this round's first; a round nobody is shown in is left out.
 */
export function renderRoundRow(entries: HTMLElement, segments: readonly ListSegment<Combatant>[], round: number, draw: (into: HTMLElement, segment: ListSegment<Combatant>) => void): HTMLElement[] {
  const rows = [roundGroup(entries, round)];
  for (const segment of segments) {
    if (segment.kind === 'round') rows.push(roundGroup(entries, segment.round));
    else draw(rows[rows.length - 1]!, segment);
  }
  const shown = rows.filter((cards) => cards.childElementCount > 0);
  for (const cards of rows) if (cards.childElementCount === 0) cards.parentElement?.remove();
  // The line that closes every round but the last
  shown.slice(0, -1).forEach((cards) => {
    const round = cards.parentElement?.querySelector('.atlas-player-initiative__round-label')?.getAttribute(TURN_KEY_ATTRIBUTE) ?? '';
    cards.createDiv({ cls: 'atlas-player-initiative__round-end', attr: { 'aria-hidden': 'true', role: 'none', [TURN_KEY_ATTRIBUTE]: `${round}:end` } });
  });
  return shown;
}
