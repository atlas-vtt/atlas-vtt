/**
 * Where the round buttons of a fan sit: on an arc around the thing they act
 * on, each with its tooltip on the arc's outer side, so a tooltip never covers
 * the buttons beside it.
 */

export type FanSide = 'top' | 'right' | 'bottom' | 'left';

/** A button's place relative to the point the fan grows from, in px. */
export interface FanSpot {
  x: number;
  y: number;
  /** Where its tooltip opens. */
  side: FanSide;
}

export interface FanArc {
  /** Distance of the buttons' centres from the fan's origin. */
  radius: number;
  /** Their distance up and down, where it differs (an ellipse around something wide). */
  radiusY?: number;
  /** Direction of the arc's middle, in degrees: 0 points right, -90 up (screen coordinates). */
  centreDeg: number;
  /** Angle between two neighbouring buttons. */
  spreadDeg: number;
}

/** The side a direction points to, by its larger component. */
function sideOf(x: number, y: number): FanSide {
  if (Math.abs(x) > Math.abs(y) * 1.5) return x > 0 ? 'right' : 'left';
  return y < 0 ? 'top' : 'bottom';
}

/** The spots of `count` buttons spread evenly along `arc`, in order of increasing angle. */
export function fanSpots(count: number, { radius, radiusY = radius, centreDeg, spreadDeg }: FanArc): FanSpot[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = ((centreDeg + (index - (count - 1) / 2) * spreadDeg) * Math.PI) / 180;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radiusY;
    // A component this close to 0 is 0: a button straight above has no side to lean to.
    return { x, y, side: sideOf(Math.abs(x) < 1e-9 ? 0 : x, y) };
  });
}
