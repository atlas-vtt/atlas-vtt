import '../setup/obsidianDom';
import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ARM_MS } from '../../src/app/online/gm/armedCards.ts';
import { common as commonDe } from '../../src/app/i18n/locales/de/common';
import { common as commonEn } from '../../src/app/i18n/locales/en/common';
import { common as commonEs } from '../../src/app/i18n/locales/es/common';
import { common as commonFr } from '../../src/app/i18n/locales/fr/common';
import { common as commonIt } from '../../src/app/i18n/locales/it/common';
import { common as commonPt } from '../../src/app/i18n/locales/pt/common';
import { common as commonRu } from '../../src/app/i18n/locales/ru/common';
import { common as commonZh } from '../../src/app/i18n/locales/zh/common';
import { gmScreen as de } from '../../src/app/i18n/locales/de/gmScreen';
import { gmScreen as en } from '../../src/app/i18n/locales/en/gmScreen';
import { gmScreen as es } from '../../src/app/i18n/locales/es/gmScreen';
import { gmScreen as fr } from '../../src/app/i18n/locales/fr/gmScreen';
import { gmScreen as it_ } from '../../src/app/i18n/locales/it/gmScreen';
import { gmScreen as pt } from '../../src/app/i18n/locales/pt/gmScreen';
import { gmScreen as ru } from '../../src/app/i18n/locales/ru/gmScreen';
import { gmScreen as zh } from '../../src/app/i18n/locales/zh/gmScreen';
import { QUIET } from '../../src/app/online/gm/dock/qrDrawing.ts';
import { accountRig } from '../unit/online/gm/accountRig.ts';
import { control, dmScreen, handTimers, scriptedSession, type Theme } from './gmScreenRig.ts';

type Texts = Readonly<Record<string, unknown>>;
const LANGUAGES: readonly (readonly [string, Texts, Texts])[] = [['en', en, commonEn], ['de', de, commonDe], ['es', es, commonEs], ['fr', fr, commonFr], ['it', it_, commonIt], ['pt', pt, commonPt], ['ru', ru, commonRu], ['zh', zh, commonZh]];
const PHONE = 'p'.repeat(20);

/** A text of the language, its `{name}` filled in, its plural taken as `other`. */
const said = (texts: Texts, key: string): string => {
  const value = texts[key];
  const text = typeof value === 'string' ? value : (value as { other: string }).other;
  return text.replace('{name}', 'Sidekick').replace('{count}', '12').replace('{device}', 'iPhone');
};

let teardown = (): void => undefined;
afterEach(() => teardown());

const px = (value: string): number => Number.parseFloat(value);
const rect = (element: Element): DOMRect => element.getBoundingClientRect();

/** Whether `element` shows all its words: nothing cut and nothing run past its box. */
const whole = (element: HTMLElement): boolean => element.scrollWidth <= element.clientWidth + 0.5 && element.scrollHeight <= element.clientHeight + 0.5;

/** The panel running, with one device connected and one asking, its devices section opened and its code shown or still hidden. */
async function running(theme: Theme, code: 'shown' | 'hidden' = 'shown'): Promise<HTMLElement> {
  const view = await dmScreen(theme);
  teardown = view.remove;
  const timers = handTimers();
  const { session, relay } = scriptedSession(timers, 'https://play.long-name.example.com');
  const account = accountRig('bearer-token');
  await account.control.refresh();
  control(view.leaf, session, account);
  act(() => screen.getByRole('button', { name: 'Start Sidekick' }).click());
  await act(async () => document.querySelector<HTMLButtonElement>('.atlas-gm-screen-start')!.click());
  await expect.poll(() => document.querySelector('.atlas-gm-screen-code[data-status="online"]')).not.toBeNull();
  for (const [id, name] of [[PHONE, 'iPhone Fabian'], ['t'.repeat(20), 'iPad']] as const) {
    await act(async () => {
      relay.gate?.knocked({ id, name });
      await expect.poll(() => session.view().knock?.check).not.toBeNull();
      timers.advance(ARM_MS);
    });
    if (id !== PHONE) break;
    await act(async () => {
      session.allow(id);
      relay.events?.joined({ id, name });
    });
  }
  act(() => document.querySelector<HTMLButtonElement>('.atlas-gm-screen-devices__toggle')!.click());
  if (code === 'shown') act(() => document.querySelector<HTMLButtonElement>('.atlas-gm-screen-qr__reveal')!.click());
  await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished));
  return document.querySelector<HTMLElement>('.atlas-gm-screen-panel')!;
}

describe.each<Theme>(['dark', 'light'])('Sidekick\'s panel laid out by the real stylesheet, %s', (theme) => {
  it('stands its content at one inset with one gap, rounds the surface and what is inside it on the scale, and clips nothing', async () => {
    const panel = await running(theme);
    const body = panel.querySelector<HTMLElement>('.atlas-gm-screen-panel__body')!;
    const style = getComputedStyle(body);
    expect(rect(panel).width).toBe(368);
    expect([style.paddingTop, style.paddingLeft, style.paddingRight, style.paddingBottom, style.rowGap].map(px)).toEqual([12, 12, 12, 12, 12]);
    expect(px(getComputedStyle(panel).borderTopLeftRadius)).toBe(15.5);
    // No title and no cross: its control names it right above, and a press outside or Escape closes it
    expect(panel.querySelector('header, .atlas-close-button, [aria-label="Close"]')).toBeNull();
    const children = [...body.children].map(rect);
    for (let index = 1; index < children.length; index++) expect(children[index]!.top - children[index - 1]!.bottom).toBeCloseTo(12, 0);
    for (const inner of ['.atlas-gm-screen-allow', '.atlas-gm-screen-qr', '.atlas-gm-screen-link', '.atlas-gm-screen-device']) {
      expect(px(getComputedStyle(panel.querySelector(inner)!).borderTopLeftRadius), inner).toBe(10);
    }
    const row = getComputedStyle(panel.querySelector('.atlas-gm-screen-device')!);
    expect([row.paddingTop, row.paddingLeft, row.columnGap].map(px)).toEqual([8, 8, 8]);
    expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
    for (const text of panel.querySelectorAll<HTMLElement>('.atlas-gm-screen-device__name, .atlas-gm-screen-device__state, .atlas-gm-screen-link__url, .btn')) expect(whole(text), text.textContent ?? '').toBe(true);
  });

  it('draws the code as wide as the panel\'s content, at its buttons\' inset, with its quiet zone, on white, its icon rounded in the middle', async () => {
    const panel = await running(theme);
    const card = panel.querySelector<HTMLElement>('.atlas-gm-screen-qr')!;
    const svg = card.querySelector('svg')!;
    // The panel's content box: its width less its border and the inset its buttons stand at, on either side
    const body = panel.querySelector<HTMLElement>('.atlas-gm-screen-panel__body')!;
    const inner = body.clientWidth - 2 * 12;
    expect(inner).toBeGreaterThan(330);
    expect(rect(card).width).toBeCloseTo(inner, 0);
    expect(rect(card).height).toBeCloseTo(rect(card).width, 0);
    expect(rect(card).left - rect(body).left).toBeCloseTo(12, 0);
    // New link and Stop stand at the end of the panel: their outer edge is as far in as the code's
    const buttons = [...panel.querySelectorAll<HTMLElement>('.atlas-gm-screen-panel .btn')];
    expect(rect(body).right - rect(buttons.at(-1)!).right, 'the buttons\' inset').toBeCloseTo(rect(body).right - rect(card).right, 0);
    expect(rect(svg).width).toBeCloseTo(inner, 0);
    expect(getComputedStyle(card).backgroundColor).toBe('rgb(255, 255, 255)');
    const side = svg.viewBox.baseVal.width;
    const module = rect(svg).width / side;
    // A phone held at arm's length reads modules of 4 px and more on a laptop screen; level M keeps them near 5. The quiet zone is 4 of them.
    expect(module).toBeGreaterThanOrEqual(4.5);
    const finder = rect(svg.querySelectorAll('path')[1]!);
    expect(finder.left - rect(card).left).toBeCloseTo(QUIET * module, 0);
    expect(finder.top - rect(card).top).toBeCloseTo(QUIET * module, 0);
    // The icon stands in a light ring of two modules, and is drawn from 128 px, sharp at a screen's twice and three times.
    const icon = rect(svg.querySelector('image')!);
    expect(icon.width).toBeGreaterThanOrEqual(24);
    expect(icon.width * 3).toBeLessThanOrEqual(128);
    expect(svg.querySelector('clipPath rect')?.getAttribute('rx')).not.toBe('0');
  });

  it.each(LANGUAGES)('hides the code until pressed, blurred past reading under a press whose words stay whole, in %s', async (_, texts) => {
    const panel = await running(theme, 'hidden');
    const card = panel.querySelector<HTMLElement>('.atlas-gm-screen-qr')!;
    expect(getComputedStyle(card.querySelector(':scope > svg')!).filter).toMatch(/^blur\(\d+px\)$/);
    const press = card.querySelector<HTMLElement>('.atlas-gm-screen-qr__reveal')!;
    expect([rect(press).width, rect(press).height].map(Math.round)).toEqual([rect(card).width, rect(card).height].map(Math.round));
    const label = press.querySelector<HTMLElement>('.atlas-gm-screen-qr__reveal-label')!;
    label.lastChild!.textContent = said(texts, 'gmScreen.showQr');
    expect(whole(label), label.textContent ?? '').toBe(true);
    expect(rect(label).width).toBeLessThan(rect(card).width * 0.8);
    expect(getComputedStyle(label.querySelector('svg')!).filter, 'the eye stays sharp').toBe('none');
  });

  it.each(LANGUAGES)('keeps the line under the code to one line and every label whole in %s', async (_, texts, common) => {
    const panel = await running(theme);
    const caption = panel.querySelector<HTMLElement>('.atlas-gm-screen-caption')!;
    const line = caption.getBoundingClientRect().height;
    caption.textContent = said(texts, 'gmScreen.scan');
    expect(caption.getBoundingClientRect().height, caption.textContent).toBe(line);
    expect(caption.scrollWidth).toBeLessThanOrEqual(caption.clientWidth);
    const labels: readonly (readonly [string, string])[] = [
      ['.atlas-gm-screen-panel__actions .btn:first-child', said(texts, 'gmScreen.newLink')],
      ['.atlas-gm-screen-stop', said(texts, 'gmScreen.stop')],
      ['.atlas-gm-screen-allow__actions .btn:first-child', said(texts, 'gmScreen.refuse')],
      ['.atlas-gm-screen-allow__actions .btn:last-child', said(texts, 'gmScreen.allow')],
      ['.atlas-gm-screen-link__note', said(texts, 'gmScreen.copyFailed')],
      ['.atlas-gm-screen-device__state', said(texts, 'gmScreen.seenMinutes')],
      ['.atlas-gm-screen-devices__toggle .atlas-gm-screen-section-label', said(texts, 'gmScreen.devices')],
    ];
    for (const [selector, text] of labels) {
      const element = panel.querySelector<HTMLElement>(selector)!;
      element.textContent = text;
      expect(whole(element), `${selector}: ${text}`).toBe(true);
    }
    // New link and Stop take a press once the prompt above them has stood a moment.
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, ARM_MS + 50)));
    act(() => panel.querySelector<HTMLElement>('.atlas-gm-screen-panel__actions .btn:first-child')!.click());
    const ask = panel.querySelector<HTMLElement>('.atlas-gm-screen-confirm')!;
    ask.querySelector('p')!.textContent = said(texts, 'gmScreen.newLinkConfirm');
    const [cancel, confirmNew] = [...ask.querySelectorAll<HTMLElement>('.btn')];
    cancel!.textContent = said(common, 'common.cancel');
    confirmNew!.textContent = said(texts, 'gmScreen.newLink');
    for (const element of [cancel!, confirmNew!]) expect(whole(element), element.textContent ?? '').toBe(true);
    expect(ask.scrollWidth).toBeLessThanOrEqual(ask.clientWidth);
    act(() => panel.querySelector<HTMLElement>('.atlas-gm-screen-device__remove')!.click());
    const confirm = panel.querySelector<HTMLElement>('.atlas-gm-screen-device__remove')!;
    confirm.textContent = said(texts, 'gmScreen.confirmRemove');
    expect(whole(confirm)).toBe(true);
    expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
  });
});
