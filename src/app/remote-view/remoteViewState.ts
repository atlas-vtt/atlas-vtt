/**
 * The remote map view's own part of its store: what the extension feeding it decides beyond
 * Atlas's records, read by the status bar, the drag gate, the ruler, the condition badges, the
 * initiative list and the dice log. Null in every other view, and never persisted (`partialize`
 * names the fields it saves; `merge` never takes this one from a file).
 */
import type { StoreApi } from 'zustand';
import { frozenCopy } from '../../api/frozen';
import type { RemoteStatus, RemoteStatusAction } from '../../api/types/remoteViews';
import { resolveMeasurementSettings, type MeasurementSettings } from '../grid/measurementFormat';
import type { ResourceDefinition, ResourceValue } from '../resources/resourceTypes';
import type { ViewAtlasState } from '../storeFactory';
import type { DiceRollResult } from '../tools/diceRolling';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import type { InitiativeRules } from '../types/initiativeRulesTypes';

export type { RemoteStatus };

/** A status action as the status bar draws it: the owner's id, label and icon, and the click that tells the owner. */
export interface ShownStatusAction extends RemoteStatusAction {
  run(): void;
}

/** The owner's status as the store keeps it, each of its `actions` with its click. */
export type ShownStatus = Omit<RemoteStatus, 'actions'> & { actions?: readonly ShownStatusAction[] };

export interface RemoteViewState {
  /** The tokens the player may drag. */
  movableTokenIds: readonly string[];
  /** The measurement settings of the drag ruler and the measure tool. */
  measurement: MeasurementSettings;
  /** The definitions the condition badges read. */
  conditions: readonly ConditionDefinition[];
  /** The resource definitions of each token that shows bars or a downed look, by token id. */
  resources: Readonly<Record<string, readonly ResourceDefinition[]>>;
  /** How full the initiative list's bar is for each combatant's token, by token id. */
  initiativeHealth: Readonly<Record<string, ResourceValue>>;
  /** How the initiative list is grouped; null for the player's own collection rules. */
  initiativeRules: InitiativeRules | null;
  status: ShownStatus;
  /** The shared dice log the view's dice log shows. */
  diceLog: readonly DiceRollResult[];
  /** The most dice the tray offers for one roll (`remoteViews.open({ maxDice })`). */
  maxDice: number;
  /** The player's latest own roll, which the view throws once (by id); null before the first. */
  ownRoll: DiceRollResult | null;
  /** The dice look the view's rolls are thrown in (`RemoteView.setDiceLook`); null for the player's own. */
  diceLookId: string | null;
  /** The scene had more fog operations than a remote view shows (`REMOTE_FOG_OPS_MAX`): its fog covers everything. */
  fogTooLarge: boolean;
}

/** The state before the owner feeds anything; its parts are frozen, like every part the owner's feed writes. */
export function initialRemoteViewState(): RemoteViewState {
  return { ...frozenCopy<RemoteViewState>({
    movableTokenIds: [],
    measurement: resolveMeasurementSettings(undefined, null),
    conditions: [],
    resources: {},
    initiativeHealth: {},
    initiativeRules: null,
    status: { title: '', connection: '', tone: 'pending', message: null },
    diceLog: [],
    maxDice: 100,
    ownRoll: null,
    diceLookId: null,
    fogTooLarge: false,
  }) };
}

/** Changes part of a remote store's `remoteView`; does nothing to a normal view's store. */
export function updateRemoteView(
  store: Pick<StoreApi<ViewAtlasState>, 'getState' | 'setState'>,
  partial: Partial<RemoteViewState>,
): void {
  const current = store.getState().remoteView;
  if (!current) return;
  store.setState({ remoteView: { ...current, ...partial } });
}
