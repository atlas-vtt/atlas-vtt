import type { PlayerSoundState } from '../../protocol/index.ts';
import { formatList, t } from '../../../i18n';

/** How many players a sentence names before it counts the rest. */
const NAMED = 3;

/** Where a player's sound stands, as far as their page told. */
export type PlayerHearing = 'hears' | 'loading' | 'joining' | 'needs-tap' | 'off';

const ORDER: readonly PlayerHearing[] = ['hears', 'loading', 'joining', 'needs-tap', 'off'];

/** `sounds`: how many sounds the table plays; a page that waits for all of them hears nothing yet. Nothing playing, a page whose sound is on is what hears. */
export function playerHearing(page: PlayerSoundState | undefined, sounds: number): PlayerHearing {
  if (page === undefined || page.state === 'off') return 'off';
  if (page.state !== 'playing') return page.state;
  return sounds > 0 && page.waiting.length >= sounds ? 'loading' : 'hears';
}

function names(players: readonly string[]): string {
  const shown = players.length > NAMED + 1 ? players.slice(0, NAMED) : players;
  const rest = players.length - shown.length;
  return formatList(rest > 0 ? [...shown, t('audio.players.andMore', { count: rest })] : shown);
}

function sentence(hearing: PlayerHearing, players: readonly string[], heard: boolean): string {
  const values = { names: names(players) };
  switch (hearing) {
    case 'hears': return heard ? t('audio.players.hears', values) : t('audio.players.soundOn', values);
    case 'loading': return t('audio.players.loading', values);
    case 'joining': return t('audio.players.joining', values);
    case 'needs-tap': return t('audio.players.needsTap', values);
    case 'off': return t('audio.players.soundOff', values);
  }
}

/**
 * Who hears the table, by name: a sentence for each way a player's sound stands, those who hear first.
 * `heard`: something plays and is not stopped, so a page whose sound is on hears it.
 */
export function audienceDetail(players: readonly { name: string; hearing: PlayerHearing }[], heard: boolean): string {
  if (players.length === 0) return t('audio.players.nobody');
  return ORDER.flatMap((hearing) => {
    const named = players.filter((player) => player.hearing === hearing).map((player) => player.name);
    return named.length > 0 ? [sentence(hearing, named, heard)] : [];
  }).join(' ');
}
