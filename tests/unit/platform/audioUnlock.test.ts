// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetAudioUnlock, resumeOnGesture, watchForGesture, type ResumableContext } from '../../../src/app/sound/engine/audioUnlock';

/** A context that runs once it is resumed, as after a gesture. */
function context(state = 'suspended'): ResumableContext & { state: string; resume: ReturnType<typeof vi.fn<() => Promise<void>>> } {
  const made = {
    state,
    resume: vi.fn(() => {
      made.state = 'running';
      return Promise.resolve();
    }),
  };
  return made;
}

/** A context that stays suspended however often it is asked, as outside a gesture the browser counts. */
function stubborn(): ReturnType<typeof context> {
  const made = context();
  made.resume.mockImplementation(() => Promise.resolve());
  return made;
}

const stops: (() => void)[] = [];
function watch(doc: Document = document): void {
  stops.push(watchForGesture(doc));
}
const gesture = (type: string, doc: Document = document): boolean => doc.dispatchEvent(new Event(type, { bubbles: true }));

afterEach(() => {
  while (stops.length) stops.pop()!();
  resetAudioUnlock();
});

describe('audio unlock', () => {
  it('leaves a context alone until the user does something', () => {
    watch();
    const dice = context();
    resumeOnGesture(dice);
    expect(dice.resume).not.toHaveBeenCalled();
  });

  it.each(['pointerdown', 'pointerup', 'touchend', 'keydown'])('resumes every waiting context on %s', (type) => {
    watch();
    const dice = context();
    const ambience = context();
    resumeOnGesture(dice);
    resumeOnGesture(ambience);

    gesture(type);

    expect(dice.state).toBe('running');
    expect(ambience.state).toBe('running');
  });

  it('resumes a context made after the first gesture at once', () => {
    watch();
    gesture('pointerdown');
    const later = context();
    resumeOnGesture(later);
    expect(later.resume).toHaveBeenCalledOnce();
    expect(later.state).toBe('running');
  });

  it('asks again with each gesture until the context runs, then leaves it alone', async () => {
    watch();
    const dice = stubborn();
    resumeOnGesture(dice);
    // A touch counts only once it ends: the press asks in vain
    gesture('pointerdown');
    expect(dice.resume).toHaveBeenCalledTimes(1);
    dice.resume.mockImplementation(() => {
      dice.state = 'running';
      return Promise.resolve();
    });
    gesture('pointerup');
    expect(dice.resume).toHaveBeenCalledTimes(2);
    await Promise.resolve();

    // Running now: what suspends it later (the sound engine's watchdog) is not undone by a tap
    dice.state = 'suspended';
    gesture('pointerdown');
    gesture('keydown');
    expect(dice.resume).toHaveBeenCalledTimes(2);
  });

  it('never resumes a closed context, and one that already runs only where it stopped before a gesture', () => {
    watch();
    const closed = context('closed');
    const running = context('running');
    resumeOnGesture(closed);
    resumeOnGesture(running);
    gesture('pointerdown');
    expect(closed.resume).not.toHaveBeenCalled();
    expect(running.resume).not.toHaveBeenCalled();
  });

  it('swallows a resume the browser refuses', async () => {
    watch();
    const refused = context();
    refused.resume.mockImplementation(() => Promise.reject(new DOMException('not allowed', 'NotAllowedError')));
    resumeOnGesture(refused);
    expect(() => gesture('pointerdown')).not.toThrow();
    await Promise.resolve();
  });

  it('hears gestures in every watched document, a popout\'s too', () => {
    const popout = document.implementation.createHTMLDocument();
    watch();
    watch(popout);
    const dice = context();
    resumeOnGesture(dice);
    gesture('pointerdown', popout);
    expect(dice.state).toBe('running');
  });

  it('stops listening when told to', () => {
    const stop = watchForGesture(document);
    stop();
    const dice = context();
    resumeOnGesture(dice);
    gesture('pointerdown');
    expect(dice.resume).not.toHaveBeenCalled();
  });

  it('forgets contexts and the gesture when it is reset', () => {
    watch();
    const before = context();
    resumeOnGesture(before);
    gesture('pointerdown');
    resetAudioUnlock();
    const after = context();
    resumeOnGesture(after);
    expect(after.resume).not.toHaveBeenCalled();
  });
});
