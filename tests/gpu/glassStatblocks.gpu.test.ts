import '../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import looks from '../../styles/looks/atlas-looks.css?inline';

/** The DM screen's backdrop as `dm-screen.scss` blurs it under any theme. */
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

  it('blurs the map behind the whole screen as a hover preview blurs it, on either page alike', () => {
    // One backdrop for both pages, whichever is shown: turning a page changes nothing behind the panes.
    expect(wrapper.querySelectorAll('.atlas-dm-screen-backdrop')).toHaveLength(1);
    expect(backdropBlur()).toBe('blur(20px) saturate(1.2)');
    wrapper.querySelector('.atlas-dm-sound-page')!.setAttribute('hidden', '');
    expect(backdropBlur()).toBe('blur(20px) saturate(1.2)');
    document.body.className = 'theme-dark atlas-look atlas-look-scifi';
    expect(backdropBlur()).toBe('blur(4px)');
  });

  it('has a statblock wear the hover preview\'s see-through ground, in either look', () => {
    for (const look of ['', 'atlas-look-scifi']) {
      document.body.className = `theme-dark atlas-look atlas-look-glass ${look}`;
      const [shown, hovered] = [getComputedStyle(card), getComputedStyle(preview)];
      expect(shown.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(shown.backgroundImage).toContain('linear-gradient');
      expect(shown.backgroundImage).toBe(hovered.backgroundImage);
      expect(shown.backgroundSize).toBe(hovered.backgroundSize);
    }
  });

  it('leaves the blurring to the backdrop: a statblock and the Sound page\'s rail have none of their own, which a fading screen or page would leave blind', () => {
    expect(getComputedStyle(preview).backdropFilter).toContain('blur(16px)');
    for (const part of [card, rail]) {
      expect(getComputedStyle(part).backdropFilter).toBe('none');
      expect(part.getAnimations()).toEqual([]);
      expect(backdropRootsBetween(part, wrapper)).toEqual([]);
    }
    expect(Number(/\/\s*([\d.]+)\)$/.exec(getComputedStyle(rail).backgroundColor)?.[1])).toBeLessThan(1);
  });

  it('keeps the ground of any statblock card where Transparency is off', () => {
    const plain = document.body.createDiv({ cls: 'atlas-statblock' });
    const ground = (element: Element): string => getComputedStyle(element).backgroundImage;
    expect(ground(card)).not.toBe(ground(plain));
    document.body.className = 'theme-dark atlas-look atlas-look-scifi';
    expect(ground(plain)).not.toBe('none');
    expect(ground(card)).toBe(ground(plain));
    plain.remove();
  });
});
