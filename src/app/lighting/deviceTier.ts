import type { LightingQualityLevel } from './lightingQuality';

/** What a device tells about its graphics without drawing anything (`readGpuFacts`). */
export interface GpuFacts {
  /** The WebGL renderer string (Chromium names the GPU, e.g. "ANGLE (Intel, Intel(R) UHD Graphics 620 …)"). */
  renderer: string;
  /** The largest texture side the GPU takes. */
  maxTextureSize: number;
  /** Logical processors (`navigator.hardwareConcurrency`), null where unknown. */
  cores: number | null;
  /** Approximate memory in GB (`navigator.deviceMemory`, which Chromium caps at 8), null where unknown. */
  memoryGb: number | null;
}

/** Renderers that draw on the CPU: lighting there is slow at any size. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/**
 * Graphics built into the processor, which share its memory: Intel's (but not its Arc cards),
 * AMD's Radeon Graphics and Vega in APUs (not its RX or Pro cards), and phone and tablet GPUs.
 * Apple's M chips are left out: their graphics run the lighting at high.
 */
const INTEGRATED = [
  /\bintel\b(?!.*\barc\(tm\) [ab]\d)/i,
  /radeon(\(tm\))?( vega \d+| \d{3}m)? graphics/i,
  /\b(mali|adreno|powervr)\b/i,
];

/**
 * The lighting quality a device starts on, from what it tells about itself, as Foundry picks its
 * Performance Mode from the largest texture the GPU takes: a software renderer or one that takes
 * no 8,192 px texture gets `saver`; graphics built into the processor, a GPU that takes no 16,384 px
 * texture, four processor threads or fewer, or 4 GB of memory or less get `balanced`; everything
 * else `high`. It is picked once and stored; the GM's choice in the settings always wins.
 */
export function pickLightingQuality(facts: GpuFacts): LightingQualityLevel {
  if (SOFTWARE.test(facts.renderer) || facts.maxTextureSize < 8192) return 'saver';
  if (INTEGRATED.some((pattern) => pattern.test(facts.renderer)) || facts.maxTextureSize < 16384) return 'balanced';
  if ((facts.cores !== null && facts.cores <= 4) || (facts.memoryGb !== null && facts.memoryGb <= 4)) return 'balanced';
  return 'high';
}
