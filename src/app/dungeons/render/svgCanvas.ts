/**
 * A drawing context that writes SVG: the part of Canvas 2D the dungeon renderer uses (paths,
 * arcs, fills and strokes, clipping, the inner shadow's blurred and multiplied fill), recorded in
 * device pixels and written out as SVG elements, so the map saved as SVG is the map drawn on a
 * canvas, line for line.
 */

import { escapeXml, IDENTITY, multiply, num, SvgPathBuilder, type Matrix } from './svgPath';

interface State {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  lineCap: CanvasLineCap;
  lineDash: number[];
  lineDashOffset: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  globalCompositeOperation: GlobalCompositeOperation;
  matrix: Matrix;
  /** The id of the clip path in force, which holds every clip before it. */
  clip: string | null;
}

export class SvgCanvas extends SvgPathBuilder {
  private state: State = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    lineDash: [],
    lineDashOffset: 0,
    shadowColor: 'rgba(0, 0, 0, 0)',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    globalCompositeOperation: 'source-over',
    matrix: IDENTITY,
    clip: null,
  };
  private readonly stack: State[] = [];
  private readonly defs: string[] = [];
  /** Each path with the clip in force when it was drawn. */
  private readonly body: Drawn[] = [];
  private ids = 0;

  constructor(readonly width: number, readonly height: number) {
    super();
  }

  protected get matrix(): Matrix {
    return this.state.matrix;
  }

  // Styles ---------------------------------------------------------------------------------------

  get fillStyle(): string { return this.state.fillStyle; }
  set fillStyle(value: string | CanvasGradient | CanvasPattern) { if (typeof value === 'string') this.state.fillStyle = value; }
  get strokeStyle(): string { return this.state.strokeStyle; }
  set strokeStyle(value: string | CanvasGradient | CanvasPattern) { if (typeof value === 'string') this.state.strokeStyle = value; }
  get lineWidth(): number { return this.state.lineWidth; }
  set lineWidth(value: number) { if (value > 0 && Number.isFinite(value)) this.state.lineWidth = value; }
  get lineJoin(): CanvasLineJoin { return this.state.lineJoin; }
  set lineJoin(value: CanvasLineJoin) { this.state.lineJoin = value; }
  get lineCap(): CanvasLineCap { return this.state.lineCap; }
  set lineCap(value: CanvasLineCap) { this.state.lineCap = value; }
  get lineDashOffset(): number { return this.state.lineDashOffset; }
  set lineDashOffset(value: number) { this.state.lineDashOffset = value; }
  get shadowColor(): string { return this.state.shadowColor; }
  set shadowColor(value: string) { this.state.shadowColor = value; }
  get shadowBlur(): number { return this.state.shadowBlur; }
  set shadowBlur(value: number) { this.state.shadowBlur = value; }
  get shadowOffsetX(): number { return this.state.shadowOffsetX; }
  set shadowOffsetX(value: number) { this.state.shadowOffsetX = value; }
  get shadowOffsetY(): number { return this.state.shadowOffsetY; }
  set shadowOffsetY(value: number) { this.state.shadowOffsetY = value; }
  get globalCompositeOperation(): GlobalCompositeOperation { return this.state.globalCompositeOperation; }
  set globalCompositeOperation(value: GlobalCompositeOperation) { this.state.globalCompositeOperation = value; }

  setLineDash(segments: number[]): void {
    this.state.lineDash = segments.length % 2 === 0 ? [...segments] : [...segments, ...segments];
  }

  getLineDash(): number[] {
    return [...this.state.lineDash];
  }

  save(): void {
    this.stack.push({ ...this.state, lineDash: [...this.state.lineDash] });
  }

  restore(): void {
    const state = this.stack.pop();
    if (state) this.state = state;
  }

  // Transform ------------------------------------------------------------------------------------

  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.state.matrix = multiply(this.state.matrix, [a, b, c, d, e, f]);
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.state.matrix = [a, b, c, d, e, f];
  }

  translate(x: number, y: number): void { this.transform(1, 0, 0, 1, x, y); }
  scale(x: number, y: number): void { this.transform(x, 0, 0, y, 0, 0); }
  rotate(angle: number): void { this.transform(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0); }

  getTransform(): DOMMatrix {
    const [a, b, c, d, e, f] = this.state.matrix;
    return new DOMMatrix([a, b, c, d, e, f]);
  }

  // Drawing --------------------------------------------------------------------------------------

  fill(rule: CanvasFillRule = 'nonzero'): void {
    if (this.path.length === 0) return;
    this.emit(`d="${this.path.join('')}" fill="${escapeXml(this.state.fillStyle)}"${rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}`);
  }

  stroke(): void {
    if (this.path.length === 0) return;
    this.emit(`d="${this.path.join('')}" fill="none"${this.strokeAttributes()}`);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const saved = { path: this.path, last: this.last, start: this.start };
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
    ({ path: this.path, last: this.last, start: this.start } = saved);
  }

  clip(rule: CanvasFillRule = 'nonzero'): void {
    const id = `c${++this.ids}`;
    const parent = this.state.clip ? ` clip-path="url(#${this.state.clip})"` : '';
    this.defs.push(`<clipPath id="${id}"${parent}><path d="${this.path.join('') || 'M0 0'}"${rule === 'evenodd' ? ' clip-rule="evenodd"' : ''}/></clipPath>`);
    this.state.clip = id;
  }

  // Output ---------------------------------------------------------------------------------------

  /** The drawing as an SVG document. */
  toSvg(): string {
    const defs = this.defs.join('');
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}">`,
      defs ? `<defs>${defs}</defs>` : '',
      ...clipGroups(this.body),
      '</svg>\n',
    ].join('');
  }

  // Inside ---------------------------------------------------------------------------------------

  private strokeAttributes(): string {
    const { strokeStyle, lineWidth, lineJoin, lineCap, lineDash, lineDashOffset } = this.state;
    const unit = this.unit;
    let out = ` stroke="${escapeXml(strokeStyle)}" stroke-width="${num(lineWidth * unit)}"`;
    if (lineJoin !== 'miter') out += ` stroke-linejoin="${lineJoin}"`;
    if (lineCap !== 'butt') out += ` stroke-linecap="${lineCap}"`;
    if (lineDash.length > 0) {
      out += ` stroke-dasharray="${lineDash.map(n => num(n * unit)).join(' ')}"`;
      if (lineDashOffset) out += ` stroke-dashoffset="${num(lineDashOffset * unit)}"`;
    }
    return out;
  }

  /** One path in device pixels, with the clip, shadow and blending in force. */
  private emit(attributes: string): void {
    this.body.push({ clip: this.state.clip, attributes: `${attributes}${this.effects()}`, blends: this.state.globalCompositeOperation === 'multiply' });
  }

  private effects(): string {
    const { globalCompositeOperation } = this.state;
    let extra = '';
    const filter = this.shadowFilter();
    if (filter) extra += ` filter="url(#${filter})"`;
    if (globalCompositeOperation === 'multiply') extra += ' style="mix-blend-mode: multiply"';
    return extra;
  }

  /** The canvas shadow as a filter, in device pixels as the canvas takes them; null when there is none. */
  private shadowFilter(): string | null {
    const { shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY } = this.state;
    if (!shadowBlur && !shadowOffsetX && !shadowOffsetY) return null;
    if (/^rgba\(.*,\s*0\s*\)$/.test(shadowColor.replace(/\s+/g, ' ')) || shadowColor === 'transparent') return null;
    const id = `s${++this.ids}`;
    this.defs.push(
      `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${this.width}" height="${this.height}" color-interpolation-filters="sRGB">`
      + `<feGaussianBlur in="SourceAlpha" stdDeviation="${num(shadowBlur / 2)}"/>`
      + `<feOffset dx="${num(shadowOffsetX)}" dy="${num(shadowOffsetY)}" result="blur"/>`
      + `<feFlood flood-color="${escapeXml(shadowColor)}"/>`
      + '<feComposite in2="blur" operator="in" result="shadow"/>'
      + '<feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
    );
    return id;
  }
}

/** A path as drawn: its attributes, the clip in force, and whether it blends with what lies under it. */
interface Drawn {
  clip: string | null;
  attributes: string;
  blends: boolean;
}

/**
 * The paths with each run under one clip in a group that clips them together: a browser clips a
 * group once, where a clip on every path of a cave's thousand strokes of water and growth made it
 * give up and show nothing. A path that blends keeps its own clip, since a clipped group would
 * blend it with nothing but the group.
 */
function clipGroups(body: readonly Drawn[]): string[] {
  const out: string[] = [];
  let open: string | null = null;
  const close = (): void => {
    if (open) out.push('</g>');
    open = null;
  };
  for (const { clip, attributes, blends } of body) {
    if (blends) {
      close();
      out.push(`<path ${attributes}${clip ? ` clip-path="url(#${clip})"` : ''}/>`);
      continue;
    }
    if (clip !== open) {
      close();
      if (clip) out.push(`<g clip-path="url(#${clip})">`);
      open = clip;
    }
    out.push(`<path ${attributes}/>`);
  }
  close();
  return out;
}
