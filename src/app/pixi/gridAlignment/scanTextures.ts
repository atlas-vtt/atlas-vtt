import { BufferImageSource, Texture } from 'pixi.js';
import { getDomHost } from '../../host/dom';
import type { MapBounds } from '../gridAlignmentMath';
import type { InkMap } from '../spectralEngine/detectionJob';

/** Longest side of the texture the grid's edges on the map's lines are drawn into. */
const HITS_SIDE = 1536;
const HITS_LINE_WIDTH = 2.5;

/** The map's lines as a detection read them: one strength in all four channels of its texel. */
export function inkTexture({ width, height, data }: InkMap): Texture {
  const texels = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i++) texels.fill(data[i]!, i * 4, i * 4 + 4);
  const source = new BufferImageSource({ resource: texels, width, height, format: 'rgba8unorm', alphaMode: 'no-premultiply-alpha' });
  return new Texture({ source });
}

/** The grid's edges on the map's lines, as a picture of the map's rect. */
export function hitsTexture(hits: Float32Array, rect: MapBounds): Texture | null {
  const scale = Math.min(1, HITS_SIDE / Math.max(rect.width, rect.height));
  const width = Math.max(1, Math.round(rect.width * scale));
  const height = Math.max(1, Math.round(rect.height * scale));
  const canvas = getDomHost().createCanvas(undefined, { width, height });
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.strokeStyle = '#fff';
  context.lineWidth = HITS_LINE_WIDTH;
  context.lineCap = 'round';
  context.beginPath();
  for (let i = 0; i < hits.length; i += 4) {
    context.moveTo((hits[i]! - rect.x) * scale, (hits[i + 1]! - rect.y) * scale);
    context.lineTo((hits[i + 2]! - rect.x) * scale, (hits[i + 3]! - rect.y) * scale);
  }
  context.stroke();
  return Texture.from(canvas);
}
