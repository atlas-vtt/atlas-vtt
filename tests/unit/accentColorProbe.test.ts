import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getObsidianAccentColor } from '../../src/app/pixi/utils/colorUtils';

/** How many elements came into or left the body while `run` ran. */
async function bodyChangesDuring(run: () => void): Promise<number> {
  let changes = 0;
  const observer = new MutationObserver((records) => {
    for (const record of records) changes += record.addedNodes.length + record.removedNodes.length;
  });
  observer.observe(document.body, { childList: true });
  run();
  await Promise.resolve();
  observer.disconnect();
  return changes;
}

describe('the accent colour the canvas draws with', () => {
  beforeEach(() => document.body.style.setProperty('--interactive-accent', 'rgb(10, 20, 30)'));
  afterEach(() => document.body.style.removeProperty('--interactive-accent'));

  it('is asked for on every pointer move of a drag without touching the document again', async () => {
    getObsidianAccentColor();

    const changes = await bodyChangesDuring(() => {
      for (let move = 0; move < 100; move++) expect(getObsidianAccentColor()).toBe('rgb(10, 20, 30)');
    });

    expect(changes).toBe(0);
  });

  it('follows a new accent at once', () => {
    expect(getObsidianAccentColor()).toBe('rgb(10, 20, 30)');
    document.body.style.setProperty('--interactive-accent', 'rgb(200, 100, 0)');
    expect(getObsidianAccentColor()).toBe('rgb(200, 100, 0)');
    document.body.style.setProperty('--interactive-accent', 'rgb(10, 20, 30)');
    expect(getObsidianAccentColor()).toBe('rgb(10, 20, 30)');
  });
});
