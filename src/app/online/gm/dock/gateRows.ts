import { shownJoinCode } from '../../protocol/index.ts';
import { PAUSED_TEXT, type GateActions, type GateView } from '../joinGate.ts';
import { copyRow, textButton } from './controls.ts';
import type { MenuEntry } from './dockMenu.ts';
import { copyText } from './dockDom.ts';
import type { OnlineApi } from './panelModel.ts';
import { t } from '../../../i18n';

/**
 * What the menu and the panel show of a table's gates: the code, the two switches and a pause. Who
 * waits is not among it: their cards stand over the control (`KnockStack`), so a knock, whose moment a
 * stranger chooses, neither moves a row of the surface nor draws it anew under the GM's pointer.
 */
export type GateRows = Omit<GateView, 'waiting'>;

export function gateRowsOf(gate: GateView | null): GateRows | null {
  if (gate === null) return null;
  const { code, requireCode, askToJoin, paused, pauseArmed } = gate;
  return { code, requireCode, askToJoin, paused, pauseArmed };
}

/** What the gates' rows and menu entries do. */
export interface GateRowActions extends Pick<GateActions, 'newCode' | 'setRequireCode' | 'setAskToJoin'> {
  /** Copies the join code as people read it; false while there is none or the clipboard refused. */
  copyCode(): Promise<boolean>;
}

/** The gates' actions for the control whose root is `root`. */
export function gateRowActions(api: OnlineApi, root: HTMLElement): GateRowActions {
  return {
    newCode: () => api.gate.newCode(),
    setRequireCode: (on) => api.gate.setRequireCode(on),
    setAskToJoin: (on) => api.gate.setAskToJoin(on),
    copyCode: () => {
      const code = api.snapshot().gate?.code ?? null;
      return code === null ? Promise.resolve(false) : copyText(root, shownJoinCode(code));
    },
  };
}

/** The gates in the header's "…" menu: New code, and the two switches. None while no table runs. */
export function gateEntries(gate: GateRows | null, actions: GateRowActions): MenuEntry[] {
  if (gate === null) return [];
  return [
    { title: t('online.newCode'), icon: 'refresh-cw', apart: true, disabled: !gate.requireCode, run: () => actions.newCode() },
    { title: t('online.requireCode'), icon: 'key-round', checked: gate.requireCode, run: () => actions.setRequireCode(!gate.requireCode) },
    { title: t('online.askToJoin'), icon: 'user-check', checked: gate.askToJoin, run: () => actions.setAskToJoin(!gate.askToJoin) },
  ];
}

/**
 * Under a surface's header while joins are paused: the line that says so, with the way out. Whoever
 * sends wrong codes chooses when it appears, and it pushes the header up: its New code takes no press
 * until the line has stood for the arming time (`pauseArmed`, kept with the pause).
 */
export function renderPausedRow(layer: HTMLElement, gate: GateRows | null, actions: GateRowActions): void {
  if (gate === null || !gate.paused) return;
  const row = layer.createDiv({ cls: 'atlas-online-paused', attr: { role: 'status' } });
  row.createSpan({ cls: 'atlas-online-paused__text', text: PAUSED_TEXT });
  const button = textButton(row, t('online.newCode'), () => gate.pauseArmed && actions.newCode());
  button.dataset.focusKey = 'new-code';
  if (!gate.pauseArmed) button.setAttribute('aria-disabled', 'true');
}

/** `Code 483 912` as a row that copies it, while the table asks for a code. */
export function renderCodeRow(layer: HTMLElement, gate: GateRows | null, actions: GateRowActions): void {
  if (gate === null || gate.code === null) return;
  copyRow(layer, { icon: 'key-round', text: t('online.codeShown', { code: shownJoinCode(gate.code) }), copied: t('online.codeCopied'), focusKey: 'code' }, () => actions.copyCode()).addClass('atlas-online-code-row');
}
