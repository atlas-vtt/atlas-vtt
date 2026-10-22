import { showNotice } from '../../../ui/notice';
import { shownJoinCode } from '../../protocol/index.ts';
import { copyText } from './dockDom.ts';
import type { OnlineApi } from './panelModel.ts';

/**
 * Copies a player's code as people read it (`482 193`) from the window `root` lives in, and tells the
 * GM how it went; false while the table knows no code for them or the clipboard refused.
 */
export function playerCodeCopier(api: Pick<OnlineApi, 'playerCode'>, root: HTMLElement): (playerId: string) => Promise<boolean> {
  return async (playerId) => {
    const code = api.playerCode(playerId);
    const copied = code !== null && (await copyText(root, shownJoinCode(code)));
    showNotice(copied ? 'Code copied' : 'The code could not be copied.');
    return copied;
  };
}
