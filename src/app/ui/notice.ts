import { Notice } from 'obsidian';
import { animateNotice } from './noticeMotion';

/** Marks a notice as Atlas' own: `styles/_notices.scss` gives it the look of Atlas' floating surfaces. */
export const ATLAS_NOTICE_CLASS = 'atlas-notice';

/**
 * A message beside the map, in Atlas' look. It is Obsidian's notice, so it stacks with the others,
 * goes on a click and after its time, and shows in the window that is active; `duration` is
 * Obsidian's (milliseconds, 0 stays until dismissed). Every message Atlas shows goes through here:
 * a lint rule keeps `new Notice` out of every other file.
 */
export function showNotice(message: string | DocumentFragment, duration?: number): Notice {
  const notice = duration === undefined ? new Notice(message) : new Notice(message, duration);
  // Absent only where Obsidian itself is stood in for.
  const el = notice.containerEl as HTMLElement | undefined;
  if (el) {
    el.classList.add(ATLAS_NOTICE_CLASS);
    animateNotice(notice);
  }
  return notice;
}

/**
 * A notice that offers one thing to do about it (Undo, Open): the message, then a link that does it and
 * closes the notice. `duration` should leave time to read the message and reach the link.
 */
export function showNoticeWithAction(text: string, actionLabel: string, onAction: () => void, duration: number): Notice {
  const message = createFragment();
  message.append(`${text} `);
  const link = createEl('a', { text: actionLabel, href: '#' });
  message.append(link);
  const notice = showNotice(message, duration);
  link.addEventListener('click', (event) => {
    event.preventDefault();
    notice.hide();
    onAction();
  });
  return notice;
}
