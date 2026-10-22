// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatEntry, LogEntry, RollEntry, SharedRoll } from '../../../../src/app/online/protocol/index.ts';
import { LogState, TableLogPanel, type LogActions, type SpeakerOption } from '../../../../src/app/online/tableLog/index.ts';

afterEach(cleanup);

const ME = 'abcdefghijklmnopqrst';
const KARA = 'kkkkkkkkkkkkkkkkkkkk';
const PEOPLE = [{ id: ME, name: 'Ash' }, { id: KARA, name: 'Kara' }];
const SPEAKERS: readonly SpeakerOption[] = [
  { key: 'self', name: 'Ash', kind: 'self', portrait: null },
  { key: 'tok-1', name: 'Brakka', kind: 'token', portrait: null },
];
const BRAKKA = { name: 'Brakka', token: 'tok-1', art: null, ring: null };
const id = (n: number): string => n.toString(16).padStart(24, '0');
const shared = (total: number, formula = '1d20+5'): SharedRoll => ({ id: `r${total}`, timestamp: 0, formula, rolls: [{ die: 'd20', value: total - 5, max: 20 }], modifiers: 5, total });

type Actions = { readonly [K in keyof Required<LogActions>]: ReturnType<typeof vi.fn> };

function setup(entries: readonly LogEntry[] = []): { state: LogState; actions: Actions; field: HTMLTextAreaElement; onClose: ReturnType<typeof vi.fn> } {
  const state = new LogState(() => ME);
  state.setPeople(PEOPLE);
  state.replace(entries);
  const actions = { say: vi.fn(), roll: vi.fn(), edit: vi.fn(), remove: vi.fn(), react: vi.fn(), clear: vi.fn() };
  const onClose = vi.fn();
  render(<TableLogPanel state={state} actions={actions} self={ME} moderator={false} canSend speakers={SPEAKERS} variant="embedded" onClose={onClose} />);
  return { state, actions, field: screen.getByRole('combobox', { name: 'Message' }) as HTMLTextAreaElement, onClose };
}

const typeIn = (field: HTMLTextAreaElement, text: string): void => {
  fireEvent.change(field, { target: { value: text } });
};
const press = (field: HTMLElement, key: string): void => {
  fireEvent.keyDown(field, { key });
};

describe('the composer', () => {
  it('sends a message, and a roll command as a roll with its flavor', () => {
    const { actions, field } = setup();
    typeIn(field, 'Hello');
    press(field, 'Enter');
    expect(actions.say).toHaveBeenCalledWith({ text: 'Hello' });
    expect(field.value).toBe('');
    typeIn(field, '/r 1d20+2 # Spot');
    press(field, 'Escape');
    press(field, 'Enter');
    expect(actions.roll).toHaveBeenCalledWith({ formula: '1d20+2', mode: 'public', flavor: 'Spot' });
  });

  it('takes Escape back step by step: a reply, then the whisper, and only then closes the panel', () => {
    const state = new LogState(() => ME);
    state.setPeople(PEOPLE);
    const message: ChatEntry = { id: id(1), at: 1, who: KARA, name: 'Kara', kind: 'chat', text: 'psst', to: [ME] };
    state.replace([message]);
    state.setWhisperTo([KARA]);
    const onClose = vi.fn();
    const actions = { say: vi.fn(), roll: vi.fn(), edit: vi.fn(), remove: vi.fn(), react: vi.fn(), clear: vi.fn() };
    render(<TableLogPanel state={state} actions={actions} self={ME} moderator={false} canSend speakers={SPEAKERS} variant="floating" onClose={onClose} />);
    const field = screen.getByRole('combobox', { name: 'Message' });
    press(field, 'Escape');
    expect(state.choices().whisperTo).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    press(field, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers the commands for a slash, which the arrow keys and Tab complete, and Escape closes first', () => {
    const { field, onClose } = setup();
    typeIn(field, '/');
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getAllByRole('option')[0]!.textContent).toContain('/r');
    press(field, 'ArrowDown');
    press(field, 'Tab');
    expect(field.value).toBe('/pr ');
    typeIn(field, '/g');
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps a whisper completed from the suggestions as a strip until it is cleared', () => {
    const { state, actions, field } = setup();
    typeIn(field, '/w Ka');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Kara']);
    press(field, 'Enter');
    expect(state.choices().whisperTo).toEqual([KARA]);
    expect(screen.getByText('To Kara')).toBeTruthy();
    typeIn(field, 'psst');
    press(field, 'Enter');
    typeIn(field, 'again');
    press(field, 'Enter');
    expect(actions.say.mock.calls).toEqual([[{ text: 'psst', to: [KARA] }], [{ text: 'again', to: [KARA] }]]);
    fireEvent.click(screen.getByRole('button', { name: 'Stop whispering' }));
    expect(state.choices().whisperTo).toBeNull();
  });

  it('shows what it cannot read, sends nothing and keeps the text', () => {
    const { actions, field } = setup();
    typeIn(field, '/shrug now');
    press(field, 'Enter');
    expect(screen.getByRole('status').textContent).toBe('There is no command /shrug. Type /help to see them all.');
    expect(actions.say).not.toHaveBeenCalled();
    expect(field.value).toBe('/shrug now');
  });

  it('speaks as the token chosen in the speaker menu, and rolls in the mode chosen', () => {
    const { state, actions, field } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Speaking as yourself' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Brakka/ }));
    expect(state.choices().speaker).toBe('tok-1');
    typeIn(field, 'Well met');
    press(field, 'Enter');
    expect(actions.say).toHaveBeenCalledWith({ text: 'Well met', style: 'ic', speaker: 'tok-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Roll mode: Public roll' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /GM only/ }));
    typeIn(field, '/r 1d6 ');
    press(field, 'Enter');
    expect(actions.roll).toHaveBeenCalledWith({ formula: '1d6', mode: 'gm', speaker: 'tok-1' });
  });

  it('opens the help on /help and its button', () => {
    const { field } = setup();
    typeIn(field, '/help');
    press(field, 'Enter');
    expect(screen.getByRole('region', { name: 'Chat help' })).toBeTruthy();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Chat help' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Commands and dice' }));
    expect(screen.getByRole('region', { name: 'Chat help' })).toBeTruthy();
  });
});

describe('a layer over the floating panel', () => {
  it('takes Escape and presses for itself: the panel stays open under an image opened from it', () => {
    const state = new LogState(() => ME);
    const onClose = vi.fn();
    const actions = { say: vi.fn(), roll: vi.fn(), edit: vi.fn(), remove: vi.fn(), react: vi.fn(), clear: vi.fn() };
    render(<TableLogPanel state={state} actions={actions} self={ME} moderator={false} canSend speakers={SPEAKERS} variant="floating" onClose={onClose} />);
    const layer = document.body.appendChild(document.createElement('div'));
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    // jsdom has no PointerEvent: a mouse event of the type carries the button.
    const press = (target: Element): boolean => target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    fireEvent.keyDown(window, { key: 'Escape' });
    press(layer);
    expect(onClose).not.toHaveBeenCalled();
    layer.remove();
    press(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('what the GM showed or handed out', () => {
  it('shows an image by the host\'s source, opens it, and a handed-out item as its loot card', () => {
    const state = new LogState(() => ME);
    const image = { id: id(7), at: 1, who: 'gm', name: 'GM', kind: 'image' as const, image: { hash: 'f'.repeat(64), size: 1, mime: 'image/png' }, width: 4, height: 3 };
    const loot = { id: id(8), at: 2, who: 'gm', name: 'GM', kind: 'loot' as const, item: { name: 'Rope of Climbing', rarity: 'Uncommon', price: '20 gp', description: 'Moves on command.', properties: [{ label: 'Length', value: '60 ft' }] } };
    state.replace([image, loot]);
    const opened = vi.fn();
    const actions = { say: vi.fn(), roll: vi.fn(), edit: vi.fn(), remove: vi.fn(), react: vi.fn(), clear: vi.fn() };
    render(<TableLogPanel state={state} actions={actions} self={ME} moderator={false} canSend speakers={SPEAKERS} variant="embedded" onClose={vi.fn()} imageSrc={() => 'blob:shown'} openImage={opened} />);
    expect(document.querySelector('.atlas-online-log__shown-image')?.getAttribute('src')).toBe('blob:shown');
    fireEvent.click(screen.getByRole('button', { name: 'Open the image' }));
    expect(opened).toHaveBeenCalledWith(image);
    expect(document.querySelector('.atlas-loot-card__name')?.textContent).toBe('Rope of Climbing');
    expect(document.querySelector('.atlas-online-log__loot')?.getAttribute('data-rarity')).toBe('uncommon');
  });
});

describe('rows', () => {
  const chat = (n: number, extra: Partial<ChatEntry>): ChatEntry => ({ id: id(n), at: Date.now(), who: KARA, name: 'Kara', kind: 'chat', text: 'hi', ...extra });

  it('show a whisper with whom it is for, and a token speaking in character with its author', () => {
    setup([chat(1, { text: 'psst', to: [ME, 'gm'] }), chat(2, { text: 'Well met', style: 'ic', speaker: BRAKKA }), chat(3, { text: 'draws her sword', style: 'emote' })]);
    expect(screen.getByText('Whisper to you and GM')).toBeTruthy();
    expect(screen.getByText('Brakka').className).toContain('atlas-online-log__speaker');
    expect(screen.getAllByText('Kara').length).toBeGreaterThan(0);
    expect(screen.getByText('draws her sword', { exact: false }).textContent).toContain('Kara draws her sword');
  });

  it('roll a roll button for the viewer as the speaker chosen, and show a rolled mark\'s total and dice', () => {
    const { state, actions } = setup([chat(1, { text: 'Hit [[1d20+5]], now [[/gmr 1d20+2]]{Dex save}', inline: [shared(19)] })]);
    act(() => state.setSpeaker('tok-1'));
    fireEvent.click(screen.getByRole('button', { name: /Dex save/ }));
    expect(actions.roll).toHaveBeenCalledWith({ formula: '1d20+2', mode: 'gm', request: { id: id(1), index: 1 }, speaker: 'tok-1' });
    const chip = screen.getByRole('button', { name: '19' });
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('d20: 14')).toBeTruthy();
  });

  it('show a roll\'s flavor, who sees it and the button it answers, and a private roll others made as a line', () => {
    const roll: RollEntry = {
      id: id(2), at: Date.now(), who: ME, name: 'Ash', kind: 'roll', token: null, roll: shared(12),
      mode: 'gm', to: ['gm'], flavor: 'Sneak past', request: { id: id(1), label: 'Dex save' },
    };
    setup([roll, { id: id(3), at: Date.now(), who: KARA, name: 'Kara', kind: 'secret', mode: 'blind' }]);
    expect(screen.getByText('Sneak past')).toBeTruthy();
    expect(screen.getByText('GM only')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'for Dex save' })).toBeTruthy();
    expect(screen.getByText('Kara rolled privately')).toBeTruthy();
  });
});
