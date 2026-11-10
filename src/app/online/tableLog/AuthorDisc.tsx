import { GM_AUTHOR } from '../protocol/index.ts';
import { Crown } from 'lucide-react';
import type { ReactElement } from 'react';
import { authorTone, monogram } from './logAuthors.ts';

/** The class that gives an element its author's colour (`--atlas-online-log-tone`). */
export function toneClass(who: string): string {
  return `atlas-online-log__tone--${authorTone(who)}`;
}

/**
 * An author's disc: the first letter of the name on a tint of the author's colour. The GM's wears a
 * crown instead, which no name can give a player: one who joins as "GM" still looks like a player.
 */
export function AuthorDisc({ who, name, size }: { readonly who: string; readonly name: string; readonly size: 'row' | 'quote' | 'roll' | 'chip' }): ReactElement {
  return <span className={`atlas-online-log__disc atlas-online-log__disc--${size} ${toneClass(who)}`} aria-hidden="true">{who === GM_AUTHOR ? <Crown /> : monogram(name)}</span>;
}
