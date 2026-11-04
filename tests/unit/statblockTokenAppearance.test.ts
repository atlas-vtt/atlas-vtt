import { afterEach, expect, it, vi } from 'vitest';
import { statblockTokenAppearance } from '../../src/app/plugin/statblockTokenAppearance';
import { HP } from '../mocks/resourceFixtures';
import { character, statblockFixture } from '../mocks/statblockTokenSync';

afterEach(() => vi.restoreAllMocks());

it('starts a newly linked character from cached statblock data without mutating the token', async () => {
  const f = statblockFixture();
  f.links.getStatblockLinkedToToken.mockResolvedValue('Hero.md');
  const token = character({ resources: { hp: { current: 2, max: 7 } } });
  delete token.statblockPath;
  const result = await statblockTokenAppearance(f.app, token, f.links, () => [HP]);
  expect(result).toMatchObject({ statblockPath: 'Hero.md', name: 'Hero', difficulty: '15', resources: { hp: { current: 20, max: 20 } } });
  expect(token.name).toBe('Custom');
  expect(token.statblockPath).toBeUndefined();
});

it('preserves an existing path and custom name without reading the note text', async () => {
  const f = statblockFixture();
  f.links.getStatblockLinkedToToken.mockResolvedValue('Other.md');
  const token = character();
  expect(await statblockTokenAppearance(f.app, token, f.links, () => [HP])).toBe(token);
  expect(f.app.vault.read).not.toHaveBeenCalled();
});

it('reads the fallback name from note text only for an unnamed character', async () => {
  const f = statblockFixture();
  const token = character();
  token.name = '';
  expect(await statblockTokenAppearance(f.app, token, f.links, () => [])).toMatchObject({ statblockName: 'Hero' });
  expect(token).not.toHaveProperty('statblockName');
});

it('leaves ordinary tokens alone even when their image has a link', async () => {
  const f = statblockFixture();
  f.links.getStatblockLinkedToToken.mockResolvedValue('Hero.md');
  const token = { ...character(), kind: 'token' as const };
  expect(await statblockTokenAppearance(f.app, token, f.links, () => [HP])).toBe(token);
  expect(f.app.vault.read).not.toHaveBeenCalled();
});

it.each(['missing', 'invalid'])('leaves an unnamed token unchanged when its note is %s', async (mode) => {
  const f = statblockFixture();
  if (mode === 'missing') f.files.delete('Hero.md');
  else f.files.set('Hero.md', 'No frontmatter');
  const token = character();
  token.name = '';
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await statblockTokenAppearance(f.app, token, f.links, () => [])).toBe(token);
  expect(warning).toHaveBeenCalledOnce();
});
