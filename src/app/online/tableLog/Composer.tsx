import { MAX_CHAT_TEXT, type ChatRefusal, type TablePerson } from '../protocol/index.ts';
import { ArrowUp, CircleHelp } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactElement, type RefObject } from 'react';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { audienceNames } from './audience.ts';
import { chosenSpeaker, parseComposerInput } from './chatCommands.ts';
import { classes } from './classes.ts';
import type { Suggestion } from './commandSuggestions.ts';
import { SuggestionList, useSuggestions } from './SuggestionList.tsx';
import { RollModeMenu, SpeakerMenu } from './ComposerChoices.tsx';
import { ComposerStrip } from './ComposerStrips.tsx';
import { isComposing, useGrowingField } from './growField.ts';
import { HelpCard } from './HelpCard.tsx';
import type { LogState, LogView } from './LogState.ts';
import type { ChatDraft, RollDraft, SpeakerOption } from './panelTypes.ts';
import { useLocalNotice, useRefusalNotice } from './useRefusalNotice.ts';

/** From this many characters left, the field says how many. */
const COUNTER_FROM = 50;

export interface ComposerProps {
  readonly field: RefObject<HTMLTextAreaElement | null>;
  /** Keeps what is typed and chosen and not sent while the panel is closed. */
  readonly state: LogState;
  readonly self: string | null;
  readonly people: readonly TablePerson[];
  readonly speakers: readonly SpeakerOption[];
  readonly canSend: boolean;
  readonly offlineText: string;
  readonly refusal: LogView['refusal'];
  /**
   * The entry the next message answers, how the strip names it, and whom the GM whispers the answer
   * to (null: everyone). `thread`: it is the root of the thread shown, answered without a strip
   * unless the answer is whispered.
   */
  readonly reply: { readonly id: string; readonly label: string; readonly whisper: string | null; readonly thread?: true } | null;
  /** The viewer's newest chat message in the log: tells whether what was sent last has arrived. */
  readonly lastOwn: string | null;
  /** Who `/reply` whispers to. */
  readonly lastWhisper: readonly string[] | null;
  readonly onClearReply: () => void;
  readonly onSay: (draft: ChatDraft) => void;
  readonly onRoll: (draft: RollDraft) => void;
  /** Opens the viewer's newest message for editing; false where there is none. */
  readonly onEditLast: () => boolean;
  /** Where the composer puts its own Escape, which closes what it has open (true) for the panel to ask first. */
  readonly escapeRef: RefObject<(() => boolean) | null>;
}

type Menu = 'speaker' | 'mode' | null;

/**
 * The message field under the list: Enter sends what is typed (a message, or one of Foundry's
 * commands), Shift+Enter breaks the line, and it grows to five lines. Beside it, who speaks and who
 * sees rolls; on top, what a message answers and whom messages are whispered to. A slash offers the
 * commands. A refusal or a mistake shows for a moment above it; a message refused for its pace is
 * put back into the empty field.
 */
export function Composer(props: ComposerProps): ReactElement {
  const { field, state, self, people, speakers, canSend, offlineText, refusal, reply, lastOwn, lastWhisper, onClearReply, onSay, onRoll, onEditLast, escapeRef } = props;
  const name = useId();
  const listId = useId();
  const choices = useSyncExternalStore(state.subscribe, state.choices);
  const [draft, setDraft] = useState(() => state.draft);
  const [menu, setMenu] = useState<Menu>(null);
  const [help, setHelp] = useState(false);
  useEffect(() => state.keepDraft(draft), [state, draft]);
  const sent = useRef<{ readonly text: string; readonly lastOwn: string | null } | null>(null);
  useGrowingField(field, draft);
  const suggestions = useSuggestions(draft, people, self);
  const [mistake, showMistake] = useLocalNotice();
  const speaker = chosenSpeaker(speakers, choices.speaker);
  const whisperTo = choices.whisperTo;

  const onRefused = useCallback((reason: ChatRefusal): void => {
    const last = sent.current;
    sent.current = null;
    // Only a message that has not arrived was the one refused: a reaction or an edit may be refused for its pace as well.
    if (reason === 'rate' && last !== null && last.lastOwn === lastOwn) setDraft((now) => (now === '' ? last.text : now));
  }, [lastOwn]);
  const notice = useRefusalNotice(refusal, onRefused);

  const toField = (): void => field.current?.focus({ preventScroll: true });
  const type = (text: string): void => {
    setDraft(text);
    showMistake(null);
  };

  const send = (): void => {
    if (!canSend) return;
    const intent = parseComposerInput(draft, { self, people, rollMode: choices.rollMode, speaker, lastWhisper, whisperTo });
    if (intent.kind === 'nothing') return;
    if (intent.kind === 'error') return showMistake(intent.message);
    if (intent.kind === 'help') setHelp(true);
    else if (intent.kind === 'audience') state.setWhisperTo(intent.to);
    else if (intent.kind === 'roll') onRoll(intent.draft);
    else {
      onSay(reply === null ? intent.draft : { ...intent.draft, reply: reply.id });
      sent.current = { text: draft.trim(), lastOwn };
    }
    type('');
    toField();
  };

  const complete = (item: Suggestion): void => {
    if (item.kind === 'command') type(item.insert);
    else {
      state.setWhisperTo([...new Set([...(whisperTo ?? []), item.id])]);
      type('');
    }
    toField();
  };

  // What Escape closes in here, innermost first.
  useEffect(() => {
    escapeRef.current = (): boolean => {
      if (menu !== null) setMenu(null);
      else if (suggestions.open) suggestions.dismiss();
      else if (help) setHelp(false);
      else return false;
      return true;
    };
  });

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (isComposing(event)) return;
    const active = suggestions.open ? suggestions.items[suggestions.active] : undefined;
    if (active !== undefined && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      suggestions.move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (active !== undefined && (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey))) {
      event.preventDefault();
      if (event.key === 'Enter' && active.kind === 'command' && active.sendsAsTyped) send();
      else complete(active);
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    } else if (event.key === 'ArrowUp' && draft === '' && onEditLast()) event.preventDefault();
  };

  const choose = (change: () => void): void => {
    change();
    setMenu(null);
    toField();
  };

  const left = MAX_CHAT_TEXT - draft.length;
  const warning = mistake ?? notice;
  const line = warning ?? (canSend ? null : offlineText);
  const listOpen = suggestions.open && canSend;
  const whisperLabel = whisperTo === null ? null : audienceNames(whisperTo, people, self);
  const placeholder = whisperLabel !== null ? `Whisper to ${whisperLabel}` : speaker?.kind === 'token' ? `Speak as ${speaker.name}` : reply?.thread === true ? 'Reply in thread' : 'Message the table';
  return (
    <div className="atlas-online-log__composer">
      {help && <HelpCard onClose={() => { setHelp(false); toField(); }} />}
      {line !== null && <div className={classes('atlas-online-log__notice', warning !== null && 'atlas-online-log__notice--refused')} role="status">{line}</div>}
      <div className={classes('atlas-online-log__composer-box', !canSend && 'is-disabled')}>
        {listOpen && <SuggestionList id={listId} list={suggestions} onComplete={complete} />}
        {reply !== null && (reply.thread !== true || reply.whisper !== null) && (
          <ComposerStrip text={reply.label} whisper={reply.whisper} clear={reply.thread === true ? undefined : { label: 'Cancel reply', onClear: onClearReply }} />
        )}
        {whisperLabel !== null && (reply === null || reply.whisper === null) && (
          <ComposerStrip text={`To ${whisperLabel}`} locked clear={{ label: 'Stop whispering', onClear: () => { state.setWhisperTo(null); toField(); } }} />
        )}
        <div className="atlas-online-log__field">
          {speakers.length > 1 && speaker !== null && (
            <SpeakerMenu
              speakers={speakers} chosen={speaker} self={self} open={menu === 'speaker'} disabled={!canSend}
              onOpenChange={(open) => setMenu(open ? 'speaker' : null)} onChoose={(key) => choose(() => state.setSpeaker(key))}
            />
          )}
          <RollModeMenu
            mode={choices.rollMode} open={menu === 'mode'} disabled={!canSend}
            onOpenChange={(open) => setMenu(open ? 'mode' : null)} onChoose={(mode) => choose(() => state.setRollMode(mode))}
          />
          <label className="atlas-online-log__sr" htmlFor={name}>Message</label>
          <textarea
            ref={field} id={name} className="atlas-online-log__input" rows={1} maxLength={MAX_CHAT_TEXT} placeholder={placeholder}
            role="combobox" aria-autocomplete="list" aria-expanded={listOpen} aria-controls={listOpen ? listId : undefined}
            aria-activedescendant={listOpen ? `${listId}-${suggestions.active}` : undefined}
            disabled={!canSend} value={draft} onChange={(event) => type(event.target.value)} onKeyDown={onKeyDown}
          />
          {left <= COUNTER_FROM && <span className="atlas-online-log__counter">{left}</span>}
          <LabelTooltip label="Commands and dice">
            <button type="button" className="atlas-online-log__chip-button" aria-expanded={help} onClick={() => setHelp(!help)}><CircleHelp /></button>
          </LabelTooltip>
          <LabelTooltip label="Send">
            <button type="button" className="atlas-online-log__send" disabled={!canSend || draft.trim() === ''} onClick={send}><ArrowUp /></button>
          </LabelTooltip>
        </div>
      </div>
    </div>
  );
}
