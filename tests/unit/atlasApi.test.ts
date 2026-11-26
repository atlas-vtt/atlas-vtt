import { afterEach, expect, it } from 'vitest';
import { createAtlasApi } from '../../src/app/api/atlasApi';
import { appearanceSettings, tokenOverlays } from '../../src/app/api/extensionPoints';

afterEach(() => {
  appearanceSettings.clear();
  tokenOverlays.clear();
});

it('adds what another plugin hands in until it takes it back, and ignores what is not one', () => {
  const api = createAtlasApi('1.0.0');
  const remove = api.tokens.addOverlay({ image: 'data:image/png;base64,AA', span: 1.3 });
  expect(tokenOverlays.list()).toEqual([{ image: 'data:image/png;base64,AA', span: 1.3 }]);
  remove();
  remove();
  expect(tokenOverlays.list()).toEqual([]);

  for (const bad of [null, { image: '', span: 1 }, { image: 'x', span: 0 }, { image: 'x', span: Number.NaN }]) {
    api.tokens.addOverlay(bad as never)();
  }
  expect(tokenOverlays.list()).toEqual([]);

  const mount = (): void => undefined;
  const removeSetting = api.appearance.addSetting(mount);
  expect(appearanceSettings.list()).toEqual([mount]);
  removeSetting();
  expect(appearanceSettings.list()).toEqual([]);
  expect(Object.isFrozen(api) && Object.isFrozen(api.tokens)).toBe(true);
});
