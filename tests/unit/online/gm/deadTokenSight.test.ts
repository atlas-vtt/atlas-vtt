// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEAD_CONDITION } from '../../../../src/app/gameSystems/deadCondition';
import { sharedSight } from '../../../../src/app/online/gm/sceneInputs';
import { parseGmMessage } from '../../../../src/app/online/protocol';
import { GENERIC_SIGHT_RULES } from '../../../../src/app/vision/sightRules';
import { sceneState, token } from './shareHarness';

describe('sharing a dead token\'s sight', () => {
  it('sends the suppression even when the corpse is unseen, and the protocol retains it', () => {
    const corpse = token('corpse', { vision: { enabled: true }, conditions: [DEAD_CONDITION.id] });
    const state = sceneState({ objects: { ...sceneState().objects, tokens: { corpse } } });
    const sight = sharedSight({ state, rules: GENERIC_SIGHT_RULES, shown: new Set(), tokenAlias: () => 'a'.repeat(24), lightAlias: () => 'b'.repeat(24) });
    expect(sight.tokens).toHaveLength(1);
    expect(sight.tokens[0]?.effects).toEqual(['no-vision']);
    expect(sight.tokens[0]?.vision).toBeDefined();
    const message = { t: 'sight', scene: 'scene', ...sight };
    expect(parseGmMessage(message)).toEqual(message);
  });
});
