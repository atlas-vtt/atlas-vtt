import { describe, it, expect } from 'vitest';
import {
  tvPhysicalSizeCm,
  calibratedViewportSize,
  physicalCmPerSquare,
} from '../../src/app/utils/viewportPhysicalScale';
import type { TVCalibrationSettings } from '../../src/app/types/viewportTypes';

const TV_55_4K: TVCalibrationSettings = {
  diagonalInches: 55,
  resolutionWidth: 3840,
  resolutionHeight: 2160,
  targetSquareCm: 2.5,
  squareUnit: 'cm',
};

describe('tvPhysicalSizeCm', () => {
  it('derives physical width/height from diagonal and 16:9 aspect ratio', () => {
    // A real 55" 16:9 TV is ~121.9cm x 68.6cm (spec-sheet cross-check).
    const { widthCm, heightCm } = tvPhysicalSizeCm(TV_55_4K);
    expect(widthCm).toBeCloseTo(121.9, 0);
    expect(heightCm).toBeCloseTo(68.6, 0);
  });

  it('scales linearly with diagonal for the same aspect ratio', () => {
    const small = tvPhysicalSizeCm({ ...TV_55_4K, diagonalInches: 27.5 });
    const big = tvPhysicalSizeCm(TV_55_4K);
    expect(big.widthCm).toBeCloseTo(small.widthCm * 2, 3);
    expect(big.heightCm).toBeCloseTo(small.heightCm * 2, 3);
  });
});

describe('calibratedViewportSize', () => {
  it('sizes the rect so its squares equal the calibrated real-world size', () => {
    const gridSize = 70;
    const { width, height } = calibratedViewportSize(TV_55_4K, gridSize);
    const { widthCm } = tvPhysicalSizeCm(TV_55_4K);
    const squaresAcross = widthCm / TV_55_4K.targetSquareCm;
    expect(width).toBeCloseTo(squaresAcross * gridSize, 5);
    // Aspect ratio of the rect matches the TV's aspect ratio.
    expect(width / height).toBeCloseTo(TV_55_4K.resolutionWidth / TV_55_4K.resolutionHeight, 5);
  });
});

describe('physicalCmPerSquare', () => {
  it('matches the calibrated target when the rect is at its calibrated size', () => {
    const gridSize = 70;
    const { width } = calibratedViewportSize(TV_55_4K, gridSize);
    expect(physicalCmPerSquare(TV_55_4K, gridSize, width)).toBeCloseTo(TV_55_4K.targetSquareCm, 5);
  });

  it('reports a larger physical square when the rect is shrunk (zoomed in)', () => {
    const gridSize = 70;
    const { width } = calibratedViewportSize(TV_55_4K, gridSize);
    const zoomedIn = physicalCmPerSquare(TV_55_4K, gridSize, width / 2);
    expect(zoomedIn).toBeCloseTo(TV_55_4K.targetSquareCm * 2, 5);
  });
});
