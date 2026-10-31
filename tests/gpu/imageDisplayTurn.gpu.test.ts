import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../src/app/services/image-display.scss?inline';
import { applyShownImageLayout, DEFAULT_SHOWN_IMAGE_LAYOUT, type ShownImageLayout } from '../../src/app/services/shownImageLayout';

/** A landscape picture twice as wide as high, at `width` pixels. */
const landscape = (width: number): string =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width / 2}"><rect width="100%" height="100%" fill="#c33"/></svg>`)}`;

/** The overlay as ImageDisplayService builds it, in a 1200 × 600 window turned by `rotation`. */
async function display(rotation: number, width: number, layout: ShownImageLayout = DEFAULT_SHOWN_IMAGE_LAYOUT): Promise<DOMRect> {
  await page.viewport(1200, 600);
  // As the player window marks its body (PlayerWindowService)
  document.body.dataset.tvRotation = String(rotation);
  document.body.style.setProperty('--atlas-tv-rotation', `${rotation}deg`);
  const overlay = document.body.appendChild(document.createElement('div'));
  overlay.className = 'atlas-image-display';
  applyShownImageLayout(overlay, layout);
  const turn = overlay.appendChild(document.createElement('div'));
  turn.className = 'atlas-image-display__turn';
  const stage = turn.appendChild(document.createElement('div'));
  stage.className = 'atlas-image-display__stage';
  const image = stage.appendChild(document.createElement('img'));
  image.className = 'atlas-image-display__image';
  image.src = landscape(width);
  await image.decode();
  return image.getBoundingClientRect();
}

describe('an image displayed on the player view of a turned table TV', () => {
  const style = document.createElement('style');
  style.textContent = css;
  afterEach(() => {
    document.body.replaceChildren();
    document.body.removeAttribute('data-tv-rotation');
    document.body.style.removeProperty('--atlas-tv-rotation');
    style.remove();
  });

  it.each([0, 90, 180, 270])('turned by %i°, a large image is capped at nine tenths of the view as players see it, centred', async (rotation) => {
    document.head.append(style);
    const shown = await display(rotation, 2400);
    const sideways = rotation === 90 || rotation === 270;
    // Unturned, as before these settings: 90 % of 1200 × 600 meets the 2 : 1 image at 1080 × 540.
    // Sideways the players' view is 600 × 1200, whose 540 px width holds a 540 × 270 image, standing on the window
    const [across, along] = sideways ? [shown.height, shown.width] : [shown.width, shown.height];
    expect(across).toBeCloseTo(sideways ? 540 : 1080, 0);
    expect(along).toBeCloseTo(sideways ? 270 : 540, 0);
    expect(shown.left + shown.width / 2).toBeCloseTo(600, 0);
    expect(shown.top + shown.height / 2).toBeCloseTo(300, 0);
  });

  it('keeps a small image at its own size', async () => {
    document.head.append(style);
    const shown = await display(90, 400);
    expect([shown.width, shown.height].map(Math.round)).toEqual([200, 400]);
  });

  it.each([
    // place, size, rotation, then where the image lies in the 1200 × 600 window
    ['top-left', 0.5, 0, { left: 32, top: 32 }],
    ['bottom-right', 0.5, 0, { right: 1168, bottom: 568 }],
    // As the players see it: on a TV turned half round, their top is the window's bottom
    ['top', 0.5, 180, { centreX: 600, bottom: 568 }],
  ] as const)('places the image %s at %s of the view, turned %i°', async (place, size, rotation, at) => {
    document.head.append(style);
    const shown = await display(rotation, 2400, { place, size });
    // Half the view each way is 600 × 300, which the 2 : 1 image fills
    expect([shown.width, shown.height].map(Math.round)).toEqual([600, 300]);
    if ('left' in at) expect(shown.left).toBeCloseTo(at.left, 0);
    if ('top' in at) expect(shown.top).toBeCloseTo(at.top, 0);
    if ('right' in at) expect(shown.right).toBeCloseTo(at.right, 0);
    if ('bottom' in at) expect(shown.bottom).toBeCloseTo(at.bottom, 0);
    if ('centreX' in at) expect(shown.left + shown.width / 2).toBeCloseTo(at.centreX, 0);
  });
});
