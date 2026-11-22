import { presetFaceParts } from '../react/components/dice/presetFace';
import { presetFaceFormula, presetText } from '../react/components/dice/presetLook';
import type { DicePreset } from '../types/dicePresetTypes';
import type { RemoteRoll } from './remoteProtocol';

/** Saved rolls as a key draws them: name, the tray line's text, and the face of their place in the tray's row. */
export function remoteRolls(presets: readonly DicePreset[]): RemoteRoll[] {
  return presets.map((preset) => {
    const parts = presetFaceParts(presetFaceFormula(preset));
    return {
      id: preset.id,
      name: preset.name,
      formula: presetText(preset),
      look: {
        sides: parts?.sides ?? null,
        count: parts?.count ?? 1,
        rule: parts?.rule ?? '',
        rest: parts?.rest ?? '',
        colour: preset.look?.dice[0]?.colour ?? null,
      },
    };
  });
}
