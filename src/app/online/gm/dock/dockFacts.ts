import type { ViewState } from '../../../types/viewState';
import type { SceneState } from '../atlasView.ts';
import type { TableFacts, ViewFacts } from './dockState.ts';
import type { QrTable } from './inviteQr.ts';
import { isRunning, type OnlineSnapshot } from './panelModel.ts';

/** What the control reads of its map view's store besides the scene. */
export type ViewStoreState = SceneState & Partial<Pick<ViewState, 'selectedIds' | 'isDiceLogOpen' | 'isToolbarEditing'>> & {
  readonly setDiceLogOpen?: (open: boolean) => void;
  readonly setSelection?: (ids: string[]) => void;
};

export const viewFactsOf = (state: ViewStoreState): ViewFacts => ({ diceLog: state.isDiceLogOpen === true, toolbarEditing: state.isToolbarEditing === true });

export const tableFactsOf = (snapshot: OnlineSnapshot): TableFacts => ({ running: isRunning(snapshot.status), joined: snapshot.players.length > 0, lost: snapshot.status === 'refused' });

/** What the QR card shows of a table: its link and, while it asks for one, its join code. None without a link. */
export const qrTableOf = (snapshot: OnlineSnapshot): QrTable | null => (snapshot.link === null ? null : { link: snapshot.link, code: snapshot.gate?.code ?? null });
