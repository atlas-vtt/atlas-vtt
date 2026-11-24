import type { App } from 'obsidian';
import type { TokenEntity } from '../types';
import { visionOn } from '../vision/tokenSightPolicy';
import { CreatureIndex } from './CreatureIndex';
import type { SensedToken } from './creatureSenses';

/**
 * Asks the index for the statblocks that may give a scene's vision tokens their senses, as soon as
 * the scene is read: its sight is traced ahead while it loads (`SceneModelBuilder.prepare`), and a
 * token whose statblock is still being read then is left to the main thread at the reveal.
 */
export function requestSightStatblocks(app: App, tokens: Readonly<Record<string, TokenEntity>> | undefined): void {
  const paths = Object.values(tokens ?? {}).flatMap((token) => {
    const { statblockPath }: SensedToken = token;
    return statblockPath && visionOn(token) ? [statblockPath] : [];
  });
  if (paths.length > 0) CreatureIndex.forApp(app).request(paths);
}
