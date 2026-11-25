import React, { useId, useMemo } from 'react';
import { IVY_LEAF_CENTRE, IVY_LEAF_DETAILS, IVY_LEAF_OUTLINE, IVY_LEAF_STROKE, IVY_LEAF_TRANSFORM } from './ivyLeaf';
import { ivyPalette } from './ivyPaint';

/** Half the swatch's side in the drawing's coordinates: the leaf, turned, and room for the chosen one's outline. */
const HALF = 180;
/** How far the chosen leaf's outline of the page's ink reaches past its own, in the drawing's coordinates. */
const CHOSEN_RIM = 20;
const RAINBOW = ['#c0392b', '#d9822b', '#c9a227', '#6b8f3a', '#2a9d8f', '#3b82c4', '#8b5cf6', '#d46a8a'];

interface IvyLeafProps {
  /** `#rrggbb` to paint it in, `''` for its own greens, or `any` for the custom swatch before a colour is picked. */
  colour: string;
  chosen: boolean;
}

/** A leaf of the Medieval look's ivy, upright and painted as the ivy will be in `colour`: the ivy colour's swatch. */
export function IvyLeaf({ colour, chosen }: IvyLeafProps): React.JSX.Element {
  const rainbowId = useId();
  const palette = useMemo(() => (colour === '' || colour === 'any' ? null : ivyPalette(colour)), [colour]);
  const paint = (green: string): string => palette?.get(green) ?? green;
  const { x, y } = IVY_LEAF_CENTRE;
  return (
    <svg viewBox={`${x - HALF} ${y - HALF} ${2 * HALF} ${2 * HALF}`} aria-hidden="true" focusable="false">
      {colour === 'any' && (
        <defs>
          <linearGradient id={rainbowId} x1="0" y1="0" x2="1" y2="1">
            {RAINBOW.map((stop, at) => <stop key={stop} offset={at / (RAINBOW.length - 1)} stopColor={stop} />)}
          </linearGradient>
        </defs>
      )}
      <g transform={`rotate(-90 ${x} ${y})`}>
        <g transform={IVY_LEAF_TRANSFORM}>
          {chosen && (
            <path
              className="atlas-ivy-leaf__rim"
              d={IVY_LEAF_OUTLINE}
              strokeWidth={IVY_LEAF_STROKE + 2 * CHOSEN_RIM}
              strokeLinejoin="round"
            />
          )}
          <path
            d={IVY_LEAF_OUTLINE}
            fill={colour === 'any' ? `url(#${rainbowId})` : paint('#789532')}
            stroke={paint('#2a3c08')}
            strokeWidth={IVY_LEAF_STROKE}
            strokeLinejoin="round"
          />
          {IVY_LEAF_DETAILS.map(({ d, green }) => (colour === 'any' && green !== '#2a3c08'
            ? null
            : <path key={green} d={d} fill={paint(green)} />))}
        </g>
      </g>
    </svg>
  );
}
