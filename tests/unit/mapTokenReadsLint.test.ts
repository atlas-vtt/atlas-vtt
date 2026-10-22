// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RULE = 'no-restricted-syntax';
// Real files of each part: type-aware linting reads the text given, but only for a file its project holds

/** The messages of the map-token rule for `code` written in `filePath`. */
async function mapTokenFindings(code: string, filePath: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: ROOT });
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((message) => message.ruleId === RULE && message.message.includes('mapTokens')).map((message) => message.message);
}

const READS = `
import type { ViewAtlasState } from '../storeFactory';
export function first(state: ViewAtlasState): unknown {
  const { tokens } = state.objects;
  return [state.objects.tokens, tokens];
}
`;

describe('code that shows the map reads its tokens through tokens/offMap.ts', () => {
  it('rejects raw reads of a scene\'s tokens in the map\'s code', async () => {
    expect(await mapTokenFindings(READS, 'src/app/pixi/playerRollTokens.ts')).toHaveLength(2);
    expect(await mapTokenFindings(READS, 'src/app/online/gm/TokenShare.ts')).toHaveLength(2);
  }, 120_000);

  it('leaves the rest of Atlas, which keeps every combatant, alone', async () => {
    expect(await mapTokenFindings(READS, 'src/app/initiative/offMapCombatants.ts')).toEqual([]);
  }, 120_000);
});
