import { describe, expect, it } from 'vitest';
import {
  CLOSED, close, closesDiceLog, escapeCloses, escapeClosesQr, keyStaysInControl, makesWay, open, outsidePressCloses, pressClosesQr, surfaceFor, tableChanged, toggle,
  type DockState, type EscapeFacts, type TableFacts,
} from '../../../../src/app/online/gm/dock/dockState.ts';

const NO_TABLE: TableFacts = { running: false, joined: false, lost: false };
const WAITING: TableFacts = { running: true, joined: false, lost: false };
const PLAYING: TableFacts = { running: true, joined: true, lost: false };
const LOST: TableFacts = { running: false, joined: true, lost: true };

const MENU: DockState = { surface: 'menu', alert: false };
const PANEL: DockState = { surface: 'panel', alert: false };

const key = (facts: Partial<EscapeFacts>): EscapeFacts => ({ inThisView: false, inSurface: false, handledElsewhere: false, composing: false, ...facts });

describe('the control opens', () => {
  it('to the menu without a table or before anyone joined, and to the panel once players joined', () => {
    expect(surfaceFor(NO_TABLE)).toBe('menu');
    expect(surfaceFor(WAITING)).toBe('menu');
    expect(surfaceFor(PLAYING)).toBe('panel');
    expect(toggle(CLOSED, NO_TABLE)).toEqual(MENU);
    expect(toggle(CLOSED, PLAYING)).toEqual(PANEL);
  });

  it('closes again on the button, and the Start command leaves an open surface as it is', () => {
    expect(toggle(MENU, WAITING)).toEqual(CLOSED);
    expect(toggle(PANEL, PLAYING)).toEqual(CLOSED);
    expect(open(PANEL, PLAYING)).toBe(PANEL);
    expect(open(CLOSED, WAITING)).toEqual(MENU);
    expect(close(CLOSED)).toBe(CLOSED);
  });

  it('clears the red badge when the GM opens it', () => {
    expect(open({ surface: 'closed', alert: true }, LOST)).toEqual(MENU);
  });
});

describe('the table changes', () => {
  it('turn the open menu into the panel when the first player joins', () => {
    expect(tableChanged(MENU, WAITING, PLAYING)).toEqual(PANEL);
  });

  it('never open a closed control: only the badge tells', () => {
    expect(tableChanged(CLOSED, WAITING, PLAYING)).toEqual(CLOSED);
  });

  it('keep the panel when a player goes away, and send it back to the menu when the table ends', () => {
    expect(tableChanged(PANEL, PLAYING, { running: true, joined: true, lost: false })).toEqual(PANEL);
    expect(tableChanged(PANEL, PLAYING, NO_TABLE)).toEqual(MENU);
    expect(tableChanged(PANEL, PLAYING, LOST)).toEqual(MENU);
  });

  it('turn the badge red when the table is lost while the control is closed, until a new table runs', () => {
    const alerted = tableChanged(CLOSED, PLAYING, LOST);
    expect(alerted).toEqual({ surface: 'closed', alert: true });
    expect(tableChanged(alerted, LOST, LOST)).toBe(alerted);
    expect(tableChanged(alerted, LOST, WAITING)).toEqual(CLOSED);
    expect(tableChanged(MENU, WAITING, LOST)).toEqual(MENU);
  });
});

describe('Escape', () => {
  it('closes the menu when the key belongs to this view and no other control used it', () => {
    expect(escapeCloses('menu', key({ inThisView: true }))).toBe(true);
    expect(escapeCloses('menu', key({ inThisView: true, inSurface: true }))).toBe(true);
    expect(escapeCloses('menu', key({ inThisView: false }))).toBe(false);
    expect(escapeCloses('menu', key({ inThisView: true, handledElsewhere: true }))).toBe(false);
    expect(escapeCloses('menu', key({ inThisView: true, composing: true }))).toBe(false);
  });

  it('closes the panel only while focus is inside it, so Escape on the map still deselects', () => {
    expect(escapeCloses('panel', key({ inThisView: true }))).toBe(false);
    expect(escapeCloses('panel', key({ inThisView: true, inSurface: true }))).toBe(true);
    expect(escapeCloses('panel', key({ inSurface: true, composing: true }))).toBe(false);
  });

  it('does nothing while the control is closed', () => {
    expect(escapeCloses('closed', key({ inThisView: true, inSurface: true }))).toBe(false);
  });
});

describe('presses outside', () => {
  it('close the menu with the left button only, and never the panel', () => {
    expect(outsidePressCloses('menu', { button: 0, inside: false })).toBe(true);
    expect(outsidePressCloses('menu', { button: 2, inside: false })).toBe(false);
    expect(outsidePressCloses('menu', { button: 0, inside: true })).toBe(false);
    expect(outsidePressCloses('panel', { button: 0, inside: false })).toBe(false);
    expect(outsidePressCloses('closed', { button: 0, inside: false })).toBe(false);
  });
});

describe('the QR card', () => {
  it('closes on an Escape for this view that nothing else used, wherever the focus is', () => {
    expect(escapeClosesQr(key({ inThisView: true }))).toBe(true);
    expect(escapeClosesQr(key({ inThisView: true, inSurface: true }))).toBe(true);
    expect(escapeClosesQr(key({ inThisView: false }))).toBe(false);
    expect(escapeClosesQr(key({ inThisView: true, handledElsewhere: true }))).toBe(false);
    expect(escapeClosesQr(key({ inThisView: true, composing: true }))).toBe(false);
  });

  it('closes on a left press outside the control, and stays through a press in it', () => {
    expect(pressClosesQr({ button: 0, inside: false })).toBe(true);
    expect(pressClosesQr({ button: 2, inside: false })).toBe(false);
    expect(pressClosesQr({ button: 0, inside: true })).toBe(false);
  });
});

describe('the dice log and the toolbar editor', () => {
  const quiet = { diceLog: false, toolbarEditing: false };
  it('close the open surface when the log opens or the editor starts', () => {
    expect(makesWay('panel', quiet, { diceLog: true, toolbarEditing: false })).toBe(true);
    expect(makesWay('menu', quiet, { diceLog: false, toolbarEditing: true })).toBe(true);
    expect(makesWay('panel', { diceLog: true, toolbarEditing: false }, { diceLog: true, toolbarEditing: false })).toBe(false);
    expect(makesWay('closed', quiet, { diceLog: true, toolbarEditing: true })).toBe(false);
  });

  it('give way to the control: opening it closes an open dice log', () => {
    expect(closesDiceLog('closed', 'panel', { diceLog: true, toolbarEditing: false })).toBe(true);
    expect(closesDiceLog('closed', 'menu', quiet)).toBe(false);
    expect(closesDiceLog('menu', 'panel', { diceLog: true, toolbarEditing: false })).toBe(false);
  });
});

describe('keys pressed in the control', () => {
  it('stay there unless they carry Cmd, Ctrl or Alt, which reach Atlas and Obsidian', () => {
    expect(keyStaysInControl({ metaKey: false, ctrlKey: false, altKey: false })).toBe(true);
    expect(keyStaysInControl({ metaKey: true, ctrlKey: false, altKey: false })).toBe(false);
    expect(keyStaysInControl({ metaKey: false, ctrlKey: true, altKey: false })).toBe(false);
    expect(keyStaysInControl({ metaKey: false, ctrlKey: false, altKey: true })).toBe(false);
  });
});
