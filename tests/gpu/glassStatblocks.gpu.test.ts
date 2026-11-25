import '../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import looks from '../../styles/looks/atlas-looks.css?inline';

/** The DM screen's backdrop as `dm-screen.scss` blurs it under any theme: the looks must leave it alone. */
const THEME = `
  body { margin: 0; background: #1e1e1e; --background-primary: #1e1e1e; --background-secondary: #262626; --mono-100: #fff; }
  .atlas-dm-screen-backdrop { backdrop-filter: blur(4px); }
`;

/** What stands between an element and `until` that a backdrop blur cannot see past. */
function backdropRootsBetween(element: Element, until: Element): string[] {
  const roots: string[] = [];
  for (let parent = element.parentElement; parent && parent !== until; parent = parent.parentElement) {
    if (getComputedStyle(parent).backdropFilter !== 'none') roots.push(parent.className);
  }
  return roots;
}

/** The opacity of the first colour of an element's see-through ground, the one at its head. */
function headAlpha(element: Element): number {
  const ground = getComputedStyle(element).backgroundImage;
  const gradient = ground.slice(ground.lastIndexOf('linear-gradient('));
  return Number(/^linear-gradient\((?:to bottom, )?[a-z]+\([^)]*\/\s*([\d.]+)\)/.exec(gradient)?.[1]);
}

describe('the DM screen under Transparency', () => {
  const style = document.createElement('style');
  style.textContent = THEME + looks;
  let wrapper: HTMLElement;
  let card: HTMLElement;
  let rail: HTMLElement;
  let preview: HTMLElement;
  const backdropBlur = (): string => getComputedStyle(wrapper.querySelector('.atlas-dm-screen-backdrop')!).backdropFilter;

  beforeEach(() => {
    document.head.append(style);
    document.body.className = 'theme-dark atlas-look atlas-look-glass';
    // The DM screen as `DMScreen` builds it, down to a statblock's card and the Sound page's rail, and a hover preview's card beside it.
    wrapper = document.body.createDiv({ cls: 'atlas-dm-screen-wrapper' });
    wrapper.createDiv({ cls: 'atlas-dm-screen-backdrop' });
    const stage = wrapper.createDiv({ cls: 'atlas-dm-screen' }).createDiv({ cls: 'atlas-dm-screen-stage' });
    card = stage.createDiv({ cls: 'atlas-dm-screen-content atlas-dm-page' })
      .createDiv({ cls: 'atlas-dm-statblock-feed-item' }).createDiv({ cls: 'atlas-statblock atlas-sb-sheet atlas-sb-sheet--feed' });
    rail = stage.createDiv({ cls: 'atlas-dm-sound-page atlas-dm-page' }).createDiv({ cls: 'atlas-sound-pane' }).createDiv({ cls: 'atlas-sound-lib atlas-sound-side' });
    preview = document.body.createDiv({ cls: 'atlas-statblock-preview-window' }).createDiv({ cls: 'atlas-statblock' });
  });

  afterEach(() => {
    wrapper.remove();
    preview.parentElement?.remove();
    style.remove();
    document.body.className = '';
  });

  it('leaves the screen\'s backdrop as light on either page as without it', () => {
    expect(backdropBlur()).toBe('blur(4px)');
    document.body.className = 'theme-dark atlas-look atlas-look-scifi';
    expect(backdropBlur()).toBe('blur(4px)');
  });

  it('has a statblock wear a see-through ground at its head, denser than a hover preview\'s, in either look', () => {
    for (const look of ['', 'atlas-look-scifi']) {
      document.body.className = `theme-dark atlas-look atlas-look-glass ${look}`;
      const shown = getComputedStyle(card);
      expect(shown.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(shown.backgroundSize).toBe(getComputedStyle(preview).backgroundSize);
      expect(headAlpha(card)).toBeLessThan(1);
      expect(headAlpha(card)).toBeGreaterThan(headAlpha(preview));
    }
  });

  it('gives a statblock no blur of its own, which its masked grid would leave blind', () => {
    expect(getComputedStyle(preview).backdropFilter).toContain('blur(16px)');
    expect(getComputedStyle(card).backdropFilter).toBe('none');
  });

  it('blurs the Sound page\'s rail from the rail\'s own surface, once the screen and its page have faded in', () => {
    expect(backdropRootsBetween(rail, wrapper)).toEqual([]);
    const settle = rail.getAnimations()[0]!;
    const timing = settle.effect!.getComputedTiming();
    // The screen fades in over 250 ms and a page over 340 ms: under a fading parent the blur would see nothing.
    expect(timing.delay).toBeGreaterThanOrEqual(340);
    expect(getComputedStyle(rail).backdropFilter).toBe('blur(0px) saturate(1)');
    settle.finish();
    expect(getComputedStyle(rail).backdropFilter).toBe('blur(16px) saturate(1.2)');
    expect(Number(/\/\s*([\d.]+)\)$/.exec(getComputedStyle(rail).backgroundColor)?.[1])).toBeLessThan(1);
  });

  it('keeps the ground of any statblock card and a rail without a blur where Transparency is off', () => {
    const plain = document.body.createDiv({ cls: 'atlas-statblock' });
    const ground = (element: Element): string => getComputedStyle(element).backgroundImage;
    expect(ground(card)).not.toBe(ground(plain));
    document.body.className = 'theme-dark atlas-look atlas-look-scifi';
    expect(ground(plain)).not.toBe('none');
    expect(ground(card)).toBe(ground(plain));
    expect(getComputedStyle(rail).backdropFilter).toBe('none');
    plain.remove();
  });
});
