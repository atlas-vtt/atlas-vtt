import '../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import looks from '../../styles/looks/atlas-looks.css?inline';

const THEME = 'body { margin: 0; background: #1e1e1e; --background-primary: #1e1e1e; --mono-100: #fff; }';

/** What stands between an element and `until` that a backdrop blur cannot see past. */
function backdropRootsBetween(element: Element, until: Element): string[] {
  const roots: string[] = [];
  for (let parent = element.parentElement; parent && parent !== until; parent = parent.parentElement) {
    if (getComputedStyle(parent).backdropFilter !== 'none') roots.push(parent.className);
  }
  return roots;
}

describe('a statblock on the DM screen under Transparency', () => {
  const style = document.createElement('style');
  style.textContent = THEME + looks;
  let wrapper: HTMLElement;
  let card: HTMLElement;
  let preview: HTMLElement;

  beforeEach(() => {
    document.head.append(style);
    document.body.className = 'theme-dark atlas-look atlas-look-glass';
    // The DM screen as `DMScreen` builds it down to a statblock's card, and a hover preview's card beside it.
    wrapper = document.body.createDiv({ cls: 'atlas-dm-screen-wrapper' });
    wrapper.createDiv({ cls: 'atlas-dm-screen-backdrop' });
    card = wrapper.createDiv({ cls: 'atlas-dm-screen' }).createDiv({ cls: 'atlas-dm-screen-content atlas-dm-page' })
      .createDiv({ cls: 'atlas-dm-statblock-feed-item' }).createDiv({ cls: 'atlas-statblock atlas-sb-sheet atlas-sb-sheet--feed' });
    preview = document.body.createDiv({ cls: 'atlas-statblock-preview-window' }).createDiv({ cls: 'atlas-statblock' });
  });

  afterEach(() => {
    wrapper.remove();
    preview.parentElement?.remove();
    style.remove();
    document.body.className = '';
  });

  it('wears the hover preview\'s see-through ground, in either look', () => {
    for (const look of ['', 'atlas-look-scifi']) {
      document.body.className = `theme-dark atlas-look atlas-look-glass ${look}`;
      const [shown, hovered] = [getComputedStyle(card), getComputedStyle(preview)];
      expect(shown.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(shown.backgroundImage).toContain('linear-gradient');
      expect(shown.backgroundImage).toBe(hovered.backgroundImage);
      expect(shown.backgroundSize).toBe(hovered.backgroundSize);
      expect(shown.backgroundOrigin).toBe(hovered.backgroundOrigin);
    }
  });

  it('is blurred by the screen\'s backdrop, never by a blur of its own, which a fading page would leave blind', () => {
    expect(getComputedStyle(preview).backdropFilter).toContain('blur(16px)');
    expect(getComputedStyle(card).backdropFilter).toBe('none');
    expect(backdropRootsBetween(card, wrapper)).toEqual([]);
    expect(getComputedStyle(wrapper.querySelector('.atlas-dm-screen-backdrop')!).backdropFilter).toContain('blur(20px)');
  });

  it('keeps the ground of any statblock card without Transparency', () => {
    const plain = document.body.createDiv({ cls: 'atlas-statblock' });
    const ground = (element: Element): string => getComputedStyle(element).backgroundImage;
    expect(ground(card)).not.toBe(ground(plain));
    document.body.className = 'theme-dark atlas-look atlas-look-scifi';
    expect(ground(plain)).not.toBe('none');
    expect(ground(card)).toBe(ground(plain));
    expect(getComputedStyle(wrapper.querySelector('.atlas-dm-screen-backdrop')!).backdropFilter).toBe('none');
    plain.remove();
  });
});
