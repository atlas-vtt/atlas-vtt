import React from 'react';

/** Ring radii in the -100…100 view box. */
const RINGS: readonly { r: number; width: number }[] = [
  { r: 14.4, width: 1.1 },
  { r: 18.4, width: 0.8 },
  { r: 73.6, width: 1.1 },
  { r: 89.6, width: 0.8 },
  { r: 118, width: 1.1 },
];
const RAYS = 24;

/**
 * Rings and rays like the title page of an almanac, centred on the spot where
 * the dice come to rest. They stand still, and the outer rings run past the
 * panel's edge instead of ending inside it; a mask fades them towards the rim.
 * A panel shrunk to a row leaves them out: on a strip that low they read as scribble.
 */
export function DiceRollEngraving(): React.ReactElement {
  return (
    <svg className="atlas-dice-roll__engraving" aria-hidden="true" viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid slice">
      <g fill="none" stroke="currentColor">
        {RINGS.map(({ r, width }) => <circle key={r} r={r} strokeWidth={width} />)}
        {Array.from({ length: RAYS }, (_, i) => {
          const angle = (i * Math.PI) / 12;
          const reach = i % 2 === 0 ? 148 : 86.4;
          return (
            <line
              key={i}
              x1={Math.cos(angle) * 21.6}
              y1={Math.sin(angle) * 21.6}
              x2={Math.cos(angle) * reach}
              y2={Math.sin(angle) * reach}
              strokeWidth="0.8"
            />
          );
        })}
      </g>
    </svg>
  );
}
