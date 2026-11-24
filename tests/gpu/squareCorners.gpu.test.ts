import { afterEach, expect, it } from 'vitest';
import css from '../../styles/main.scss?inline';
import portraitCss from '../../src/app/packages/components/shared/token-portrait.scss?inline';

/** A tool group's chevron (its radius is `!important`), a token portrait and a button, styled by the real stylesheets. */
const UI = `
  <div class="atlas-vtt-plugin">
    <div class="atlas-vtt-toolbar atlas-main-toolbar">
      <div class="atlas-tool-group"><button class="btn atlas-tool-group__chevron">v</button></div>
    </div>
    <button class="btn btn--default">Done</button>
    <div class="atlas-token-portrait" style="width: 100px"><div class="atlas-token-image-wrapper"></div></div>
  </div>
`;

const radius = (selector: string): string => getComputedStyle(document.querySelector(selector)!).borderTopLeftRadius;

afterEach(() => {
  document.body.className = '';
  document.body.innerHTML = '';
  document.head.querySelectorAll('style').forEach((style) => style.remove());
});

it('draws every corner of Atlas square, the !important ones too, and keeps a token round inside its ring', () => {
  for (const sheet of [css, portraitCss]) document.head.append(Object.assign(document.createElement('style'), { textContent: sheet }));
  document.body.innerHTML = UI;
  expect(radius('.atlas-tool-group__chevron')).not.toBe('0px');
  expect(radius('.btn--default')).not.toBe('0px');

  document.body.classList.add('atlas-square-corners');
  expect(radius('.atlas-tool-group__chevron')).toBe('0px');
  expect(radius('.btn--default')).toBe('0px');
  expect(radius('.atlas-token-image-wrapper')).toBe('50%');
});
