import { animate } from 'framer-motion';
import { grownAt, type RevealPlan, type RevealSeed } from './revealPlan';

/** The blots are drawn at this share of the bitmap's pixels: they are soft, and a smaller canvas blurs for little. */
const MASK_SCALE = 0.25;
/** The haze the map rises from: the map itself, this many times smaller, drawn large. */
const HAZE_SCALE = 1 / 24;
const HAZE_ALPHA = 0.16;
/** The warm light at the front of every growing blot, fading as the map settles like the grid scan's ember. */
const GLOW = 'rgb(255 208 140)';
const GLOW_ALPHA = 0.4;
/** Edge wobble: three waves around the blot, their share of its radius, gone once it has grown. */
const WOBBLE: readonly [number, number][] = [[3, 0.14], [5, 0.085], [9, 0.045]];
const EDGE_POINTS = 56;

function smoothstep(from: number, to: number, t: number): number {
  const x = Math.min(1, Math.max(0, (t - from) / (to - from)));
  return x * x * (3 - 2 * x);
}

/** A canvas of its own, never placed in a document. */
function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = createEl('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** A blot's outline: a circle whose edge breathes and turns a little as it grows, round again once grown. */
function blot(ctx: CanvasRenderingContext2D, seed: RevealSeed, grown: number, t: number, scale: number): void {
  if (grown <= 0) return;
  const radius = seed.radius * grown * scale;
  const calm = 1 - grown * grown;
  ctx.beginPath();
  for (let i = 0; i <= EDGE_POINTS; i++) {
    const angle = (i / EDGE_POINTS) * Math.PI * 2;
    const wobble = WOBBLE.reduce((sum, [waves, share], k) => sum + share * Math.sin(waves * angle + seed.phase[k]! + t * (k + 1) * 2.4), 0);
    const r = radius * (1 + wobble * (0.35 + 0.65 * calm));
    const x = seed.x * scale + Math.cos(angle) * r;
    const y = seed.y * scale + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Plays a new dungeon onto `canvas` as if it were drawn out of nothing: a faint haze of the map
 * rises, its rooms bloom one after the other in the order the generator grew them, each front lit
 * by a warm glow, and a last wave from the entrance brings in rock and paper while the glow dies
 * away. Ends with the bitmap exactly as drawn. Returns what stops it there and then.
 */
export function playReveal(canvas: HTMLCanvasElement, bitmap: ImageBitmap, plan: RevealPlan, onDone: () => void): () => void {
  const ctx = canvas.getContext('2d');
  const { width, height } = bitmap;
  canvas.width = width;
  canvas.height = height;
  const finish = (): void => {
    if (!ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.globalAlpha = 1;
    ctx.drawImage(bitmap, 0, 0);
    ctx.restore();
  };
  const endAtOnce = (): (() => void) => {
    finish();
    onDone();
    return () => undefined;
  };
  if (!ctx) return endAtOnce();

  const haze = canvasOf(width * HAZE_SCALE, height * HAZE_SCALE);
  haze.getContext('2d')?.drawImage(bitmap, 0, 0, haze.width, haze.height);
  const mask = canvasOf(width * MASK_SCALE, height * MASK_SCALE);
  const maskCtx = mask.getContext('2d');
  const glow = canvasOf(mask.width, mask.height);
  const glowCtx = glow.getContext('2d');
  const layer = canvasOf(width, height);
  const layerCtx = layer.getContext('2d');
  if (!maskCtx || !glowCtx || !layerCtx) return endAtOnce();
  const feather = Math.max(1, plan.feather * MASK_SCALE);

  const frame = (t: number): void => {
    // Where the map has come into being, soft-edged
    maskCtx.clearRect(0, 0, mask.width, mask.height);
    maskCtx.filter = `blur(${feather}px)`;
    maskCtx.fillStyle = '#fff';
    for (const seed of plan.seeds) blot(maskCtx, seed, grownAt(seed, t), t, MASK_SCALE);
    blot(maskCtx, plan.wave, grownAt(plan.wave, t, true), t, MASK_SCALE);
    maskCtx.filter = 'none';

    // A wider, warm aura around it
    glowCtx.globalCompositeOperation = 'copy';
    glowCtx.filter = `blur(${feather * 3}px)`;
    glowCtx.drawImage(mask, 0, 0);
    glowCtx.filter = 'none';
    glowCtx.globalCompositeOperation = 'source-in';
    glowCtx.fillStyle = GLOW;
    glowCtx.fillRect(0, 0, glow.width, glow.height);

    // The sharp map inside it
    layerCtx.globalCompositeOperation = 'copy';
    layerCtx.drawImage(mask, 0, 0, width, height);
    layerCtx.globalCompositeOperation = 'source-in';
    layerCtx.drawImage(bitmap, 0, 0);

    ctx.globalCompositeOperation = 'copy';
    ctx.globalAlpha = HAZE_ALPHA * smoothstep(0.05, 0.45, t);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(haze, 0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = GLOW_ALPHA * smoothstep(0, 0.15, t) * (1 - smoothstep(0.55, 1, t)) ** 2;
    ctx.drawImage(glow, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(layer, 0, 0);
  };

  frame(0);
  let done = false;
  const controls = animate(0, 1, {
    duration: plan.durationMs / 1000,
    ease: 'linear',
    onUpdate: frame,
    onComplete: () => {
      done = true;
      finish();
      onDone();
    },
  });
  return () => {
    if (done) return;
    done = true;
    controls.stop();
    finish();
  };
}
