import { TRANSLATIONS } from '../../src/app/i18n/languages';

/** Every language Atlas speaks, English included. */
export const LANGUAGES: readonly string[] = Object.keys(TRANSLATIONS);

/**
 * Finds text that does not fit where the layout put it: text that spills out of its box, text a box cuts off
 * without an ellipsis, and text lying on a control or on other text. Translations run longer than English
 * (German by a third, single words much longer), so a layout tested in English alone hides all three.
 */

const CONTROLS = [
  'button', 'input', 'select', 'textarea', 'svg', 'img', 'canvas',
  '[role="button"]', '[role="combobox"]', '[role="switch"]', '[role="slider"]', '[role="checkbox"]', '[role="tab"]',
].join(', ');

/** Half a pixel either way is rounding, not a collision. */
const SLACK = 1;

export interface TextMisfit {
  kind: 'spills' | 'cut' | 'on-control' | 'on-text';
  text: string;
  /** Where it happens, for the failure message: the box's classes, and what it collides with. */
  where: string;
}

interface TextRun {
  node: Text;
  owner: Element;
  rects: DOMRect[];
}

/**
 * What of `rect` its clipping ancestors leave in view, or null when nothing: content that scrolls under a dialog's
 * footer is out of its scroll area's view and lies on nothing.
 */
function visiblePart(element: Element, rect: DOMRect): DOMRect | null {
  let { left, top, right, bottom } = rect;
  for (let parent: Element | null = element; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const clip = parent.getBoundingClientRect();
    left = Math.max(left, clip.left);
    top = Math.max(top, clip.top);
    right = Math.min(right, clip.right);
    bottom = Math.min(bottom, clip.bottom);
  }
  return right - left > SLACK && bottom - top > SLACK ? new DOMRect(left, top, right - left, bottom - top) : null;
}

const label = (element: Element): string =>
  `${element.tagName.toLowerCase()}${[...element.classList].slice(0, 3).map((name) => `.${name}`).join('')}`;

const snippet = (node: Text): string => (node.textContent ?? '').trim().slice(0, 48);

const intersects = (a: DOMRect, b: DOMRect): boolean =>
  a.left < b.right - SLACK && b.left < a.right - SLACK && a.top < b.bottom - SLACK && b.top < a.bottom - SLACK;

/** Text for screen readers only (`sr-only`, `atlas-visually-hidden`): clipped to nothing, so it is never on screen to collide. */
const clippedAway = (style: CSSStyleDeclaration): boolean => style.position === 'absolute'
  && (/^rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)$/.test(style.clip) || style.clipPath === 'inset(50%)');

function isShown(element: Element): boolean {
  if (element.closest('[hidden]')) return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    // A surface faded out (a closed menu while it leaves) shows none of its text.
    if (clippedAway(style) || Number(style.opacity) === 0) return false;
  }
  return getComputedStyle(element).visibility !== 'hidden';
}

/** Whether a computed colour (`rgb()`, `oklch()`, `color()`, …) hides what lies behind it: no or almost no transparency. */
function opaque(colour: string): boolean {
  if (colour === 'transparent') return false;
  const alpha = /\/\s*([\d.]+%?)\s*\)$/.exec(colour)?.[1] ?? /^rgba\((?:[^,]*,){3}\s*([\d.]+%?)\s*\)$/.exec(colour)?.[1];
  if (alpha === undefined) return true;
  return alpha.endsWith('%') ? parseFloat(alpha) >= 90 : parseFloat(alpha) >= 0.9;
}

/**
 * The surface `element` floats on, if any: a positioned box out of the flow with a background of its own (a menu,
 * a popover, a badge on a picture). It is drawn over the page, so what lies under it is covered, not collided with.
 */
function floatingLayer(element: Element): Element | null {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if ((style.position === 'absolute' || style.position === 'fixed') && opaque(style.backgroundColor)) return node;
  }
  return null;
}

/** One of the two lies on a floating surface the other is not on: that surface covers the other where they meet. */
function onAnotherLayer(a: Element, b: Element): boolean {
  const layerA = floatingLayer(a);
  const layerB = floatingLayer(b);
  return layerA !== layerB && ((layerA !== null && !layerA.contains(b)) || (layerB !== null && !layerB.contains(a)));
}

/** The box a text node is laid out in: its nearest ancestor that is not an inline box, nor one without a box (`display: contents`). */
function layoutBox(node: Text): Element {
  let element = node.parentElement!;
  while (element.parentElement && ['inline', 'contents'].includes(getComputedStyle(element).display)) element = element.parentElement;
  return element;
}

function textRuns(root: Element): TextRun[] {
  const runs: TextRun[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (!node.textContent?.trim() || !node.parentElement || !isShown(node.parentElement)) continue;
    if (node.parentElement.closest('style, script, option')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const owner = layoutBox(node);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    if (rects.length > 0) runs.push({ node, owner, rects });
  }
  return runs;
}

/** Text outside its own box: spilled where the box lets it show, cut where the box clips it without an ellipsis. */
function boxMisfit(run: TextRun): TextMisfit | null {
  const style = getComputedStyle(run.owner);
  if (style.overflowX === 'auto' || style.overflowX === 'scroll') return null;
  const box = run.owner.getBoundingClientRect();
  const outside = run.rects.some((rect) => rect.left < box.left - SLACK || rect.right > box.right + SLACK);
  if (!outside) return null;
  if (style.overflowX === 'visible') return { kind: 'spills', text: snippet(run.node), where: label(run.owner) };
  if (style.textOverflow === 'ellipsis') return null;
  return { kind: 'cut', text: snippet(run.node), where: label(run.owner) };
}

/**
 * The part of a control that text must keep off. A text field counts by its content box: a unit or an icon set into
 * its padding (the `°` after an angle) is part of the field, while text over what is typed is a collision.
 */
function controlBox(element: Element): DOMRect {
  const box = element.getBoundingClientRect();
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return box;
  const style = getComputedStyle(element);
  const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
  const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
  return new DOMRect(left, box.top, Math.max(0, right - left), box.height);
}

/** `element` lies in a layer positioned out of the flow that `other` is not in: one is laid over the other. */
function laidOver(element: Element, other: Element): boolean {
  for (let node: Element | null = element; node && !node.contains(other); node = node.parentElement) {
    const position = getComputedStyle(node).position;
    if (position === 'absolute' || position === 'fixed') return true;
  }
  return false;
}

/**
 * Art that text is set over on purpose: a picture or glyph no one reads (`aria-hidden`, an empty `alt`), laid over
 * the text or under it (a watermark crest, a map behind a heading, a mark on a die). An icon in the flow beside
 * text is no backdrop, and text running into it still collides.
 */
function backdrop(image: Element, text: Element): boolean {
  if (!image.matches('svg, img, canvas')) return false;
  const unread = image.closest('[aria-hidden="true"]') !== null || image.getAttribute('alt') === '';
  return unread && (laidOver(image, text) || laidOver(text, image));
}

/**
 * Every place under `root` where text does not fit. A control or text that contains the text, or that the text
 * contains, is no collision: a button's label lies on its button.
 */
export function textMisfits(root: Element): TextMisfit[] {
  const misfits: TextMisfit[] = [];
  const runs = textRuns(root);
  const controls = [...root.querySelectorAll(CONTROLS)].filter(isShown)
    .map((element) => ({ element, box: visiblePart(element, controlBox(element)) }))
    .filter((control): control is { element: Element; box: DOMRect } => control.box !== null);
  const seen = new Map(runs.map((run) => [run, run.rects.map((rect) => visiblePart(run.owner, rect)).filter((rect): rect is DOMRect => rect !== null)]));
  for (const run of runs) {
    const misfit = boxMisfit(run);
    if (misfit) misfits.push(misfit);
    const control = controls.find(({ element, box }) =>
      !element.contains(run.node) && !run.owner.contains(element) && seen.get(run)!.some((rect) => intersects(rect, box))
      && !onAnotherLayer(run.owner, element) && !backdrop(element, run.owner));
    if (control) misfits.push({ kind: 'on-control', text: snippet(run.node), where: `${label(run.owner)} on ${label(control.element)}` });
  }
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i]!;
      const b = runs[j]!;
      if (a.owner.contains(b.owner) || b.owner.contains(a.owner) || onAnotherLayer(a.owner, b.owner)) continue;
      if (seen.get(a)!.some((ra) => seen.get(b)!.some((rb) => intersects(ra, rb)))) {
        misfits.push({ kind: 'on-text', text: snippet(a.node), where: `${label(a.owner)} on ${label(b.owner)} ("${snippet(b.node)}")` });
      }
    }
  }
  return misfits;
}

export const describeMisfits = (misfits: readonly TextMisfit[]): string[] =>
  misfits.map((misfit) => `${misfit.kind}: "${misfit.text}" in ${misfit.where}`);
