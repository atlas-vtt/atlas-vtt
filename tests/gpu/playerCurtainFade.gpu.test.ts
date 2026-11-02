import '../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import css from '../../src/app/services/player-window.scss?inline';
import { CURTAIN_DOWN_MS, showPlayerCurtain } from '../../src/app/services/playerCurtain';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The curtain's fade in a document of its own, as the player window is: the sheet lies over the
 * players' picture from the window's own stylesheet and the animation runs on that document.
 */
describe("the curtain's fade", () => {
  let frame: HTMLIFrameElement;
  let doc: Document;
  const openWindow = (): void => {
    frame = document.body.appendChild(document.createElement('iframe'));
    const win = frame.contentWindow as Window & typeof globalThis;
    doc = win.document;
    doc.head.appendChild(doc.createElement('style')).textContent = css;
    doc.body.classList.add('atlas-player-window');
    const own = Element.prototype as unknown as Record<string, unknown>;
    const theirs = win.Element.prototype as unknown as Record<string, unknown>;
    for (const name of ['createDiv', 'toggleClass']) theirs[name] = own[name];
  };
  const opacity = (): number => Number(frame.contentWindow!.getComputedStyle(doc.querySelector('.atlas-player-curtain')!).opacity);

  beforeEach(() => {
    openWindow();
    showPlayerCurtain(doc, false);
  });

  afterEach(() => frame.remove());

  it('fades down and up, starting gently and ending where the class says', async () => {
    expect(opacity()).toBe(0);
    showPlayerCurtain(doc, true);
    expect(opacity()).toBeLessThan(0.05);
    await wait(CURTAIN_DOWN_MS / 2);
    const halfway = opacity();
    expect(halfway).toBeGreaterThan(0.1);
    expect(halfway).toBeLessThan(0.98);
    await wait(CURTAIN_DOWN_MS / 2 + 120);
    expect(opacity()).toBe(1);

    showPlayerCurtain(doc, false);
    await wait(100);
    const lifting = opacity();
    expect(lifting).toBeGreaterThan(0.02);
    expect(lifting).toBeLessThan(1);
    await wait(600);
    expect(opacity()).toBe(0);
  });

  it('turns back from where it is when the GM changes course', async () => {
    showPlayerCurtain(doc, true);
    await wait(CURTAIN_DOWN_MS / 2);
    const turned = opacity();
    showPlayerCurtain(doc, false);
    const after = opacity();
    expect(Math.abs(after - turned)).toBeLessThan(0.1);
    expect(after).toBeGreaterThan(0.05);
    await wait(650);
    expect(opacity()).toBe(0);
  });

  it('comes up at once in a window restored with the curtain down', () => {
    frame.remove();
    openWindow();
    showPlayerCurtain(doc, true);
    expect(opacity()).toBe(1);
  });
});
