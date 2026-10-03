import { describe, expect, it } from 'vitest';
import { isSecretRollEffective } from '../../src/app/tools/secretRoll';

describe('isSecretRollEffective', () => {
  it.each([
    { secretRoll: true, showDiceRolls: true, effective: true },
    { secretRoll: false, showDiceRolls: true, effective: false },
    { secretRoll: true, showDiceRolls: false, effective: false },
    { secretRoll: false, showDiceRolls: false, effective: false },
  ])(
    'is $effective with the secret roll $secretRoll and Show dice rolls $showDiceRolls',
    ({ secretRoll, showDiceRolls, effective }) => {
      expect(isSecretRollEffective(secretRoll, showDiceRolls)).toBe(effective);
    }
  );
});
