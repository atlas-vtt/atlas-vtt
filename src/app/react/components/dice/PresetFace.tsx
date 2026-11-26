import React from 'react';
import { DieFace } from './DieFace';
import { presetFaceParts } from './presetFace';

/**
 * A saved roll on its place in the row: the body of its first die, how many it throws at the top left, what it
 * does to them at the bottom left and what it adds at the bottom right. Two dice and nothing else are the pair of
 * bodies, as the d100's tens and units are. The top right is the tray's count. A roll without dice is its formula.
 */
export function PresetFace({ formula }: { formula: string }): React.ReactElement {
  const parts = presetFaceParts(formula);
  if (!parts || parts.sides === null) {
    return <span className="atlas-die-face atlas-die-face--named" aria-hidden="true">{formula.replace(/\[[^\]]*\]/g, '')}</span>;
  }
  const { sides, count, rule, rest } = parts;
  const pair = count === 2 && rule === '' && rest === '';
  return (
    <span className="atlas-preset-face" aria-hidden="true">
      <DieFace sides={sides} pair={pair} />
      {count > 1 && !pair && <span className="atlas-preset-face__mark atlas-preset-face__mark--count">{`${count}×`}</span>}
      {rule !== '' && <span className="atlas-preset-face__mark atlas-preset-face__mark--rule">{rule}</span>}
      {rest !== '' && <span className="atlas-preset-face__mark atlas-preset-face__mark--rest">{rest}</span>}
    </span>
  );
}
