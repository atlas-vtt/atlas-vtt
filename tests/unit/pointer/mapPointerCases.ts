import type { PointerCase } from './pointerWorld';

/** What the map does with one case: the layer that acts on a press, a menu, a tap and a hover, and the cursor. */
export interface PointerOutcome {
  /** What the layers did on the press, in order. */
  press: readonly string[];
  /** Whether the press was claimed, so the viewport's other listeners (marquee, drawing, fog, measuring, note pins) leave it alone. */
  claimed: boolean;
  /** Whether the tap PIXI sends after the press is claimed too. */
  tapClaimed: boolean;
  /** What the layers did when the press was released where it began. */
  release: readonly string[];
  /** Whether a secondary click there opens a menu: what a finger's long press asks. */
  menuAt: boolean;
  /** Whether a tap there acts on something whose press stays the empty map's. */
  tapActs: boolean;
  /** Whether a press there acts at once, so a finger's press waits for its tap. */
  pressActs: boolean;
  /** The cursor a move there shows. */
  cursor: string;
  /** What a move there shows as hovered. */
  hovered: readonly string[];
  /** What the tool in hand heard of the move. */
  moves: readonly string[];
}

export interface PointerRow {
  name: string;
  case: PointerCase;
  expect: Partial<PointerOutcome>;
}

const row = (name: string, c: PointerCase, expect: Partial<PointerOutcome>): PointerRow => ({ name, case: c, expect });
const right = { button: 2 } as const;
const touch = { pointer: 'touch' } as const;
const macCtrl = { mac: true, ctrl: true } as const;

/** A primary press of a mouse, in the GM's view. */
export const PRESSES: readonly PointerRow[] = [
  row('nothing under the select tool takes the press', { tool: 'select' }, { press: [], claimed: false }),
  row('the move tool lets go of the selection on the empty map', { tool: 'move', selected: ['token-1'] }, { press: ['selection:cleared'], claimed: false }),
  row('Shift keeps the selection on the empty map', { tool: 'move', selected: ['token-1'], shift: true }, { press: [] }),
  row('the select tool keeps the selection on the empty map', { tool: 'select', selected: ['token-1'] }, { press: [] }),
  row('a kept measurement\'s handle lies above pins, doors, lights, handles and tokens', { tool: 'select', hits: ['measureHandle', 'pin', 'door', 'light', 'grip', 'token'] }, { press: ['measure:press'], claimed: true }),
  row('a kept measurement\'s handle takes the press from the draw tool', { tool: 'draw', hits: ['measureHandle', 'annotation'] }, { press: ['measure:press'] }),
  row('a pin lies above a door badge, a light and a token', { tool: 'select', hits: ['pin', 'door', 'light', 'token'] }, { press: ['pin:press'], claimed: true }),
  row('a pin takes the press with the fog tool', { tool: 'fog', hits: ['pin'] }, { press: ['pin:press'] }),
  row('a door badge lies above a light and a token', { tool: 'select', hits: ['door', 'light', 'token'] }, { press: ['door:toggle'], claimed: true }),
  row('a door badge opens with the measure tool', { tool: 'measure', hits: ['door'] }, { press: ['door:toggle'] }),
  row('the lighting tool leaves a door badge to its walls', { tool: 'wall', hits: ['door', 'wall'] }, { press: ['wall:press'], claimed: true }),
  row('the lighting tool\'s walls may leave the press to the map', { tool: 'wall', hits: ['door'] }, { press: [], claimed: false }),
  row('a light lies above a handle and a token', { tool: 'select', hits: ['light', 'grip', 'token'] }, { press: ['light:press'] }),
  row('a light lies above the lighting tool\'s walls', { tool: 'wall', hits: ['light', 'wall'] }, { press: ['light:press'] }),
  row('a handle of the selected drawings lies above a token', { tool: 'select', hits: ['grip', 'token'] }, { press: ['grip:press'], claimed: true }),
  row('a handle lies above what the draw tool would take', { tool: 'draw', hits: ['grip', 'annotation'] }, { press: ['grip:press'] }),
  row('the draw tool takes a drawing over a token', { tool: 'draw', hits: ['annotation', 'token'] }, { press: ['annotation:press'], claimed: true }),
  row('the draw tool leaves tokens, the selection\'s frame and linked hexes alone', { tool: 'draw', hits: ['token', 'groupFrame', 'hexLink'], selected: ['token-1'] }, { press: [], claimed: false }),
  row('the stairs tool takes the press over a token', { tool: 'stairs', hits: ['stairs', 'token'] }, { press: ['stairs:press'], claimed: true }),
  row('the stairs tool leaves tokens alone', { tool: 'stairs', hits: ['token'] }, { press: [], claimed: false }),
  row('the lighting tool takes the press over a token', { tool: 'wall', hits: ['wall', 'token'] }, { press: ['wall:press'] }),
  row('the sound tool takes the press over a token', { tool: 'audio', hits: ['sound', 'token'] }, { press: ['sound:press'], claimed: true }),
  row('the sound tool leaves the press where it places nothing', { tool: 'audio' }, { press: [], claimed: false }),
  row('the fog tool leaves tokens and linked hexes to its own gesture', { tool: 'fog', hits: ['token', 'hexLink', 'annotation'] }, { press: [], claimed: false }),
  row('the measure tool leaves tokens and linked hexes alone', { tool: 'measure', hits: ['token', 'hexLink'] }, { press: [], claimed: false }),
  row('the note pin tool leaves tokens alone', { tool: 'note-pin', hits: ['token'] }, { press: [], claimed: false }),
  row('a selection\'s bar lies above every token', { tool: 'select', hits: ['selectionBar', 'token'] }, { press: ['selectionBar:press'], claimed: true }),
  row('Shift passes over a selection\'s bar to the token', { tool: 'select', hits: ['selectionBar', 'token'], shift: true }, { press: ['token:press'] }),
  row('a token lies above the selection\'s frame, drawings and linked hexes', { tool: 'select', hits: ['token', 'groupFrame', 'annotation', 'hexLink'] }, { press: ['token:press'], claimed: true }),
  row('a selected token drags the drawings selected with it', { tool: 'select', hits: ['token'], selected: ['token-1'] }, { press: ['token:press', 'annotations:dragAlong'] }),
  row('a Shift-drag on a selected token turns it and drags nothing along', { tool: 'select', hits: ['token'], selected: ['token-1'], shift: true }, { press: ['token:press'] }),
  row('a token from outside the selection moves alone', { tool: 'select', hits: ['token'], selected: ['other'] }, { press: ['token:press'] }),
  row('the move tool keeps the selection of a token it presses', { tool: 'move', hits: ['token'], selected: ['token-1'] }, { press: ['token:press', 'annotations:dragAlong'] }),
  row('the selection\'s frame drags tokens and drawings together', { tool: 'select', hits: ['groupFrame', 'annotation', 'hexLink'] }, { press: ['tokens:groupDrag', 'annotations:dragAlong'], claimed: true }),
  row('Shift on the selection\'s frame picks instead of dragging', { tool: 'select', hits: ['groupFrame'], shift: true }, { press: [], claimed: false }),
  row('Shift on the frame passes to the drawing beneath', { tool: 'select', hits: ['groupFrame', 'annotation'], shift: true }, { press: ['annotation:press'] }),
  row('a drawing lies above a linked hex', { tool: 'select', hits: ['annotation', 'hexLink'] }, { press: ['annotation:press'], claimed: true }),
  row('a linked hex opens its note and leaves the press to pan or select', { tool: 'select', hits: ['hexLink'] }, { press: ['hexLink:press'], claimed: false }),
  row('the move tool opens a linked hex and lets go of the selection', { tool: 'move', hits: ['hexLink'], selected: ['token-1'] }, { press: ['hexLink:press', 'selection:cleared'], claimed: false }),
  row('the local player view claims a token\'s press and does nothing with it', { tool: 'select', hits: ['token'], playerView: true }, { press: [], claimed: true }),
  row('tokens being placed take the pointer from everything on the map', { tool: 'select', hits: ['pin', 'door', 'token'], placing: true }, { press: [], claimed: false }),
  row('the middle button presses a token', { tool: 'select', hits: ['token'], button: 1 }, { press: ['token:press'], claimed: true }),
  row('the middle button presses no pin', { tool: 'select', hits: ['pin'], button: 1 }, { press: [], claimed: false }),
  row('the middle button keeps the selection', { tool: 'move', selected: ['token-1'], button: 1 }, { press: [] }),
];

/** A finger's press: it reaches marks from further than a mouse, except beside a token the tool takes. */
export const FINGER_PRESSES: readonly PointerRow[] = [
  row('a finger on a token leaves the pins, doors and lights beside it out of reach', { tool: 'select', ...touch, hits: ['token'], fingerHits: ['pin', 'door', 'light'] }, { press: ['token:press'], claimed: true }),
  row('a finger reaches a pin from further than a mouse', { tool: 'select', ...touch, fingerHits: ['pin'] }, { press: ['pin:press'] }),
  row('a finger keeps its reach over a token the tool does not take', { tool: 'draw', ...touch, hits: ['token'], fingerHits: ['pin'] }, { press: ['pin:press'] }),
  row('a finger reaches a door badge from further than a mouse', { tool: 'select', ...touch, fingerHits: ['door'] }, { press: ['door:toggle'] }),
  row('a finger on a token leaves a measurement\'s handle beside it out of reach', { tool: 'select', ...touch, hits: ['token'], fingerHits: ['measureHandle'] }, { press: ['token:press'] }),
  row('a finger on the empty map may pan, so it keeps the selection', { tool: 'move', ...touch, selected: ['token-1'] }, { press: [], claimed: false }),
  row('a finger leaves tokens being placed the pointer', { tool: 'select', ...touch, hits: ['token'], fingerHits: ['pin'], placing: true }, { press: [], claimed: false }),
];

/** macOS sends a Ctrl+click as a primary press with Ctrl held: it is the secondary click there, and cannot pan. */
export const CTRL_CLICKS: readonly PointerRow[] = [
  row('a Ctrl+click on macOS opens a linked hex\'s menu at once', { tool: 'select', ...macCtrl, hits: ['hexLink'] }, { press: ['hexLink:menu'], claimed: true, tapClaimed: true, release: [] }),
  row('a Ctrl+click elsewhere is a click on the linked hex', { tool: 'select', ctrl: true, hits: ['hexLink'] }, { press: ['hexLink:press'], claimed: false, tapClaimed: false }),
  row('a Ctrl+click on macOS opens a door\'s menu and leaves the door as it is', { tool: 'select', ...macCtrl, hits: ['doorMenu', 'door'] }, { press: ['door:menu'], claimed: true }),
  row('a Ctrl+click on macOS opens the lighting tool\'s menu and places no wall point', { tool: 'wall', ...macCtrl, hits: ['wallMenu', 'wall'] }, { press: ['wall:menu'], claimed: true, release: ['wall:up'] }),
  row('a Ctrl+click elsewhere is the lighting tool\'s own click', { tool: 'wall', ctrl: true, hits: ['wall'] }, { press: ['wall:press'], release: ['wall:up'] }),
  row('a Ctrl+click on macOS keeps the selection', { tool: 'move', ...macCtrl, selected: ['token-1'] }, { press: [], claimed: true, tapClaimed: true }),
  row('a Ctrl+click elsewhere lets go of the selection', { tool: 'move', ctrl: true, selected: ['token-1'] }, { press: ['selection:cleared'], claimed: false }),
  row('a Ctrl+click on macOS opens a token\'s menu', { tool: 'select', ...macCtrl, hits: ['token'] }, { press: ['token:menu'], claimed: true }),
  row('a Ctrl+click on macOS is claimed while tokens are placed', { tool: 'select', ...macCtrl, hits: ['pin'], placing: true }, { press: [], claimed: true }),
  row('a Ctrl+click on macOS opens a pin\'s menu', { tool: 'select', ...macCtrl, hits: ['pin'] }, { press: ['pin:menu'], claimed: true }),
  row('a Ctrl+click on macOS opens the fog\'s menu at once', { tool: 'select', ...macCtrl, hits: ['fogMenu'] }, { press: ['fog:menu'], claimed: true }),
  row('the right button on macOS still waits for its release in place', { tool: 'select', mac: true, ...right, hits: ['hexLink'] }, { press: [], claimed: false, release: ['hexLink:menu'] }),
];

/** A press of the right button: a right-drag pans, so most menus open when it is released in place. */
export const RIGHT_PRESSES: readonly PointerRow[] = [
  row('a linked hex\'s menu waits for the release, and the press pans', { tool: 'select', ...right, hits: ['hexLink'] }, { press: [], claimed: false, release: ['hexLink:menu'], menuAt: true }),
  row('a pin opens its menu on the press, above a token', { tool: 'select', ...right, hits: ['pin', 'token'] }, { press: ['pin:menu'], claimed: true, release: [], menuAt: true }),
  row('a door badge\'s menu lies above a pin', { tool: 'select', ...right, hits: ['doorMenu', 'pin'] }, { press: [], claimed: false, release: ['door:menu'], menuAt: true }),
  row('a badge the menu does not ask for leaves the pin its menu', { tool: 'select', ...right, hits: ['pin', 'door'] }, { press: ['pin:menu'], menuAt: true }),
  row('the lighting tool\'s menu takes every right-click, on a pin or a badge too', { tool: 'wall', ...right, hits: ['wallMenu', 'pin', 'doorMenu'] }, { press: [], claimed: false, release: ['wall:up', 'wall:menu'], menuAt: true }),
  row('the lighting tool\'s menu opens nothing where it offers nothing', { tool: 'wall', ...right, hits: ['doorMenu'] }, { press: [], release: ['wall:up'], menuAt: false }),
  row('a token\'s menu covers the menus beneath it', { tool: 'select', ...right, hits: ['token', 'annotationMenu', 'hexLink', 'mapFeature', 'fogMenu'] }, { press: ['token:menu'], claimed: true, release: [], menuAt: true }),
  row('the local player view opens no token menu', { tool: 'select', ...right, hits: ['token'], playerView: true }, { press: [], claimed: true, menuAt: false }),
  row('the draw tool opens a drawing\'s menu over a token', { tool: 'draw', ...right, hits: ['token', 'annotationMenu'] }, { press: [], release: ['annotation:menu'], menuAt: true }),
  row('a drawing\'s menu lies above a linked hex and a feature', { tool: 'select', ...right, hits: ['annotationMenu', 'hexLink', 'mapFeature'] }, { release: ['annotation:menu'], menuAt: true }),
  row('a linked hex\'s menu lies above a feature and fog', { tool: 'select', ...right, hits: ['hexLink', 'mapFeature', 'fogMenu'] }, { release: ['hexLink:menu'] }),
  row('a feature\'s menu lies above fog', { tool: 'select', ...right, hits: ['mapFeature', 'fogMenu'] }, { release: ['feature:menu'], menuAt: true }),
  row('features and fog offer no menu while the canvas shows the players\' view', { tool: 'select', ...right, hits: ['mapFeature', 'fogMenu'], gmView: false }, { press: [], claimed: false, release: [], menuAt: false }),
  row('a linked hex offers its menu in the players\' view too', { tool: 'select', ...right, hits: ['hexLink'], gmView: false }, { release: ['hexLink:menu'], menuAt: true }),
  row('fog offers its menu to the move tool', { tool: 'move', ...right, hits: ['fogMenu'] }, { release: ['fog:menu'], menuAt: true }),
  row('fog offers its menu to the fog tool, which leaves linked hexes and features alone', { tool: 'fog', ...right, hits: ['fogMenu', 'hexLink', 'mapFeature'] }, { release: ['fog:menu'], menuAt: true }),
  row('fog offers its menu to the eraser', { tool: 'eraser', ...right, hits: ['fogMenu'] }, { release: ['fog:menu'] }),
  row('the measure tool opens no menu of fog, features, linked hexes or tokens', { tool: 'measure', ...right, hits: ['fogMenu', 'mapFeature', 'hexLink', 'token'] }, { press: [], release: [], menuAt: false }),
  row('a door badge offers its menu with the measure tool', { tool: 'measure', ...right, hits: ['doorMenu'] }, { release: ['door:menu'], menuAt: true }),
  row('a pin opens its menu with the draw tool, above a drawing', { tool: 'draw', ...right, hits: ['pin', 'annotationMenu'] }, { press: ['pin:menu'], menuAt: true }),
  row('nothing under a right press opens nothing', { tool: 'select', ...right }, { press: [], claimed: false, release: [], menuAt: false }),
  row('tokens being placed open no menu', { tool: 'select', ...right, hits: ['pin', 'token', 'hexLink'], placing: true }, { press: [], claimed: false, release: [], menuAt: false }),
];

/** What a tap asks: something whose press stays the empty map's, a linked hex. */
export const TAPS: readonly PointerRow[] = [
  row('a tap on a linked hex acts with the select tool', { tool: 'select', hits: ['hexLink'] }, { tapActs: true }),
  row('a tap on a linked hex acts with the move tool, under a token too', { tool: 'move', hits: ['token', 'hexLink'] }, { tapActs: true }),
  row('a tap on a linked hex does nothing with the draw tool', { tool: 'draw', hits: ['hexLink'] }, { tapActs: false }),
  row('a tap does nothing while tokens are placed', { tool: 'select', hits: ['hexLink'], placing: true }, { tapActs: false }),
  row('a tap on a token is the token\'s press', { tool: 'select', hits: ['token'] }, { tapActs: false }),
];

/** What acts as it is pressed, so a finger's press waits for its tap. */
export const PRESS_ACTS: readonly PointerRow[] = [
  row('a door badge acts as it is pressed', { tool: 'select', ...touch, hits: ['door'] }, { pressActs: true }),
  row('a pin above a door badge is dragged, so its press waits for nothing', { tool: 'select', ...touch, hits: ['pin', 'door'] }, { pressActs: false }),
  row('with the lighting tool a door badge is its walls\'', { tool: 'wall', ...touch, hits: ['door'] }, { pressActs: false }),
  row('a selection\'s bar acts as it is pressed', { tool: 'select', ...touch, hits: ['selectionBar'] }, { pressActs: true }),
  row('a token is dragged from its press', { tool: 'select', ...touch, hits: ['token'] }, { pressActs: false }),
  row('a finger on a token does not reach the door badge beside it', { tool: 'select', ...touch, hits: ['token'], fingerHits: ['door'] }, { pressActs: false }),
  row('a finger reaches a door badge from further than a mouse', { tool: 'select', ...touch, fingerHits: ['door'] }, { pressActs: true }),
  row('a door badge acts with the draw tool', { tool: 'draw', ...touch, hits: ['door'] }, { pressActs: true }),
  row('nothing acts while tokens are placed', { tool: 'select', ...touch, hits: ['door'], placing: true }, { pressActs: false }),
  row('a door badge under a measurement\'s handle still counts as acting', { tool: 'select', ...touch, hits: ['measureHandle', 'door'] }, { pressActs: true }),
];

/** A mouse moving over the map. */
export const HOVERS: readonly PointerRow[] = [
  row('nothing under the select tool shows the default cursor', { tool: 'select' }, { cursor: 'default', hovered: [], moves: [] }),
  row('a token is hovered with the select tool', { tool: 'select', hits: ['token'] }, { cursor: 'pointer', hovered: ['token', 'tokenUi'] }),
  row('a linked hex is hovered', { tool: 'select', hits: ['hexLink'] }, { cursor: 'pointer', hovered: ['hexLink'] }),
  row('a token covers a linked hex', { tool: 'select', hits: ['token', 'hexLink'] }, { cursor: 'pointer', hovered: ['token', 'tokenUi'] }),
  row('a selection\'s bar lights up', { tool: 'select', hits: ['selectionBar'] }, { cursor: 'pointer', hovered: ['bar'] }),
  row('a selection\'s bar lights up over a token', { tool: 'select', hits: ['selectionBar', 'token'] }, { cursor: 'pointer', hovered: ['bar', 'token', 'tokenUi'] }),
  row('a selection\'s bar lights up over a linked hex', { tool: 'select', hits: ['selectionBar', 'hexLink'] }, { cursor: 'pointer', hovered: ['bar', 'hexLink'] }),
  row('a map feature is labelled', { tool: 'select', hits: ['mapFeature'] }, { cursor: 'default', hovered: ['feature'] }),
  row('a door badge is labelled', { tool: 'select', hits: ['doorMenu'] }, { cursor: 'default', hovered: ['doorLabel'] }),
  row('a door badge is labelled over a token', { tool: 'select', hits: ['doorMenu', 'token'] }, { cursor: 'pointer', hovered: ['doorLabel', 'token', 'tokenUi'] }),
  row('a token covers a feature\'s label', { tool: 'select', hits: ['mapFeature', 'token'] }, { cursor: 'pointer', hovered: ['token', 'tokenUi'] }),
  row('a linked hex covers a feature\'s label', { tool: 'select', hits: ['mapFeature', 'hexLink'] }, { cursor: 'pointer', hovered: ['hexLink'] }),
  row('features are labelled in the GM\'s view only', { tool: 'select', hits: ['mapFeature'], gmView: false }, { cursor: 'default', hovered: [] }),
  row('a pin is hovered above a token, a light and a door badge', { tool: 'select', hits: ['pin', 'token', 'light', 'doorMenu'] }, { cursor: 'pointer', hovered: ['pin'] }),
  row('a measurement\'s handle is hovered above a pin and a light', { tool: 'select', hits: ['measureHandle', 'pin', 'light'] }, { cursor: 'measure-cursor', hovered: ['measure'] }),
  row('a light is hovered above a token', { tool: 'select', hits: ['light', 'token'] }, { cursor: 'light-cursor', hovered: ['light'] }),
  row('a light covers a feature\'s label', { tool: 'select', hits: ['light', 'mapFeature'] }, { cursor: 'light-cursor', hovered: ['light'] }),
  row('a light covers a door badge\'s label', { tool: 'select', hits: ['doorMenu', 'light'] }, { cursor: 'light-cursor', hovered: ['light'] }),
  row('a light covers a selection\'s bar', { tool: 'select', hits: ['selectionBar', 'light'] }, { cursor: 'light-cursor', hovered: ['light'] }),
  row('a handle is hovered above a token', { tool: 'select', hits: ['grip', 'token'] }, { cursor: 'grip-cursor', hovered: ['grip'] }),
  row('a drawing is hovered with the select tool', { tool: 'select', hits: ['annotation'] }, { cursor: 'annotation-cursor', hovered: ['annotation'] }),
  row('a token covers a drawing with the select tool', { tool: 'select', hits: ['annotation', 'token'] }, { cursor: 'pointer', hovered: ['token', 'tokenUi'] }),
  row('the draw tool hovers a drawing over a token, whose statblock still answers', { tool: 'draw', hits: ['annotation', 'token'] }, { cursor: 'annotation-cursor', hovered: ['annotation', 'token'] }),
  row('the draw tool shows the default cursor where it takes nothing', { tool: 'draw' }, { cursor: 'default', hovered: [] }),
  row('the draw tool leaves a token its statblock hover', { tool: 'draw', hits: ['token'] }, { cursor: 'default', hovered: ['token'] }),
  row('the lighting tool hears the move and shows its cursor', { tool: 'wall' }, { cursor: 'wall-cursor', hovered: [], moves: ['wall:move'] }),
  row('the lighting tool hears the move under a light\'s cursor', { tool: 'wall', hits: ['light'] }, { cursor: 'light-cursor', hovered: ['light'], moves: ['wall:move'] }),
  row('a pin takes the move from the lighting tool', { tool: 'wall', hits: ['pin'] }, { cursor: 'pointer', hovered: ['pin'], moves: [] }),
  row('the lighting tool leaves a token its statblock hover', { tool: 'wall', hits: ['token'] }, { cursor: 'wall-cursor', hovered: ['token'], moves: ['wall:move'] }),
  row('the lighting tool hears the move under a measurement\'s handle', { tool: 'wall', hits: ['measureHandle'] }, { cursor: 'measure-cursor', hovered: ['measure'], moves: ['wall:move'] }),
  row('the stairs tool hears the move and shows its cursor', { tool: 'stairs' }, { cursor: 'stairs-cursor', moves: ['stairs:move'] }),
  row('the stairs tool hears the move under a light, over a token', { tool: 'stairs', hits: ['light', 'token'] }, { cursor: 'light-cursor', hovered: ['light', 'token'], moves: ['stairs:move'] }),
  row('the sound tool shows a crosshair', { tool: 'audio' }, { cursor: 'crosshair', hovered: [] }),
  row('the sound tool shows a light\'s cursor and a token\'s statblock hover', { tool: 'audio', hits: ['token', 'light'] }, { cursor: 'light-cursor', hovered: ['light', 'token'] }),
  row('the measure tool leaves a token its statblock hover', { tool: 'measure', hits: ['token'] }, { cursor: 'default', hovered: ['token'] }),
  row('a pin covers a token\'s statblock hover with the measure tool', { tool: 'measure', hits: ['pin', 'token'] }, { cursor: 'pointer', hovered: ['pin'] }),
  row('a measurement\'s handle leaves a token its statblock hover with the measure tool', { tool: 'measure', hits: ['measureHandle', 'token'] }, { cursor: 'measure-cursor', hovered: ['measure', 'token'] }),
  row('tokens being placed are the cursor: nothing is hovered', { tool: 'select', hits: ['token', 'light', 'pin'], placing: true }, { hovered: [] }),
  row('the fog tool leaves linked hexes and features alone', { tool: 'fog', hits: ['hexLink', 'mapFeature'] }, { cursor: 'default', hovered: [] }),
];

export const POINTER_TABLE: readonly PointerRow[] = [...PRESSES, ...FINGER_PRESSES, ...CTRL_CLICKS, ...RIGHT_PRESSES, ...TAPS, ...PRESS_ACTS, ...HOVERS];
