// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdHeadingInView } from '../../src/app/services/headingScroll';

const SCROLLER_TOP = 100;
const FRAME_MS = 16;

interface FakeNote {
  container: HTMLElement;
  scroller: HTMLElement;
  /** Draws the heading `offset` px below the start of the note's content. */
  draw: (offset: number) => HTMLElement;
  /** Where the drawn heading sits relative to the scroller's top. */
  headingTop: () => number;
  /** The drawn heading, or null before `draw`. */
  find: () => HTMLElement | null;
}

/** A note view without layout: the heading's place follows the scroll and the offset it was drawn at. */
function fakeNote(): FakeNote {
  const container = document.body.createDiv();
  const scroller = container.createDiv({ cls: 'cm-scroller' });
  let scrollTop = 0;
  let headingOffset = 0;
  Object.defineProperty(scroller, 'scrollTop', {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = Math.max(0, value);
    },
  });
  scroller.getBoundingClientRect = () => ({ top: SCROLLER_TOP }) as DOMRect;
  return {
    container,
    scroller,
    draw: (offset) => {
      headingOffset = offset;
      const heading = scroller.querySelector<HTMLElement>('.HyperMD-header') ?? scroller.createDiv({ cls: 'cm-line HyperMD-header', text: 'Rooms' });
      heading.getBoundingClientRect = () => ({ top: SCROLLER_TOP + headingOffset - scrollTop }) as DOMRect;
      return heading;
    },
    headingTop: () => SCROLLER_TOP + headingOffset - scrollTop - SCROLLER_TOP,
    find: () => scroller.querySelector<HTMLElement>('.HyperMD-header'),
  };
}

describe('holdHeadingInView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.empty();
  });

  it('follows the heading while the view corrects the heights of the lines above it', () => {
    const note = fakeNote();
    const heading = note.draw(5000);
    const onSettled = vi.fn();
    holdHeadingInView({ container: note.container, findHeading: note.find, scrollToLine: vi.fn() }, onSettled);

    vi.advanceTimersByTime(FRAME_MS);
    expect(note.headingTop()).toBe(0);
    note.draw(4700);
    vi.advanceTimersByTime(FRAME_MS * 10);

    expect(note.headingTop()).toBe(0);
    expect(onSettled).toHaveBeenCalledWith(heading);
  });

  it('scrolls to the line until the view draws the heading', () => {
    const note = fakeNote();
    const scrollToLine = vi.fn();
    const onSettled = vi.fn();
    holdHeadingInView({ container: note.container, findHeading: note.find, scrollToLine }, onSettled);

    vi.advanceTimersByTime(FRAME_MS * 2);
    expect(scrollToLine).toHaveBeenCalledTimes(3);
    expect(onSettled).not.toHaveBeenCalled();

    note.draw(3000);
    vi.advanceTimersByTime(FRAME_MS * 10);
    expect(note.headingTop()).toBe(0);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('gives up after a second when the heading is never drawn', () => {
    const note = fakeNote();
    const onSettled = vi.fn();
    holdHeadingInView({ container: note.container, findHeading: note.find, scrollToLine: vi.fn() }, onSettled);

    vi.advanceTimersByTime(FRAME_MS * 70);
    expect(onSettled).toHaveBeenCalledWith(null);
  });

  it('leaves the scroll to the reader once they scroll', () => {
    const note = fakeNote();
    note.draw(5000);
    const onSettled = vi.fn();
    holdHeadingInView({ container: note.container, findHeading: note.find, scrollToLine: vi.fn() }, onSettled);

    note.scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    expect(onSettled).toHaveBeenCalledTimes(1);
    note.scroller.scrollTop = 1200;
    vi.advanceTimersByTime(FRAME_MS * 10);
    expect(note.scroller.scrollTop).toBe(1200);
  });

  it('stops without settling when cancelled', () => {
    const note = fakeNote();
    note.draw(5000);
    const onSettled = vi.fn();
    const cancel = holdHeadingInView({ container: note.container, findHeading: note.find, scrollToLine: vi.fn() }, onSettled);

    cancel();
    vi.advanceTimersByTime(FRAME_MS * 10);
    expect(onSettled).not.toHaveBeenCalled();
    expect(note.scroller.scrollTop).toBe(0);
  });
});
