import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactElement } from 'react';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { lastWhisperAudience } from './audience.ts';
import { chosenSpeaker } from './chatCommands.ts';
import { Composer } from './Composer.tsx';
import { answerable, composerReply } from './composerReply.ts';
import { LogHeader } from './LogHeader.tsx';
import { LogList } from './LogList.tsx';
import type { ChatDraft, RowApi, TableLogPanelProps } from './panelTypes.ts';
import { ThreadBar } from './ThreadBar.tsx';
import { useLogScroll } from './useLogScroll.ts';
import { useLogThread } from './useLogThread.ts';
import { useLogUi } from './useLogUi.ts';
import { usePanelDismissal } from './usePanelDismissal.ts';
import { useViewSwap } from './useViewSwap.ts';

const OFFLINE_TEXT = 'You cannot write right now.';

/** Whether fingers are the pointer: focusing a field would raise the on-screen keyboard. */
function isCoarse(doc: Document): boolean {
  const told = doc.documentElement.dataset.pointer;
  return told === undefined ? doc.defaultView?.matchMedia('(pointer: coarse)').matches === true : told === 'coarse';
}

/**
 * The table's log: chat, rolls and who came and left, oldest at the top, with the message field
 * under it. It shows what `state` holds and sends what the viewer does through `actions`; nothing
 * changes here before the log says so. Mounted, it counts as open (`state.setOpen`). A click on a
 * message shows its thread in the panel's place: its root, the answers under it, and the message
 * field answering the root unless an answer is picked.
 */
export function TableLogPanel(props: TableLogPanelProps): ReactElement {
  const { state, actions, self, moderator, canSend, offlineText, rollFace, speakers, speakerPortrait, imageSrc, openImage, openFound, variant, onClose } = props;
  const { entries, refusal, people } = useSyncExternalStore(state.subscribe, state.snapshot);
  const root = useRef<HTMLElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const jumpAfterSwap = useRef<string | null>(null);
  const composerEscape = useRef<(() => boolean) | null>(null);
  const titleId = useId();
  const [ui, act] = useLogUi();
  const [pinned, setPinned] = useState(false);
  const [clearing, setClearing] = useState(false);
  const thread = useLogThread(entries, self);
  const scroll = useLogScroll(thread.shown, self, thread.root);
  const floating = variant === 'floating';
  useViewSwap(view, thread.root);

  const latest = useRef({ actions, onClose, speakers, entries });
  useEffect(() => {
    latest.current = { actions, onClose, speakers, entries };
  });

  useEffect(() => {
    state.setOpen(true);
    return () => state.setOpen(false);
  }, [state]);

  // Opened with Enter, the next thing a person does is type.
  const typesAtOnce = useRef(canSend);
  useLayoutEffect(() => {
    const element = field.current;
    if (typesAtOnce.current && element !== null && !isCoarse(element.ownerDocument)) element.focus({ preventScroll: true });
  }, []);

  // In a thread the message field answers its root, unless the viewer picked an answer in it.
  const replied = answerable(entries, ui.replyTo) ?? answerable(entries, thread.root);
  const picked = replied !== undefined && replied.id !== thread.root ? replied.id : null;
  const editing = thread.shown.some((entry) => entry.id === ui.editing && entry.kind === 'chat' && entry.who === self) ? ui.editing : null;
  const lastOwn = thread.shown.findLast((entry) => entry.kind === 'chat' && entry.who === self)?.id ?? null;

  const { center } = scroll;
  const { open, close: closeView } = thread;
  const closeThread = useCallback((): void => {
    closeView();
    act.reply(null);
  }, [closeView, act]);

  // A jump out of a thread lands once the whole log shows again.
  useLayoutEffect(() => {
    const id = jumpAfterSwap.current;
    jumpAfterSwap.current = null;
    if (id !== null && center(id)) act.highlight(id);
  }, [thread.root, center, act]);

  const api = useMemo<RowApi>(() => {
    const toField = (): void => field.current?.focus({ preventScroll: true });
    return {
      self,
      moderator,
      canSend,
      react: (id, emoji, on) => latest.current.actions.react(id, emoji, on),
      roll: (draft) => {
        const speaker = chosenSpeaker(latest.current.speakers, state.choices().speaker);
        latest.current.actions.roll(speaker?.kind === 'token' ? { ...draft, speaker: speaker.key } : draft);
      },
      reply: (id) => {
        act.reply(id);
        toField();
      },
      edit: (id) => act.edit(id),
      saveEdit: (id, text) => {
        latest.current.actions.edit(id, text);
        act.edit(null);
        toField();
      },
      cancelEdit: () => {
        act.edit(null);
        toField();
      },
      askDelete: (id) => act.ask(id),
      remove: (id) => {
        act.ask(null);
        latest.current.actions.remove(id);
      },
      tap: (id) => act.tap(id),
      jumpTo: (id) => {
        if (center(id)) act.highlight(id);
        else if (thread.root !== null && latest.current.entries.some((entry) => entry.id === id)) {
          jumpAfterSwap.current = id;
          closeThread();
        }
      },
      thread: thread.root,
      openThread: (id) => {
        if (open(id) === null) return;
        act.reply(null);
        act.tap(null);
      },
    };
  }, [self, moderator, canSend, state, act, center, thread.root, open, closeThread]);

  const editLast = useCallback((): boolean => {
    if (lastOwn === null) return false;
    act.edit(lastOwn);
    return true;
  }, [act, lastOwn]);

  /** What Escape undoes, innermost first; false where the panel has no use for the key. */
  const escape = useCallback((): boolean => {
    if (composerEscape.current?.() === true) return true;
    if (editing !== null) api.cancelEdit();
    else if (ui.asking !== null || clearing) {
      act.ask(null);
      setClearing(false);
    } else if (picked !== null) act.reply(null);
    else if (state.choices().whisperTo !== null) state.setWhisperTo(null);
    else if (thread.root !== null) closeThread();
    else if (floating && !pinned) latest.current.onClose();
    else return false;
    return true;
  }, [editing, ui.asking, clearing, picked, state, thread.root, closeThread, floating, pinned, api, act]);

  const close = useCallback((): void => latest.current.onClose(), []);
  usePanelDismissal(root, floating && !pinned, escape, close);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
      if (escape()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // A sheet around the panel closes on the Escape the panel has no use for.
      if (!floating) return;
    }
    // Keys typed in the panel never reach the map's shortcuts behind it.
    if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
  };

  const say = useCallback((draft: ChatDraft): void => {
    latest.current.actions.say(draft);
    act.reply(null);
    act.tap(null);
  }, [act]);

  const clear = actions.clear === undefined ? undefined : (): void => {
    setClearing(false);
    latest.current.actions.clear?.();
  };

  return (
    <TooltipProvider delayDuration={300}>
      <section ref={root} className={`atlas-vtt-plugin atlas-online-log atlas-online-log--${variant}`} aria-labelledby={floating ? titleId : undefined} onKeyDown={onKeyDown}>
        {floating && <LogHeader titleId={titleId} pinned={pinned} asking={clearing} onClear={clear} onAsk={setClearing} onPin={setPinned} onClose={close} />}
        <div ref={view} className="atlas-online-log__view">
          {thread.root !== null && <ThreadBar replies={thread.shown.length - 1} unseen={thread.unseen} onBack={closeThread} />}
          <LogList
            entries={thread.shown} stats={thread.stats} selected={picked} ui={{ ...ui, editing }} api={api} scroll={scroll}
            rollFace={rollFace} speakerPortrait={speakerPortrait} people={people} imageSrc={imageSrc} openImage={openImage} openFound={openFound} onTabStop={act.tabStop}
          />
        </div>
        <Composer
          field={field} state={state} self={self} people={people} speakers={speakers} canSend={canSend} offlineText={offlineText ?? OFFLINE_TEXT}
          refusal={refusal} lastOwn={lastOwn} lastWhisper={lastWhisperAudience(entries, self)} escapeRef={composerEscape}
          reply={composerReply(replied, thread.root, self, people)}
          onClearReply={() => act.reply(null)} onSay={say} onRoll={(draft) => latest.current.actions.roll(draft)} onEditLast={editLast}
        />
      </section>
    </TooltipProvider>
  );
}
