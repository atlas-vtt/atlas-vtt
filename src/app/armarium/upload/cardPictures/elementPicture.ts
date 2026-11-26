/**
 * A picture of an element as the browser draws it: the element's markup and the document's stylesheets go into an SVG
 * image (`foreignObject`), which a canvas draws and encodes as PNG. Nothing is fetched: an SVG image loads nothing from
 * outside itself, so fonts come only from the system and from `@font-face` rules whose source is a data URL (Atlas'
 * own are), and pictures (`<img>`) are left out unless their source is one.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/** The text of every rule of `doc`'s stylesheets, but those of the elements in `skip`. */
export function documentCss(doc: Document, skip: ReadonlySet<Node>): string {
  const rules: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    if (sheet.ownerNode && skip.has(sheet.ownerNode)) continue;
    try {
      for (const rule of Array.from(sheet.cssRules)) rules.push(rule.cssText);
    } catch {
      // A stylesheet of another origin cannot be read; Obsidian's and the plugins' all can.
    }
  }
  return rules.join('\n');
}

/** CSS as character data of an XML document: a `]]>` inside it would end the section early. */
const cdata = (text: string): string => `<![CDATA[${text.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;

/** The element's markup as XHTML, without pictures the SVG image could not load. */
function markupOf(element: HTMLElement): string {
  const copy = element.cloneNode(true);
  if (!copy.instanceOf(HTMLElement)) return '';
  for (const image of Array.from(copy.querySelectorAll('img'))) {
    if (!image.getAttribute('src')?.startsWith('data:')) image.remove();
  }
  return new XMLSerializer().serializeToString(copy);
}

export interface PictureOptions {
  /** The rules the picture is drawn with (`documentCss`). */
  css: string;
  /** The classes of the `<body>` around the element, which Obsidian's colours and sizes hang from. */
  bodyClass: string;
  /** Width and height of the picture in CSS pixels; content beyond them is cut off. */
  width: number;
  height: number;
  /** Device pixels per CSS pixel. */
  scale: number;
}

/** The SVG image that draws `element` with `options`, as a data URL. */
export function pictureSvg(element: HTMLElement, { css, bodyClass, width, height, scale }: PictureOptions): string {
  const svg = `<svg xmlns="${SVG_NS}" width="${Math.round(width * scale)}" height="${Math.round(height * scale)}" viewBox="0 0 ${width} ${height}">`
    + `<foreignObject x="0" y="0" width="${width}" height="${height}">`
    + `<body xmlns="${XHTML_NS}" class="${bodyClass}" style="margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent">`
    + `<style>${cdata(css)}</style>${markupOf(element)}</body></foreignObject></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** The rows of the canvas down to its last one with a pixel that is not fully transparent. */
function paintedHeight(context: CanvasRenderingContext2D, width: number, height: number): number {
  const { data } = context.getImageData(0, 0, width, height);
  for (let row = height - 1; row >= 0; row--) {
    for (let column = 0; column < width; column++) {
      if (data[(row * width + column) * 4 + 3] !== 0) return row + 1;
    }
  }
  return 0;
}

/**
 * A PNG of `element` drawn with `options`, cut below its last painted row: the element should paint a background, so
 * a picture given more height than it needs ends where it does. Rejects where the browser cannot draw it.
 */
export async function elementPicture(element: HTMLElement, options: PictureOptions): Promise<Blob> {
  const image = createEl('img', { attr: { src: pictureSvg(element, options) } });
  await image.decode();
  const width = Math.round(options.width * options.scale);
  const height = Math.round(options.height * options.scale);
  const canvas = createEl('canvas', { attr: { width, height } });
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No 2D context to draw the picture on');
  context.drawImage(image, 0, 0, width, height);
  const painted = paintedHeight(context, width, height);
  if (painted === 0) throw new Error('The picture came out empty');
  const cut = createEl('canvas', { attr: { width, height: painted } });
  cut.getContext('2d')?.drawImage(canvas, 0, 0);
  return new Promise((resolve, reject) => {
    cut.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be encoded'))), 'image/png');
  });
}
