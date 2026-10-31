import { Mesh, MeshGeometry, type Container, type DynamicBitmapFont, type Texture } from 'pixi.js';

/** A label's text and the point its centre lies on, in the container's local space. */
export interface PlacedLabel {
  text: string;
  x: number;
  y: number;
}

/** The quads of one atlas page while a draw is being built. */
interface PageQuads {
  texture: Texture;
  positions: number[];
  uvs: number[];
}

/**
 * Draws every cell number as glyph quads of the font's atlas, one mesh per atlas page, laid out as a
 * `BitmapText` with its anchor at the centre lays its glyphs out (`AbstractBitmapTextPipe`). Ten
 * thousand labels are then one geometry rebuilt in a millisecond or two, where ten thousand
 * `BitmapText`s were a graphics context each, built the frame they first rendered: the stutter at
 * the moment a numbered grid's numbers appeared, which is the zoom at which the view holds the most cells.
 */
export class CellNumberMesh {
  private readonly meshes = new Map<Texture, Mesh>();

  constructor(private readonly container: Container, private readonly tint: number) {}

  /** Shows `labels` in `font`, each glyph `fontSize / font.baseMeasurementFontSize` of its atlas size. */
  set(labels: readonly PlacedLabel[], font: DynamicBitmapFont, fontSize: number): void {
    font.ensureCharacters(uniqueChars(labels));
    const scale = fontSize / font.baseMeasurementFontSize;
    const lineHeight = font.lineHeight;
    const offsetY = font.baseLineOffset;
    let lineShift = (lineHeight - font.fontMetrics.fontSize) / 2;
    if (lineShift - offsetY < 0) lineShift = 0;
    const pages = new Map<Texture, PageQuads>();
    for (const label of labels) {
      let width = 0;
      for (const char of label.text) width += font.chars[char]?.xAdvance ?? 0;
      const originX = label.x - 0.5 * width * scale;
      const originY = label.y - 0.5 * (lineHeight + offsetY) * scale;
      let advance = 0;
      for (const char of label.text) {
        const data = font.chars[char];
        if (!data) continue;
        const texture = data.texture;
        if (texture) {
          const page = pageOf(pages, font, texture);
          const x = originX + Math.round(advance + data.xOffset) * scale;
          const y = originY + Math.round(offsetY + data.yOffset + lineShift) * scale;
          const w = texture.orig.width * scale;
          const h = texture.orig.height * scale;
          page.positions.push(x, y, x + w, y, x + w, y + h, x, y + h);
          const { x0, y0, x1, y1, x2, y2, x3, y3 } = texture.uvs;
          page.uvs.push(x0, y0, x1, y1, x2, y2, x3, y3);
        }
        advance += data.xAdvance;
      }
    }
    for (const [texture, mesh] of this.meshes) {
      if (!pages.has(texture)) mesh.visible = false;
    }
    for (const [texture, page] of pages) this.draw(texture, page);
  }

  destroy(): void {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.destroy();
      mesh.destroy();
    }
    this.meshes.clear();
  }

  private draw(texture: Texture, { positions, uvs }: PageQuads): void {
    const indices = quadIndices(positions.length / 8);
    let mesh = this.meshes.get(texture);
    if (mesh) {
      mesh.geometry.positions = new Float32Array(positions);
      mesh.geometry.uvs = new Float32Array(uvs);
      mesh.geometry.indices = indices;
      mesh.visible = true;
      return;
    }
    const geometry = new MeshGeometry({ positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices });
    mesh = new Mesh({ geometry, texture });
    mesh.tint = this.tint;
    this.meshes.set(texture, mesh);
    this.container.addChild(mesh);
  }
}

/** The atlas page `glyph` is cut from, as the font lists it. */
function pageOf(pages: Map<Texture, PageQuads>, font: DynamicBitmapFont, glyph: Texture): PageQuads {
  const texture = font.pages.find((page) => page.texture.source === glyph.source)?.texture ?? glyph;
  let page = pages.get(texture);
  if (!page) {
    page = { texture, positions: [], uvs: [] };
    pages.set(texture, page);
  }
  return page;
}

/** Two triangles per quad, its corners listed clockwise from the top left. */
function quadIndices(quads: number): Uint32Array {
  const indices = new Uint32Array(quads * 6);
  for (let q = 0, i = 0; q < quads; q++, i += 6) {
    const v = q * 4;
    indices[i] = v;
    indices[i + 1] = v + 1;
    indices[i + 2] = v + 2;
    indices[i + 3] = v;
    indices[i + 4] = v + 2;
    indices[i + 5] = v + 3;
  }
  return indices;
}

function uniqueChars(labels: readonly PlacedLabel[]): string {
  const chars = new Set<string>();
  for (const label of labels) for (const char of label.text) chars.add(char);
  return [...chars].join('');
}
