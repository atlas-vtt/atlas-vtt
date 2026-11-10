import React from 'react';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { PartyFace } from './useCampaignParties';

/** The widest a fan of ringed faces opens, from its first face to its last, and the most one face turns from the next. */
const FAN_SPREAD_DEG = 24;
const FAN_STEP_DEG = 8;

interface PartyFacesProps {
  faces: readonly PartyFace[];
  size: 'row' | 'page';
}

function Face({ face, turn }: { face: PartyFace; turn?: number | undefined }): React.JSX.Element {
  const style = turn === undefined ? undefined : ({ '--campaign-face-turn': `${turn}deg` } as React.CSSProperties);
  return (
    <LabelTooltip label={face.name}>
      <span className="campaign-face" role="img" style={style}>
        <TokenPortrait src={face.src} alt="" showRing={face.showRing} ringColor={face.ringColor} />
      </span>
    </LabelTooltip>
  );
}

/** How far each of `count` stacked faces turns, evenly about the middle one. */
export function fanTurns(count: number): number[] {
  if (count < 2) return Array.from({ length: count }, () => 0);
  const step = Math.min(FAN_STEP_DEG, FAN_SPREAD_DEG / (count - 1));
  return Array.from({ length: count }, (_, index) => Number(((index - (count - 1) / 2) * step).toFixed(2)));
}

/**
 * The party's faces: ringed tokens overlap as a fan, as stacked tokens lie on a map, and tokens
 * without a ring stand side by side. Each names its character and shows the name on hover.
 */
export function PartyFaces({ faces, size }: PartyFacesProps): React.JSX.Element | null {
  if (faces.length === 0) return null;
  const ringed = faces.filter((face) => face.showRing);
  const plain = faces.filter((face) => !face.showRing);
  const turns = fanTurns(ringed.length);
  return (
    <span className={`campaign-party campaign-party--${size}`}>
      {ringed.length > 0 && (
        <span className="campaign-party__fan">
          {ringed.map((face, index) => <Face key={face.id} face={face} turn={turns[index]} />)}
        </span>
      )}
      {plain.length > 0 && (
        <span className="campaign-party__row">
          {plain.map((face) => <Face key={face.id} face={face} />)}
        </span>
      )}
    </span>
  );
}
