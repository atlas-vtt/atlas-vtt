import type { ChatRefusal } from '../protocol/index.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LogView } from './LogState.ts';

/** How long a refusal stays above the message field. */
export const NOTICE_MS = 4000;

const REFUSALS: Readonly<Record<ChatRefusal, string>> = {
  rate: 'You are sending too fast. Wait a moment.',
  text: 'That message cannot be sent.',
  gone: 'That message is gone.',
  whisper: 'Nobody at the table has that name.',
  speaker: 'You cannot speak as that token.',
  roll: 'A roll in that message does not work. Check the dice, or keep the rolls as they were.',
};

/**
 * The line a refusal shows for a moment: each refusal anew, the same reason twice too. `onRefused`
 * hears of each as it arrives; none for a refusal that was there before the panel opened.
 */
export function useRefusalNotice(refusal: LogView['refusal'], onRefused: (reason: ChatRefusal) => void): string | null {
  const seen = useRef(refusal?.n ?? 0);
  const heard = useRef(onRefused);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    heard.current = onRefused;
  });

  useEffect(() => {
    if (refusal === null || refusal.n === seen.current) return undefined;
    seen.current = refusal.n;
    setNotice(REFUSALS[refusal.reason]);
    heard.current(refusal.reason);
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [refusal]);

  return notice;
}

/** A line of the composer's own (a command it cannot read) for `NOTICE_MS`, until it is shown another or none. */
export function useLocalNotice(): readonly [string | null, (message: string | null) => void] {
  const [notice, setNotice] = useState<{ readonly message: string; readonly n: number } | null>(null);
  useEffect(() => {
    if (notice === null) return undefined;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);
  // The same mistake twice shows for its full time again.
  const show = useCallback((message: string | null): void => setNotice((now) => (message === null ? (now === null ? now : null) : { message, n: (now?.n ?? 0) + 1 })), []);
  return [notice?.message ?? null, show];
}
