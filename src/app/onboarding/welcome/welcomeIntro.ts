import { createContext, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { getLocale, t } from '../../i18n';
import type { MessageKey } from '../../i18n/types';

/** The heading the opening spells out, letter by letter: the first slide's. */
export const INTRO_TITLE: MessageKey = 'tour.welcome.slides.welcome.title';

/** One word of a heading as the letters it is drawn in, with the place of its first letter in the heading, or the space between two words. */
export type TitlePart = { word: readonly string[]; first: number } | { space: string };

/** When each part of the opening starts, in ms after the dialog mounts. */
export interface IntroTimeline {
  lettersAt: number;
  letterStagger: number;
  bodyAt: number;
  footAt: number;
  /** The opening is over: the slides' clock starts. */
  endMs: number;
}

/** What the dialog tells its pages: whether the opening still plays, and when it ends. */
export interface IntroState {
  playing: boolean;
  endMs: number;
}

export const WelcomeIntro = createContext<IntroState>({ playing: false, endMs: 0 });

const LETTERS_AT_MS = 850;
const LETTER_STAGGER_MS = 38;
// A long translation spreads its letters over no more time than this, so the opening never drags.
const LETTERS_SPREAD_MAX_MS = 700;
const BODY_AFTER_LAST_LETTER_MS = 320;
const FOOT_AFTER_BODY_MS = 460;
const FOOT_MS = 640;

/** Words of `text` as their letters (graphemes, so accents and CJK characters stay whole), with the spaces kept. */
export function titleParts(text: string): TitlePart[] {
  const letters = new Intl.Segmenter(getLocale(), { granularity: 'grapheme' });
  const parts: TitlePart[] = [];
  let first = 0;
  for (const { segment } of new Intl.Segmenter(getLocale(), { granularity: 'word' }).segment(text)) {
    if (/^\s+$/.test(segment)) {
      parts.push({ space: segment });
      continue;
    }
    const word = Array.from(letters.segment(segment), (letter) => letter.segment);
    parts.push({ word, first });
    first += word.length;
  }
  return parts;
}

export function introTimeline(letterCount: number): IntroTimeline {
  const letterStagger = Math.min(LETTER_STAGGER_MS, LETTERS_SPREAD_MAX_MS / Math.max(1, letterCount - 1));
  const bodyAt = LETTERS_AT_MS + (letterCount - 1) * letterStagger + BODY_AFTER_LAST_LETTER_MS;
  const footAt = bodyAt + FOOT_AFTER_BODY_MS;
  return { lettersAt: LETTERS_AT_MS, letterStagger, bodyAt, footAt, endMs: footAt + FOOT_MS };
}

const letterCount = (parts: readonly TitlePart[]): number => parts.reduce((sum, part) => sum + ('word' in part ? part.word.length : 0), 0);

interface WelcomeIntroRun {
  /** The dialog opened with the opening; stays set while it is open, so nothing the opening animated starts again. */
  opening: boolean;
  state: IntroState;
  /** The timeline as the custom properties `intro.scss` reads. */
  style: React.CSSProperties;
}

/** Plays the opening once per dialog, from its mount; none under reduced motion. */
export function useWelcomeIntro(reducedMotion: boolean): WelcomeIntroRun {
  const [opening] = useState(!reducedMotion);
  const timeline = useMemo(() => introTimeline(letterCount(titleParts(t(INTRO_TITLE)))), []);
  const [playing, setPlaying] = useState(opening);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setPlaying(false), timeline.endMs);
    return () => window.clearTimeout(timer);
  }, [playing, timeline]);
  const state = useMemo(() => ({ playing, endMs: timeline.endMs }), [playing, timeline]);
  const style = {
    '--atlas-intro-letters-at': `${timeline.lettersAt}ms`,
    '--atlas-intro-letter-stagger': `${timeline.letterStagger}ms`,
    '--atlas-intro-body-at': `${timeline.bodyAt}ms`,
    '--atlas-intro-foot-at': `${timeline.footAt}ms`,
    '--atlas-intro-end': `${timeline.endMs}ms`,
  } as React.CSSProperties;
  return { opening, state, style };
}
