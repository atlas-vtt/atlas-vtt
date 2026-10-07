export interface ViewportRect {
  id: string;
  kind: 'viewport';
  x: number;      // top-left, world pixels
  y: number;      // top-left, world pixels
  width: number;  // world pixels
  height: number; // world pixels
  locked: boolean; // true = size derived from TV calibration; false = manual uniform-scale resize
  active: boolean; // only one viewport per scene may be active
  name?: string;
}

/** Input for creating a viewport rect (without auto-generated id/kind) */
export type ViewportInput = Omit<ViewportRect, 'id' | 'kind'>;

export interface TVCalibrationSettings {
  diagonalInches: number;
  resolutionWidth: number;
  resolutionHeight: number;
  /** How big a grid square is on the TV, in centimetres whatever unit the menu shows it in. */
  targetSquareCm: number;
  /** The unit the menu shows the square size in. */
  squareUnit: 'in' | 'cm';
}
