import type { CSSProperties, ReactElement } from 'react';
import { TokenPortrait } from '../../packages/components/shared/TokenPortrait';
import { toneClass } from './AuthorDisc.tsx';
import { monogram } from './logAuthors.ts';
import type { Portrait } from './panelTypes.ts';

export interface SpeakerFaceProps {
  /** The token's name, whose first letter stands in for its art. */
  readonly name: string;
  readonly portrait: Portrait | null;
  /** The author, whose colour the letter's disc takes where the token has no ring colour. */
  readonly who: string;
  readonly ring?: string | null;
  readonly size: 'row' | 'roll' | 'chip';
}

/** A speaking token: its portrait with the map's ring, or, while there is none, its first letter on a disc of its ring's colour. */
export function SpeakerFace({ name, portrait, who, ring, size }: SpeakerFaceProps): ReactElement {
  if (portrait !== null) {
    return <TokenPortrait className={`atlas-online-log__portrait atlas-online-log__portrait--${size}`} src={portrait.src} alt="" showRing={portrait.showRing} ringColor={portrait.ringColor} />;
  }
  const tone = ring === null || ring === undefined ? undefined : ({ '--atlas-online-log-tone': ring } as CSSProperties);
  return <span className={`atlas-online-log__disc atlas-online-log__disc--${size} ${toneClass(who)}`} style={tone} aria-hidden="true">{monogram(name)}</span>;
}
