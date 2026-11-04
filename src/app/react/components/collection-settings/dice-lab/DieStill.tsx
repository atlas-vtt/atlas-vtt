import React, { useState } from 'react';
import { cn } from '../../../../../utils/cn';
import { restingAspect } from '../../../../dice3d/diceScene';
import { Skeleton } from '../../../../packages/components/primitives/Skeleton';
import { notation } from './dieNames';
import type { DieImageState } from './useDieImages';

/** A die the dice renderer has no body for (a d7), or a document without 3D dice: a tile in its colour with its sides on it. */
export function PlainDie({ sides, className }: { sides: number; className?: string | undefined }): React.ReactElement {
  return <span className={cn('atlas-dice-lab__plain-die', className)}>{notation(sides)}</span>;
}

interface DieStillProps {
  sides: number;
  colour?: string | undefined;
  image: DieImageState;
  /** The height it is shown at, in CSS pixels; the width follows the die (a d100's two d10s are wider). */
  height: number;
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
}

/**
 * A die at rest as a small picture, for pickers: its still image in its
 * colour, a breathing placeholder of the same size while it is drawn, or a
 * flat tile where it has no body. Its box never changes size as the image
 * arrives, and an image that arrives after the first paint fades in.
 */
export function DieStill({ sides, colour, image, height, className, style }: DieStillProps): React.ReactElement {
  const [hadImage] = useState(image !== undefined);
  const width = Math.round(height * (image?.aspect ?? restingAspect(sides)));
  const box = { ...style, width, height, '--atlas-die-colour': colour } as React.CSSProperties;
  return (
    <span className={cn('atlas-die-still', className)} style={box} aria-hidden="true">
      {image === undefined && <Skeleton shape="circle" live className="atlas-die-still__skeleton" />}
      {image === null && <PlainDie sides={sides} className="atlas-die-still__plain" />}
      {image && <img src={image.url} alt="" draggable={false} className={cn('atlas-die-still__image', !hadImage && 'atlas-arriving')} />}
    </span>
  );
}
