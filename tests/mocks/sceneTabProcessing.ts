import { vi } from 'vitest';
import { MapProcessing } from '../../src/app/pixi/mosaicCanvas/mapProcessing';
import type { TesseraEvent } from '../../src/app/pixi/mosaicCanvas/tesseraProtocol';
import { createInMemoryApp } from './inMemoryVault';

/** Real progress tracking and scene-file reads, with only worker events supplied by the test. */
export function sceneTabProcessing(scenePath: string) {
  const imagePath = `${scenePath}.png`;
  const { app } = createInMemoryApp({ files: {
    [scenePath]: JSON.stringify({ version: 1, state: { background: imagePath } }),
  } });
  let receive: ((event: TesseraEvent) => void) | undefined;
  const processing = new MapProcessing({
    onEvent: (listener) => { receive = listener; return () => { receive = undefined; }; },
  });
  const forApp = vi.spyOn(MapProcessing, 'forApp').mockReturnValue(processing);
  return {
    app,
    progress: (done: number): void => { receive?.({ type: 'progress', hash: imagePath, path: imagePath, done, total: 100 }); },
    complete: (): void => { receive?.({ type: 'complete', hash: imagePath, path: imagePath }); },
    dispose: (): void => { forApp.mockRestore(); processing.dispose(); },
  };
}
