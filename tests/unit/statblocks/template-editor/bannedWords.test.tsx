// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeSession, sampleTemplate } from './editorKit';
import { mountEditor, tileOptions } from './sidePanesKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Words the default layer never says (spec §1, J10); More options and Advanced may, each explained. */
const BANNED = ['key', 'keys', 'field', 'fields', 'pattern', 'class', 'meaning', 'role', 'roles', 'slot', 'slots', 'frontmatter', 'yaml', 'feed', 'pane', 'look'];

function bannedIn(text: string): string[] {
  // "Armor Class" is a statblock's own word, not the CSS kind.
  const words = text.toLowerCase().replace(/armou?r class/g, '').split(/[^a-z]+/).filter(Boolean);
  return BANNED.filter((word) => words.includes(word));
}

/** Text a person reads, and the names assistive technology reads. */
function said(element: Element): string {
  const names = [...element.querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label') ?? '');
  return `${element.textContent ?? ''} ${names.join(' ')}`;
}

describe('the template editor\'s default layer (J10)', () => {
  it('says none of the words of the data model: card chrome, toolbar, tile menu, Options and the dock', () => {
    const { frame } = mountEditor(new FakeSession(sampleTemplate()), { menus: true });
    fireEvent.click(frame('stat-ac1'));
    const toolbar = document.querySelector('.atlas-te-toolbar')!;
    expect(bannedIn(said(toolbar))).toEqual([]);

    act(() => { fireEvent.contextMenu(frame('stat-hp1')); });
    const menu = screen.getByRole('menu');
    expect(bannedIn(said(menu))).toEqual([]);
    fireEvent.keyDown(menu, { key: 'Escape' });

    fireEvent.click(frame('stat-ac1'));
    expect(bannedIn(said(tileOptions()))).toEqual([]);
    expect(bannedIn(said(document.querySelector('.atlas-te-capsule')!))).toEqual([]);
    expect(bannedIn(said(document.querySelector('.atlas-te-dock')!))).toEqual([]);
  });
});
