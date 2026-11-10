// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { statblockImageAt } from '../../src/app/services/statblockImageTarget';

const openContextMenuGlobal = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal }));

const { ImageDisplayService } = await import('../../src/app/services/ImageDisplayService');

const ART = 'Art/goblin.png';

/** A statblock card as a preview window shows it: its own picture and a token portrait. */
function statblockCard(parent: HTMLElement): { picture: HTMLImageElement; ring: HTMLElement; portraitImage: HTMLImageElement; name: HTMLElement } {
  const card = parent.createDiv({ cls: 'atlas-fantasy-statblock' }).createDiv({ cls: 'atlas-statblock' });
  const picture = card.createEl('img', { cls: 'atlas-sb-portrait-image' });
  const portrait = card.createDiv({ cls: 'atlas-token-portrait' });
  const portraitImage = portrait.createDiv({ cls: 'atlas-token-image-wrapper' }).createEl('img');
  const ring = portrait.createDiv({ cls: 'atlas-token-ring' });
  const name = card.createEl('h2', { cls: 'atlas-sb-heading', text: 'Goblin' });
  return { picture, ring, portraitImage, name };
}

afterEach(() => {
  document.body.empty();
  openContextMenuGlobal.mockReset();
});

describe('which images on Atlas UI can be shown to the players', () => {
  it('takes a statblock\'s pictures, under a token ring too', () => {
    const { picture, ring, portraitImage, name } = statblockCard(document.body.createDiv({ cls: 'atlas-statblock-preview-window' }));
    expect(statblockImageAt(picture)).toBe(picture);
    expect(statblockImageAt(ring)).toBe(portraitImage);
    expect(statblockImageAt(name)).toBeNull();
  });

  it('leaves Atlas\' own images alone outside a statblock', () => {
    const card = document.body.createDiv({ cls: 'atlas-asset-card' });
    const portrait = card.createDiv({ cls: 'atlas-token-portrait' });
    const image = portrait.createEl('img');
    expect(statblockImageAt(image)).toBeNull();
    expect(statblockImageAt(portrait)).toBeNull();
  });
});

describe('the image menu on a statblock preview', () => {
  function rightClick(target: HTMLElement): MouseEvent {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }

  function service(): InstanceType<typeof ImageDisplayService> {
    const { app } = createInMemoryApp({ files: { [ART]: '' } });
    const images = new ImageDisplayService(app);
    images.registerContextMenu();
    return images;
  }

  it('offers to show a statblock\'s picture to the players', () => {
    const images = service();
    const { picture } = statblockCard(document.body.createDiv({ cls: 'atlas-statblock-preview-window' }));
    picture.src = `app://local/${ART}`;

    expect(rightClick(picture).defaultPrevented).toBe(true);
    const [entries] = openContextMenuGlobal.mock.calls[0] as [Array<{ label: string }>];
    expect(entries.map((entry) => entry.label)).toContain('Display on player view');
    images.destroy();
  });

  it('resolves only a statblock picture from the vault, so a picture from the web leaves the statblock\'s own menu', () => {
    const images = service();
    const { picture, name } = statblockCard(document.body.createDiv());
    picture.src = `app://local/${ART}`;
    expect(images.statblockImageFileAt(picture)?.file.path).toBe(ART);
    expect(images.statblockImageFileAt(name)).toBeNull();

    picture.src = 'https://example.com/goblin.png';
    expect(images.statblockImageFileAt(picture)).toBeNull();
    expect(rightClick(picture).defaultPrevented).toBe(false);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
    images.destroy();
  });

  it('keeps out of a statblock menu that took the click, and of Atlas\' own images', () => {
    const images = service();
    const { picture } = statblockCard(document.body.createDiv());
    picture.src = `app://local/${ART}`;
    picture.addEventListener('contextmenu', (e) => e.preventDefault());
    rightClick(picture);

    const token = document.body.createDiv({ cls: 'atlas-asset-card' }).createEl('img');
    token.src = `app://local/${ART}`;
    rightClick(token);

    expect(openContextMenuGlobal).not.toHaveBeenCalled();
    images.destroy();
  });
});
