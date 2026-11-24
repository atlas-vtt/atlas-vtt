import { TURN_KEY_ATTRIBUTE } from '../initiative/motion/turnMotion';
import { turnColor } from '../initiative/turnColor';
import { nameShownToPlayers } from '../pixi/token-renderer/nameplateVisibility';
import { woundShare } from '../initiative/woundShare';
import { formatList, t } from '../i18n';
import { cardShowsConditions, SHOWN_CARD_CONDITIONS } from '../initiative/combatantConditions';
import { createConditionBadge } from '../packages/components/shared/conditionBadgeElement';
import type { ActiveCondition } from '../utils/activeConditions';
import type { Combatant, PlayerCardIcon, PlayerInitiativeEntry, PlayerInitiativeLook } from './playerInitiativeList';

/** What tells a combatant's card apart in the players' list (`TURN_KEY_ATTRIBUTE`): its token, else its name. */
export function playerCardKey(entry: Pick<PlayerInitiativeEntry, 'tokenId' | 'name'>): string {
  return entry.tokenId ?? `name:${entry.name}`;
}

/**
 * One combatant of the players' list, drawn as the GM's tracker draws a tile (`InitiativeCard`, `initiative-panel.scss`)
 * without what is the GM's: a card filled with its token's art, red rising in it as it loses hit points (where players
 * see them), and the number its badge shows players. Its initiative (number or card dealt) stays on the GM's screen:
 * players read the order from the list itself. A card without art shows its name where the players may read it, else
 * the GM's stand-in. A token whose art brings its own frame (no ring on the map) is cropped closer, so the frame falls
 * outside the card. Its conditions fan down its left edge where no token on the map shows them (`cardShowsConditions`).
 * `combatActive` marks the combatant whose turn it is.
 */
export function renderPlayerCard(parent: HTMLElement, { entry, token }: Combatant, look: PlayerInitiativeLook, combatActive: boolean): void {
  // Marked by its combatant, so it glides to its new place as the turn passes (`turnMotion.ts`)
  const card = parent.createDiv({ cls: 'atlas-initiative-card atlas-initiative-card--tile', attr: { role: 'listitem', [TURN_KEY_ATTRIBUTE]: playerCardKey(entry) } });
  if (combatActive && entry.isActive) {
    card.addClass('atlas-initiative-card--active');
    card.setAttribute('aria-current', 'true');
  }
  if (entry.sitsOut) card.addClass('atlas-initiative-card--sitting-out');
  if (entry.delayed) card.addClass('atlas-initiative-card--delayed');
  // The players' own side is framed, so the sides read at a glance across the table
  if (token.side === 'players') card.addClass('atlas-initiative-card--ally');
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
  // The art says who it is; a card without art (an enemy added by name, a player without a picture) has nothing but
  // its name to tell it apart, where the GM shows it, else the GM's stand-in. Resources show on the tokens
  const shownName = art ? null : name ?? (entry.tokenId === undefined ? entry.name : null);
  if (!art && shownName === null) drawIcon(card.createDiv({ cls: 'atlas-initiative-card__avatar' }), entry.isNPC ? 'bot' : 'user', look);
  if (token.defeated) renderDefeated(card, look);
  const badge = entry.tokenId === undefined ? null : look.badgeNumber?.(entry.tokenId) ?? null;
  if (badge !== null) card.createSpan({ cls: 'atlas-initiative-card__marks' }).createSpan({ cls: 'atlas-initiative-card__instance-badge', text: String(badge) });
  if (shownName !== null) card.createSpan({ cls: 'atlas-initiative-card__name', text: shownName });
  const onMap = entry.tokenId !== undefined && token.offMap !== true;
  if (token.conditions?.length && cardShowsConditions(onMap, look.trueScale === true)) renderConditions(card, token.conditions);
}

/** A badge's diameter, as the GM's cards draw them, grown with the list. */
const CONDITION_SIZE = 'calc(18px * var(--atlas-initiative-scale, 1))';

/** The GM card's `CardConditions`: the badges fanned down the card's left edge, each named for assistive tech, the rest a count. */
function renderConditions(card: HTMLElement, conditions: readonly ActiveCondition[]): void {
  card.addClass('atlas-initiative-card--conditions');
  const list = card.createDiv({ cls: 'atlas-initiative-card__conditions', attr: { role: 'list', 'aria-label': t('initiative.conditions') } });
  for (const condition of conditions.slice(0, SHOWN_CARD_CONDITIONS)) {
    createConditionBadge(list.createSpan({ cls: 'atlas-initiative-card__condition', attr: { role: 'listitem', 'aria-label': condition.name } }), condition, CONDITION_SIZE);
  }
  const rest = conditions.slice(SHOWN_CARD_CONDITIONS);
  if (rest.length > 0) list.createSpan({ cls: 'atlas-initiative-card__condition-more', text: `+${rest.length}`, attr: { role: 'listitem', 'aria-label': formatList(rest.map(({ name }) => name)) } });
}

/** The token's art filling the card and the red of the life it lost rising in it. */
function renderArt(card: HTMLElement, src: string, alt: string, ringed: boolean, wound: number | null): HTMLElement {
  const art = card.createDiv({ cls: 'atlas-initiative-card__art' });
  if (!ringed) art.addClass('atlas-initiative-card__art--framed');
  art.createEl('img', { attr: { src, alt, draggable: 'false', decoding: 'async' } });
  if (wound !== null) art.createDiv({ cls: 'atlas-initiative-wound', attr: { 'aria-hidden': 'true' } }).style.setProperty('--atlas-wound', String(wound));
  return art;
}

/** The GM card's skull over a defeated combatant; the card is dimmed with it. */
function renderDefeated(card: HTMLElement, look: PlayerInitiativeLook): void {
  card.addClass('atlas-initiative-card--defeated');
  drawIcon(card.createDiv({ cls: 'atlas-initiative-card__defeated-overlay', attr: { role: 'img', 'aria-label': t('playerInit.defeated') } }), 'skull', look);
}

/** One of the card's icons, drawn by whoever draws the list (`PlayerInitiativeLook.icon`); its place stays where none is drawn. */
function drawIcon(parent: HTMLElement, name: PlayerCardIcon, look: PlayerInitiativeLook): void {
  look.icon?.(parent, name);
}
