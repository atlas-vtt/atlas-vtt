import { setIcon } from 'obsidian';
import { TURN_KEY_ATTRIBUTE } from '../initiative/motion/turnMotion';
import { turnColor } from '../initiative/turnColor';
import { nameShownToPlayers } from '../pixi/token-renderer/nameplateVisibility';
import { woundShare } from '../initiative/woundShare';
import { t } from '../i18n';
import type { Combatant, PlayerInitiativeLook } from './playerInitiativeList';

/** What a combatant shows beside its portrait: its number, the card it was dealt, or nothing (by sides). */
export type PlayerCardValue = 'number' | 'card' | 'none';

/**
 * One combatant of the players' list, as Baldur's Gate 3 draws its turn order: a card filled with its token's art, red
 * rising in it as it loses hit points (where players see them), under a shade that carries the number its badge shows
 * players and its initiative (blank while it has none or 0). A card without art shows the name instead. A token whose art brings its own frame (no ring on the map) is cropped
 * closer, so the frame falls outside the card.
 * `combatActive` marks the combatant whose turn it is; `value` is its number, the card it was
 * dealt in a fight by cards (a dash before one is), or none by sides.
 */
export function renderPlayerCard(parent: HTMLElement, { entry, token }: Combatant, look: PlayerInitiativeLook, combatActive: boolean, value: PlayerCardValue = 'number'): void {
  // Marked by its combatant, so it glides to its new place as the turn passes (`turnMotion.ts`)
  const card = parent.createDiv({ cls: 'atlas-player-initiative__card', attr: { role: 'listitem', [TURN_KEY_ATTRIBUTE]: entry.tokenId ?? `name:${entry.name}` } });
  if (combatActive && entry.isActive) {
    card.addClass('atlas-player-initiative__card--active');
    card.setAttribute('aria-current', 'true');
  }
  if (entry.sitsOut) card.addClass('atlas-player-initiative__card--sitting-out');
  if (entry.delayed) card.addClass('atlas-player-initiative__card--delayed');
  // The players' own side is framed, so the sides read at a glance across the table
  if (token.side === 'players') card.addClass('atlas-player-initiative__card--ally');
  // Its turn flashes in its token's ring colour
  const flash = turnColor(token);
  if (flash) card.style.setProperty('--atlas-turn-color', flash);
  const src = entry.imagePath ? look.portraitSrc(entry.imagePath) : null;
  // A combatant the GM's map leaves unnamed shows a placeholder for its name
  const name = nameShownToPlayers(entry.name, token, look.mapShowsNameplates, look.showNames);
  // Players read hit points as the GM's card shows them: red rising in the art (`woundShare`), where they may see them
  const wound = token.hp ? woundShare([{ definition: { direction: 'drains' }, value: token.hp }]) : null;
  const art = src ? renderArt(card, src, name === entry.name ? name : '', token.showRing, wound) : null;
  // Its art alone, where the image has transparent margins (a token cropped zoomed out), as the GM's card shows it
  const img = art?.querySelector('img');
  if (img) look.artViewBox?.(entry.imagePath, (viewBox) => img.style.setProperty('--atlas-art-view-box', viewBox));
  const badge = entry.tokenId === undefined ? null : look.badgeNumber?.(entry.tokenId) ?? null;
  if (badge !== null) card.createSpan({ cls: 'atlas-player-initiative__badge', text: String(badge) });
  if (token.defeated) renderDefeated(card, art !== null);
  // A combatant without a number yet shows none, not a 0 nobody rolled
  if (value === 'number' && entry.initiative !== 0) card.createSpan({ cls: 'atlas-player-initiative__value', text: String(entry.initiative) });
  if (value === 'card') card.createSpan({ cls: 'atlas-player-initiative__value atlas-player-initiative__card-dealt', text: entry.card === undefined ? '–' : String(entry.card) });
  // The art says who it is; a card without art (an enemy added by name, a player without a picture) has nothing but
  // its name to tell it apart, where the GM shows it. Conditions and resources show on the tokens, so the card leaves them out
  if (art) return;
  const shownName = name ?? (entry.tokenId === undefined ? entry.name : null);
  if (shownName !== null) card.createDiv({ cls: 'atlas-player-initiative__foot' }).createSpan({ cls: 'atlas-player-initiative__name', text: shownName });
}

/** The token's art filling the card, the red of the life it lost rising in it, and the shade over it that the number reads on. */
function renderArt(card: HTMLElement, src: string, alt: string, ringed: boolean, wound: number | null): HTMLElement {
  card.addClass('atlas-player-initiative__card--art');
  const art = card.createDiv({ cls: 'atlas-player-initiative__art' });
  if (!ringed) art.addClass('atlas-player-initiative__art--framed');
  art.createEl('img', { attr: { src, alt, draggable: 'false', decoding: 'async' } });
  if (wound !== null) art.createDiv({ cls: 'atlas-initiative-wound', attr: { 'aria-hidden': 'true' } }).style.setProperty('--atlas-wound', String(wound));
  return art;
}

/** The GM card's skull, over a defeated combatant's portrait (in its place without one); the card is dimmed with it. */
function renderDefeated(card: HTMLElement, overPortrait: boolean): void {
  card.addClass('atlas-player-initiative__card--defeated');
  const mark = card.createSpan({ cls: 'atlas-player-initiative__defeated', attr: { role: 'img', 'aria-label': t('playerInit.defeated') } });
  if (overPortrait) mark.addClass('atlas-player-initiative__defeated--over');
  setIcon(mark, 'skull');
}
