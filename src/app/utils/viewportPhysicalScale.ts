import type { TVCalibrationSettings } from '../types/viewportTypes';

/** A one-inch grid square, the usual size of a miniature's base. */
export const CM_PER_INCH = 2.54;

/** The TV's physical width/height in centimetres, derived from its diagonal and aspect ratio. */
export function tvPhysicalSizeCm(calibration: TVCalibrationSettings): { widthCm: number; heightCm: number } {
  const aspectRatio = calibration.resolutionWidth / calibration.resolutionHeight;
  const diagonalCm = calibration.diagonalInches * CM_PER_INCH;
  const heightCm = diagonalCm / Math.sqrt(aspectRatio * aspectRatio + 1);
  const widthCm = heightCm * aspectRatio;
  return { widthCm, heightCm };
}

/**
 * World-pixel size of a viewport rect that renders `calibration.targetSquareCm`
 * grid squares at real physical size on the calibrated TV.
 */
export function calibratedViewportSize(
  calibration: TVCalibrationSettings,
  gridSize: number,
): { width: number; height: number } {
  const { widthCm, heightCm } = tvPhysicalSizeCm(calibration);
  return {
    width: (widthCm / calibration.targetSquareCm) * gridSize,
    height: (heightCm / calibration.targetSquareCm) * gridSize,
  };
}

/** Real-world physical size of one grid square if a rect of `rectWidth` were shown on the calibrated TV. */
export function physicalCmPerSquare(
  calibration: TVCalibrationSettings,
  gridSize: number,
  rectWidth: number,
): number {
  const { widthCm } = tvPhysicalSizeCm(calibration);
  const squaresAcross = rectWidth / gridSize;
  return widthCm / squaresAcross;
}
