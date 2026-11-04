// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatEntry, LogEntry } from '../../../../src/app/online/protocol/index.ts';
import { LogState, TableLogPanel, type SpeakerOption } from '../../../../src/app/online/tableLog/index.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ME = 'abcdefghijklmnopqrst';
const KARA = 'kkkkkkkkkkkkkkkkkkkk';
const BEN = 'bbbbbbbbbbbbbbbbbbbb';
const PEOPLE = [{ id: ME, name: 'Ash' }, { id: KARA, name: 'Kara' }, { id: BEN, name: 'Ben' }];
const NAMES: Readonly<Record<string, string>> = { [ME]: 'Ash', [KARA]: 'Kara', [BEN]: 'Ben', gm: 'GM' };
const SPEAKERS: readonly SpeakerOption[] = [{ key: 'self', name: 'Ash', kind: 'self', portrait: null }];
const id = (n: number): string => n.toString(16).padStart(24, '0');
const chat = (n: number, who: string, text: string, answers?: number, extra: Partial<ChatEntry> = {}): ChatEntry => ({
  id: id(n), at: Date.now() - 60_000 + n, who, name: NAMES[who] ?? 'Someone', kind: 'chat', text,
  ...(answers !== undefined && { reply: { id: id(answers), who: KARA, name: 'Kara', preview: 'quoted' } }),
  ...extra,
});

// Kara asks; Ash answers her, the GM answers Ash; Ben talks about something else.
const ROOT = chat(1, KARA, 'Who has the map?');
const MINE = chat(2, ME, 'I do.', 1);
const GMS = chat(3, 'gm', 'It is wet.', 2);
const OTHER = chat(4, BEN, 'Anyone hungry?');

function setup(entries: readonly LogEntry[] = [ROOT, MINE, GMS, OTHER], variant: 'floating' | 'embedded' = 'floating') {
  const state = new LogState(() => ME);
  state.setPeople(PEOPLE);
  state.replace(entries);
  const actions = { say: vi.fn(), roll: vi.fn(), edit: vi.fn(), remove: vi.fn(), react: vi.fn(), clear: vi.fn() };
  const onClose = vi.fn();
  render(<TableLogPanel state={state} actions={actions} self={ME} moderator={false} canSend speakers={SPEAKERS} variant={variant} onClose={onClose} />);
  const field = screen.getByRole('combobox', { name: 'Message' }) as HTMLTextAreaElement;
  return { state, actions, onClose, field };
}

const row = (entry: LogEntry): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`[data-entry="${entry.id}"]`);
  if (found === null) throw new Error(`No row for ${entry.id}`);
  return found;
};
const shownRows = (): string[] => Array.from(document.querySelectorAll<HTMLElement>('[data-entry]')).map((element) => element.dataset.entry ?? '');
const inThread = (): boolean => document.querySelector('.atlas-online-log__thread-bar') !== null;
const textOf = (entry: LogEntry): HTMLElement => row(entry).querySelector<HTMLElement>('.atlas-online-log__text') ?? row(entry);
/** jsdom has no PointerEvent: a pointer event without a pointer type is a finger's. */
const tapTools = (entry: LogEntry): void => {
  fireEvent.pointerDown(row(entry));
  fireEvent.click(textOf(entry));
};
const escape = (target: Element): void => void fireEvent.keyDown(target, { key: 'Escape' });

describe('threads in the table log', () => {
  it('show a pill under a message with answers, counting only those the viewer holds', () => {
    // An answer to a whisper the viewer was not sent starts a thread of its own.
    setup([ROOT, MINE, GMS, OTHER, chat(5, BEN, 'Right.', 40)]);
    const pills = Array.from(document.querySelectorAll('.atlas-online-log__thread-pill'));
    expect(pills.map((pill) => pill.querySelector('.atlas-online-log__thread-count')?.textContent)).toEqual(['2 replies']);
    expect(row(ROOT).contains(pills[0] ?? null)).toBe(true);
    expect(pills[0]?.querySelectorAll('.atlas-online-log__disc')).toHaveLength(2);
  });

  it('open a thread with a click on a message: its root first, the rest of the log gone, the field answering the root', () => {
    const { actions, field } = setup();
    fireEvent.click(textOf(GMS));
    expect(inThread()).toBe(true);
    expect(shownRows()).toEqual([ROOT.id, MINE.id, GMS.id]);
    expect(screen.getByText('2 replies').className).toContain('atlas-online-log__thread-replies');
    expect(document.querySelector('.atlas-online-log__item--root [data-entry]')).toBe(row(ROOT));
    // An answer to the root quotes nothing in its thread; an answer to an answer still does.
    expect(row(MINE).querySelector('.atlas-online-log__quote')).toBeNull();
    expect(row(GMS).querySelector('.atlas-online-log__quote')).not.toBeNull();
    expect(document.querySelector('.atlas-online-log__thread-pill')).toBeNull();
    expect(field.placeholder).toBe('Reply in thread');
    expect(document.querySelector('.atlas-online-log__strip')).toBeNull();
    fireEvent.change(field, { target: { value: 'Then dry it.' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(actions.say).toHaveBeenCalledWith({ text: 'Then dry it.', reply: ROOT.id });
    // A click inside the thread opens nothing more.
    fireEvent.click(textOf(MINE));
    expect(shownRows()).toEqual([ROOT.id, MINE.id, GMS.id]);
  });

  it('open from the pill, from a quote and with Enter on a row, but not from a control, a selection or a finger', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '2 replies' }));
    expect(inThread()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the log' }));
    expect(inThread()).toBe(false);

    fireEvent.click(row(GMS).querySelector('button.atlas-online-log__quote-line') as HTMLElement);
    expect(shownRows()).toEqual([ROOT.id, MINE.id, GMS.id]);
    fireEvent.click(screen.getByRole('button', { name: 'Back to the log' }));

    fireEvent.keyDown(row(OTHER), { key: 'Enter' });
    expect(shownRows()).toEqual([OTHER.id]);
    expect(screen.getByText('No replies yet. Start the thread.')).toBeTruthy();
    escape(row(OTHER));
    expect(inThread()).toBe(false);

    vi.spyOn(document, 'getSelection').mockReturnValue({ toString: () => 'map' } as Selection);
    fireEvent.click(textOf(ROOT));
    expect(inThread()).toBe(false);
    vi.restoreAllMocks();

    tapTools(ROOT);
    expect(inThread()).toBe(false);
    expect(row(ROOT).querySelector('.atlas-online-log__tools')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Thumbs up' }));
    expect(inThread()).toBe(false);
    fireEvent.click(textOf(ROOT), { shiftKey: true });
    expect(inThread()).toBe(false);
  });

  it('answer a picked answer, and take Escape back: the answer, the whisper, the thread, then the panel', () => {
    const { state, actions, onClose, field } = setup();
    fireEvent.click(textOf(ROOT));
    tapTools(GMS);
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect(screen.getByText('Replying to GM')).toBeTruthy();
    expect(row(GMS).classList.contains('is-selected')).toBe(true);
    act(() => state.setWhisperTo([KARA]));

    escape(field);
    expect(screen.queryByText('Replying to GM')).toBeNull();
    expect(row(GMS).classList.contains('is-selected')).toBe(false);
    fireEvent.change(field, { target: { value: 'Noted.' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(actions.say).toHaveBeenLastCalledWith({ text: 'Noted.', reply: ROOT.id, to: [KARA] });
    escape(field);
    expect([state.choices().whisperTo, inThread()]).toEqual([null, true]);
    escape(field);
    expect([inThread(), onClose.mock.calls.length]).toEqual([false, 0]);
    expect(shownRows()).toContain(OTHER.id);
    escape(field);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('take answers as they arrive, count what arrives elsewhere on the way back, and close when its root goes', () => {
    const { state } = setup([ROOT, MINE, OTHER]);
    fireEvent.click(textOf(ROOT));
    act(() => {
      state.receive({ t: 'log-entry', entry: chat(10, BEN, 'Me too.', 1) });
      state.receive({ t: 'log-entry', entry: chat(11, BEN, 'Lunch?') });
      state.receive({ t: 'log-entry', entry: chat(12, ME, 'Soon.') });
    });
    expect(shownRows()).toEqual([ROOT.id, MINE.id, id(10)]);
    expect(screen.getByText('2 replies')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to the log, 1 new' })).toBeTruthy();
    act(() => state.receive({ t: 'log-remove', id: ROOT.id }));
    expect(inThread()).toBe(false);
    expect(shownRows()).toEqual([MINE.id, OTHER.id, id(10), id(11), id(12)]);
  });

  it('answer a whispered root as a whisper, and say so on the field', () => {
    const whisper = chat(1, KARA, 'Only you two.', undefined, { to: [ME, BEN] });
    setup([whisper, chat(2, BEN, 'Understood.', 1, { to: [ME, KARA] })], 'embedded');
    fireEvent.click(textOf(whisper));
    expect(screen.getByText('Replying in thread')).toBeTruthy();
    expect(screen.getByText('Whispering to Kara and Ben')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel reply' })).toBeNull();
  });
});
