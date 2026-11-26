import type { App } from 'obsidian';
import { renderThumbnail } from '../../../imageProcessing/imageProcessing';
import type { GmScreenSession } from '../GmScreenSession.ts';
import { atlasFrontScenes } from './frontScene.ts';
import { PortraitShelf } from './PortraitShelf.ts';
import { StatblockDrawing } from './StatblockDrawing.ts';
import { StatblocksScreen } from './StatblocksScreen.ts';

/** A picture too large to send whole goes as a copy this large (its longer side, in pixels): sharp on a phone's portrait. */
const PORTRAIT_SIDE = 512;

/** Plugs the Statblocks screen into the GM screen's session, on the map the GM has in front; returns what unplugs it. */
export function plugAtlasStatblocks(app: App, session: GmScreenSession): () => void {
  const screen = new StatblocksScreen({
    app,
    outlet: session,
    scenes: atlasFrontScenes(app),
    portraits: new PortraitShelf(app, (image) => renderThumbnail(image, { size: PORTRAIT_SIDE, quality: 0.85 })),
    drawing: (settled) => new StatblockDrawing(app, settled),
  });
  const unplug = session.plug(screen);
  return () => {
    unplug();
    screen.dispose();
  };
}
