/**
 * What grid auto-detection fits: grid types with rough sizes and aspects, proposed by the spectra of
 * several views of the map. The spectrum never decides anything; `detectGrid` fits every proposal to
 * the map's lines.
 */

import type { GridType } from '../../grid/GridSystem';
import { powerSpectrum2D } from './fft';
import { downsampleGray, lineContrast, localContrast, toWindowedSquare } from './grayImage';
import type { GrayImage } from './grayImage';
import { spectralHypotheses, stretchedHypotheses } from './spectralHypotheses';
import type { SpectralHypothesis } from './spectralHypotheses';

const SPECTRUM_SIZE = 512;
/** Plausible line spacing in spectrum pixels. */
export const MIN_PERIOD = 4;
const MAX_PERIOD = SPECTRUM_SIZE / 4;
const HARMONIC_DEPTH = 2;
/** Flank distance of the line evidence the second round of proposals reads; lines up to twice as thick show. */
const LINE_FLANK = 3;
/** Proposals fitted in the second round, which every map without a clear regular grid pays for. */
const SECOND_ROUND_PROPOSALS = 12;
/** The second round looks for its grids on an image of at most this side; what it finds is fitted on the image itself. */
const SECOND_ROUND_SIDE = 2048;

export interface Proposal {
  gridType: GridType;
  size: number;
  /** Aspect of the map's cells the proposal assumes; 1 for a regular grid. */
  aspect: number;
  /** How many more times a supported fit of this proposal may queue its half and double. */
  harmonicsLeft: number;
}

/** Strongest spectral hypotheses first; every supported fit queues its half and its double. */
function asProposals(hypotheses: SpectralHypothesis[], factor: number): Proposal[] {
  return [...hypotheses]
    .sort((a, b) => b.score - a.score)
    .map((h) => ({ gridType: h.gridType, size: h.cellSize * factor, aspect: h.aspect, harmonicsLeft: HARMONIC_DEPTH }));
}

export function spectrumFactor(image: GrayImage): number {
  return Math.max(1, Math.ceil(Math.max(image.width, image.height) / SPECTRUM_SIZE));
}

export interface Spectra {
  /**
   * Thin lines only survive when their contrast is taken before the image is reduced, lines of a few
   * pixels only show up as lines afterwards: both views propose, the lattice fit decides.
   */
  contrast: Float32Array[];
  /** Made when the second round asks for it: of line evidence that ignores edges, so the blocks of a JPEG and painted areas propose nothing. */
  lines?: Float32Array;
  /** The image the second round searches, made when it first does: `image` reduced `factor` times. */
  reduced?: { image: GrayImage; factor: number };
}

/** The spectra of an image are the same for every grid looked for in it (a manual alignment asks several times). */
const knownSpectra = new WeakMap<GrayImage, Spectra>();

function spectrumOf(view: GrayImage): Float32Array {
  return powerSpectrum2D(toWindowedSquare(view, SPECTRUM_SIZE), SPECTRUM_SIZE);
}

export function spectraOf(image: GrayImage): Spectra {
  let spectra = knownSpectra.get(image);
  if (!spectra) {
    const factor = spectrumFactor(image);
    spectra = { contrast: [downsampleGray(localContrast(image, 1), factor), localContrast(downsampleGray(image, factor), 1)].map(spectrumOf) };
    knownSpectra.set(image, spectra);
  }
  return spectra;
}

/** The proposals of the first round: regular grids, from the two contrast views. */
export function firstRoundProposals(spectra: Spectra, factor: number): Proposal[] {
  return asProposals(spectra.contrast.flatMap((s) => spectralHypotheses(s, SPECTRUM_SIZE, MIN_PERIOD, MAX_PERIOD)), factor);
}

/**
 * What is worth fitting on a map the regular proposals did not settle: grids of other aspects from
 * every view, and regular grids its lines alone suggest. Scores of different grid types and views do
 * not compare (squares always score above hexes), so every view's best of each type comes before
 * anyone's second best, and no more than `SECOND_ROUND_PROPOSALS` in all, since every map without a
 * grid is fitted for each of them.
 */
export function secondRoundProposals(image: GrayImage, spectra: Spectra, factor: number): Proposal[] {
  spectra.lines ??= spectrumOf(downsampleGray(lineContrast(image, LINE_FLANK), factor));
  const lists = [
    stretchedHypotheses(spectra.lines, SPECTRUM_SIZE, MIN_PERIOD, MAX_PERIOD),
    spectralHypotheses(spectra.lines, SPECTRUM_SIZE, MIN_PERIOD, MAX_PERIOD),
    ...spectra.contrast.map((spectrum) => stretchedHypotheses(spectrum, SPECTRUM_SIZE, MIN_PERIOD, MAX_PERIOD)),
  ].flatMap((hypotheses) => {
    const proposals = asProposals(hypotheses, factor);
    return [...new Set(proposals.map((p) => p.gridType))].map((gridType) => proposals.filter((p) => p.gridType === gridType));
  });

  const ranked: Proposal[] = [];
  for (let rank = 0; lists.some((list) => rank < list.length); rank++) {
    for (const list of lists) if (rank < list.length) ranked.push(list[rank]!);
  }
  return ranked.slice(0, SECOND_ROUND_PROPOSALS);
}

/** The image the second round searches: `image` reduced until no side is longer than `SECOND_ROUND_SIDE`. */
export function reducedForSecondRound(image: GrayImage, spectra: Spectra): { image: GrayImage; factor: number } {
  if (spectra.reduced) return spectra.reduced;
  const factor = Math.ceil(Math.max(image.width, image.height) / SECOND_ROUND_SIDE);
  spectra.reduced = { image: downsampleGray(image, factor), factor };
  return spectra.reduced;
}
