import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LOCAL_PLAYER_VIEW_TYPE } from '../../../../src/app/online/gm/atlasView.ts';

const VENDOR = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const vendor = (file: string): string => fs.readFileSync(path.join(VENDOR, file), 'utf8');

/**
 * What the companion's takeover of "Display on player view" rests on in the vendor, none of it a
 * public interface: a moved pin that changes any of it fails here, not silently at a GM's table.
 */
describe('the companion plugin', () => {
  it('finds Atlas\'s player window by the view type the vendor registers it under', () => {
    expect(/export const LOCAL_PLAYER_VIEW_TYPE = ["']([^"']+)["'];/.exec(vendor('src/app/local-player-view.ts'))?.[1]).toBe(LOCAL_PLAYER_VIEW_TYPE);
  });

  it('finds Atlas\'s image display on its plugin instance, with the three calls it stands in front of', () => {
    expect(vendor('main.ts')).toMatch(/this\.imageDisplayService = new ImageDisplayService\(/);
    const service = vendor('src/app/services/ImageDisplayService.ts');
    for (const call of ['public async displayImageOnPlayerView(file: TFile): Promise<void>', 'public closeImageDisplay(): void', 'public isImageDisplayed(): boolean']) expect(service).toContain(call);
  });

  it('is reached by every caller: menus, the overlay\'s own × and the commands call through the instance', () => {
    const service = vendor('src/app/services/ImageDisplayService.ts');
    expect(service).toMatch(/onClick\(async \(\) => \{\s*await this\.displayImageOnPlayerView\(file\);/);
    expect(service).toMatch(/onClick: \(\) => this\.displayImageOnPlayerView\(file\)/);
    expect(service.match(/\(\) => this\.closeImageDisplay\(\)/g)).toHaveLength(2);
    const commands = vendor('src/app/plugin/registerCommands.ts');
    expect(commands.match(/void imageDisplay\.displayImageOnPlayerView\(file\)/g)).toHaveLength(2);
    expect(commands).toMatch(/if \(!imageDisplay\.isImageDisplayed\(\)\) return false;\s*if \(!checking\) imageDisplay\.closeImageDisplay\(\);/);
  });

  it('is asked to show an image in Atlas\'s own window only while that is open, since Atlas says so otherwise', () => {
    expect(vendor('src/app/services/ImageDisplayService.ts')).toMatch(/if \(!playerWindowService \|\| !playerWindowService\.isWindowOpen\(\)\) \{\s*showNotice\(t\('image\.windowClosed'\)\);/);
  });
});
