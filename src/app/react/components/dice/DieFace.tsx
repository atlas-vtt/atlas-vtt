import React from 'react';
import d4 from '../../../assets/dice-icons/d4.webp?inline';
import d6 from '../../../assets/dice-icons/d6.webp?inline';
import d8 from '../../../assets/dice-icons/d8.webp?inline';
import d10 from '../../../assets/dice-icons/d10.webp?inline';
import d12 from '../../../assets/dice-icons/d12.webp?inline';
import d20 from '../../../assets/dice-icons/d20.webp?inline';
import type { TrayDie } from './diceTrayPool';

/**
 * The bodies are drawn, not set: game-icons.net dice redrawn as pencil
 * sketches. An image rather than a path, because a pencil drawing has graphite
 * tones and cannot be recoloured with `currentColor`; the dark theme inverts it
 * instead (`dice-dropdown.scss`).
 */
const DIE_ART: Partial<Record<number, string>> = { 4: d4, 6: d6, 8: d8, 10: d10, 12: d12, 20: d20 };


/**
 * A die as the hand knows it. There is no d100 body: it is rolled with two d10,
 * tens and units, so the tray shows exactly that, two offset d10s; `pair` shows
 * any other die that way (`2d12`). A die without a body (`d3`) is its name.
 */
export function DieFace({ sides, pair = false }: { sides: TrayDie; pair?: boolean }): React.ReactElement {
  const art = DIE_ART[sides === 100 ? 10 : sides];
  if (!art) return <span className="atlas-die-face atlas-die-face--named" aria-hidden="true">{`d${sides}`}</span>;
  if (sides === 100 || pair) {
    return (
      <span className="atlas-die-face atlas-die-face--percentile" aria-hidden="true">
        <img src={art} alt="" className="atlas-die-face__art atlas-die-face__art--tens" />
        <img src={art} alt="" className="atlas-die-face__art atlas-die-face__art--units" />
      </span>
    );
  }
  return <img src={art} alt="" aria-hidden="true" className="atlas-die-face atlas-die-face__art" />;
}
