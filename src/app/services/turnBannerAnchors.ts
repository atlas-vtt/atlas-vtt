import type { PlayersListEdge } from '../initiative/initiativeLayout';

/**
 * Where a turn banner attached to a players' initiative list stands (`turnBannerAtLists`): a point on the list's
 * box, in the window's coordinates, from which the banner hangs on the list's far side from its edge, turned with it.
 */
export interface BannerAnchor {
  x: number;
  y: number;
  /** Degrees the banner turns with its list (a list that faces its players). */
  turn: number;
  /**
   * The banner stands above the point, below it (a row along the top), or to its right or left, level with it (an
   * upright column at the left or right edge: the banner beside it, on its inner side).
   */
  side: 'above' | 'below' | 'right' | 'left';
  /** The banner's middle lies at the point. */
  align: 'centre';
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** How a list that faces its edge is turned, and so which side of its box faces into the room. */
const FACING: Readonly<Record<PlayersListEdge, { turn: number; inner: keyof Box }>> = {
  bottom: { turn: 0, inner: 'top' },
  top: { turn: 180, inner: 'bottom' },
  left: { turn: 90, inner: 'right' },
  right: { turn: -90, inner: 'left' },
};

/** The anchor of a banner for the list in `box` at `edge`: on the list's side that faces into the room. */
export function bannerAnchor(box: Box, edge: PlayersListEdge, faces: boolean): BannerAnchor {
  const x = (box.left + box.right) / 2;
  const y = (box.top + box.bottom) / 2;
  if (faces) {
    const { turn, inner } = FACING[edge];
    const across = inner === 'top' || inner === 'bottom';
    return { x: across ? x : box[inner], y: across ? box[inner] : y, turn, side: 'above', align: 'centre' };
  }
  if (edge === 'top') return { x, y: box.bottom, turn: 0, side: 'below', align: 'centre' };
  if (edge === 'bottom') return { x, y: box.top, turn: 0, side: 'above', align: 'centre' };
  // An upright column: beside it, towards the middle of the table, level with the column's middle
  return edge === 'left'
    ? { x: box.right, y, turn: 0, side: 'right', align: 'centre' }
    : { x: box.left, y, turn: 0, side: 'left', align: 'centre' };
}

/**
 * A point of the window in the frame the banners are placed in (`frame`: its rectangle on screen, its own size, and how far
 * its ancestors turn it, in degrees): the players' overlays turn with a table TV, and the banners with them.
 */
export function intoFrame(x: number, y: number, frame: { rect: Box; width: number; height: number; turn: number }): { x: number; y: number } {
  const dx = x - (frame.rect.left + frame.rect.right) / 2;
  const dy = y - (frame.rect.top + frame.rect.bottom) / 2;
  const angle = (-frame.turn * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: frame.width / 2 + dx * cos - dy * sin, y: frame.height / 2 + dx * sin + dy * cos };
}

/** Degrees the ancestors of `element` turn it (the table TV's rotation of the players' overlays). */
function turnOf(element: HTMLElement): number {
  const view = element.ownerDocument.defaultView ?? window;
  let turn = 0;
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const transform = view.getComputedStyle(ancestor).transform;
    if (!transform || transform === 'none') continue;
    const matrix = new view.DOMMatrix(transform);
    turn += (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
  }
  return turn;
}

/**
 * The box of a players' list in the frame of `host`, where the banners stand: its middle as the screen shows it, brought
 * into the host's frame, and its own size, lying across where the list turns to face a side.
 */
export function listBox(list: HTMLElement, host: HTMLElement, sideways: boolean): Box {
  const shown = list.getBoundingClientRect();
  const frame = { rect: host.getBoundingClientRect(), width: host.offsetWidth, height: host.offsetHeight, turn: turnOf(host) };
  const middle = intoFrame((shown.left + shown.right) / 2, (shown.top + shown.bottom) / 2, frame);
  const width = sideways ? list.offsetHeight : list.offsetWidth;
  const height = sideways ? list.offsetWidth : list.offsetHeight;
  return { left: middle.x - width / 2, right: middle.x + width / 2, top: middle.y - height / 2, bottom: middle.y + height / 2 };
}
