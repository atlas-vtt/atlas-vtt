// @vitest-environment jsdom
import React from 'react';
import { act, render, type RenderResult } from '@testing-library/react';
import { MarkdownRenderer, type App } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { plainText } from '../../../../src/app/creatures/creatureValues';
import { StatblockMarkdown } from '../../../../src/app/statblocks/render/shared/StatblockMarkdown';
import { decodeStatblockLinks } from '../../../../src/app/services/statblockLinks';

const WIKI = '<STATBLOCK-WIKI-LINK>Senses/Scent|scent<STATBLOCK-WIKI-LINK>';
const MARKDOWN = '<STATBLOCK-MARKDOWN-LINK>rules/my skills.md#Perception|Perception<STATBLOCK-MARKDOWN-LINK>';
/** `[Perception](<rules/my skills.md>)`: Fantasy Statblocks keeps the angle brackets in the marker. */
const BRACKETED = '<STATBLOCK-MARKDOWN-LINK><rules/my skills.md>|Perception<STATBLOCK-MARKDOWN-LINK>';

describe('links of bestiary values', () => {
  it('reads as the note wrote them', () => {
    expect(decodeStatblockLinks(`${WIKI} 30 feet, ${MARKDOWN} +7`))
      .toBe('[[Senses/Scent|scent]] 30 feet, [Perception](<rules/my skills.md#Perception>) +7');
    expect(decodeStatblockLinks('<STATBLOCK-MARKDOWN-LINK>rules/a.md<STATBLOCK-MARKDOWN-LINK>')).toBe('[](rules/a.md)');
    expect(decodeStatblockLinks('<STATBLOCK-MARKDOWN-LINK>https://x.com "Site"|site<STATBLOCK-MARKDOWN-LINK>'))
      .toBe('[site](https://x.com "Site")');
  });

  it('keeps a bracketed destination in one pair of brackets', () => {
    expect(decodeStatblockLinks(BRACKETED)).toBe('[Perception](<rules/my skills.md>)');
    expect(decodeStatblockLinks('<STATBLOCK-MARKDOWN-LINK><rules/Grappled.md><STATBLOCK-MARKDOWN-LINK>'))
      .toBe('[](<rules/Grappled.md>)');
  });

  it('read as the words they show', () => {
    expect(plainText(`${WIKI}, ${MARKDOWN}`)).toBe('scent, Perception');
    expect(plainText('<STATBLOCK-MARKDOWN-LINK>rules/Grappled.md<STATBLOCK-MARKDOWN-LINK>')).toBe('Grappled');
    expect(plainText(`${BRACKETED} +7`)).toBe('Perception +7');
    expect(plainText('<STATBLOCK-MARKDOWN-LINK><rules/Grappled.md#Escape><STATBLOCK-MARKDOWN-LINK>')).toBe('Grappled');
  });
});

describe('StatblockMarkdown links', () => {
  let openLinkText: Mock<(target: string, source: string, pane: unknown) => Promise<void>>;
  let app: App;

  beforeEach(() => {
    openLinkText = vi.fn(() => Promise.resolve());
    app = { workspace: { openLinkText } } as unknown as App;
    vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_app, markdown, el) => {
      const link = el.ownerDocument.createElement('a');
      link.className = 'internal-link';
      link.setAttribute('data-href', 'rules/my skills.md#Perception');
      link.textContent = markdown;
      el.appendChild(link);
      return Promise.resolve();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderLink(): { view: RenderResult; link: HTMLAnchorElement } {
    const view = render(<StatblockMarkdown text={MARKDOWN} app={app} sourcePath="Bestiary/Goblin.md" />);
    return { view, link: view.container.querySelector('a')! };
  }

  function press(link: HTMLAnchorElement, type: 'click' | 'auxclick', init: MouseEventInit = {}): MouseEvent {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
    act(() => { link.dispatchEvent(event); });
    return event;
  }

  it('render as links, and a click opens the note in a new tab', () => {
    const { link } = renderLink();
    expect(vi.mocked(MarkdownRenderer.render).mock.calls[0]![1]).toBe('[Perception](<rules/my skills.md#Perception>)');

    expect(press(link, 'click').defaultPrevented).toBe(true);
    expect(openLinkText).toHaveBeenCalledWith('rules/my skills.md#Perception', 'Bestiary/Goblin.md', 'tab');
  });

  it('opens a middle click in a new tab and leaves other buttons alone', () => {
    const { link } = renderLink();
    press(link, 'auxclick', { button: 2 });
    expect(openLinkText).not.toHaveBeenCalled();

    expect(press(link, 'auxclick', { button: 1 }).defaultPrevented).toBe(true);
    expect(openLinkText).toHaveBeenCalledOnce();
    expect(openLinkText).toHaveBeenCalledWith('rules/my skills.md#Perception', 'Bestiary/Goblin.md', 'tab');
  });

  it("opens where Obsidian's modifiers ask", () => {
    const { link } = renderLink();
    press(link, 'click', { ctrlKey: true, altKey: true });
    expect(openLinkText).toHaveBeenCalledWith('rules/my skills.md#Perception', 'Bestiary/Goblin.md', 'split');
  });

  it('leaves links inside a rendered note to Obsidian', () => {
    for (const root of ['markdown-preview-view', 'cm-content']) {
      const note = document.body.createDiv({ cls: root });
      const view = render(<StatblockMarkdown text={MARKDOWN} app={app} sourcePath="Bestiary/Goblin.md" />, { container: note });
      const event = press(view.container.querySelector('a')!, 'click');
      expect(event.defaultPrevented).toBe(false);
      view.unmount();
      note.remove();
    }
    expect(openLinkText).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', () => {
    const { view, link } = renderLink();
    const host = link.parentElement!;
    view.unmount();
    host.appendChild(link);
    press(link, 'click');
    press(link, 'auxclick', { button: 1 });
    expect(openLinkText).not.toHaveBeenCalled();
  });

  it('shows links as their words where markdown is off', () => {
    const { container } = render(<StatblockMarkdown text={`${WIKI} 30 feet, ${BRACKETED}`} app={app} markdown={false} />);
    expect(container.textContent).toBe('scent 30 feet, Perception');
  });
});
