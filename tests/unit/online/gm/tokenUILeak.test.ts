import { parseGmMessage } from '../../../../src/app/online/protocol/index.ts';
import { slottedResources } from '../../../../src/app/resources/resourceSlots';
import type { ResourceDefinition, ResourceValue } from '../../../../src/app/resources/resourceTypes';
import { shapeOf } from '../../../../src/app/resources/visibleResources';
import type { TokenEntity } from '../../../../src/app/types';
import type { ConditionDefinition } from '../../../../src/app/types/collectionSettingsTypes';
import { describe, expect, it } from 'vitest';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import { TOKEN_INTERVAL_MS, TOKEN_POLL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { sceneState, shareHarness, token, tokenLists, type Sent } from './shareHarness.ts';

/** A seeded generator (mulberry32), so a failing trial can be replayed by its seed. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

const TRIALS = 40;
const STEPS = 12;
const MAP = new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])]]);
const DIRECTIONS = ['drains', 'fills', 'static'] as const;

/** Colours no visible thing is given: a resource players may not see, or a condition only hidden or unseen tokens carry. */
const secretColour = (n: number): string => `#e0${n.toString(16).padStart(4, '0')}`;
const openColour = (n: number): string => `#10${n.toString(16).padStart(4, '0')}`;

interface Rules {
  readonly resources: ResourceDefinition[];
  /** The keys of resources players never see on a token: not theirs to see, or in a wheel's socket. */
  readonly secret: ReadonlySet<string>;
  readonly conditions: ConditionDefinition[];
  /** The ids of conditions only hidden or unseen tokens carry. */
  readonly secretConditions: readonly string[];
}

function generateRules(random: () => number): Rules {
  const resources = Array.from({ length: 1 + Math.floor(random() * 6) }, (_, index): ResourceDefinition => {
    const visible = random() < 0.6;
    return {
      key: `res${index}`, name: `Resource ${index}`, field: `f${index}`, direction: DIRECTIONS[Math.floor(random() * 3)] ?? 'drains',
      color: visible ? openColour(index) : secretColour(index), visibleToPlayers: visible, defeatedWhenSpent: random() < 0.5,
      ...(random() < 0.5 && { slot: Math.floor(random() * 6) }),
    };
  });
  const secret = new Set(slottedResources(resources).flatMap(({ definition, slot }) => (definition.visibleToPlayers && shapeOf(slot) === 'bar' ? [] : [definition.key])));
  // A visible resource in a wheel's socket must not leave its colour either.
  const recoloured = resources.map((definition, index) => (secret.has(definition.key) ? { ...definition, color: secretColour(index) } : definition));
  const conditions = Array.from({ length: 6 }, (_, index): ConditionDefinition => ({
    id: `cond${index}`, name: `Condition ${index}`, color: index < 3 ? openColour(100 + index) : secretColour(100 + index), ...(random() < 0.5 && { valued: true }),
  }));
  return { resources: recoloured, secret, conditions, secretConditions: ['cond3', 'cond4', 'cond5'] };
}

/** A resource value players may not see: a number found nowhere else in the messages. */
const secretValue = (n: number): number => 700_000 + n + 0.25;

type Role = 'free' | 'hidden' | 'unseen';

describe('what players are sent of the tokens\' bars, conditions and names', () => {
  it(`never holds a resource players may not see, a wheel, a condition of a token they do not see, an undefined condition, or a name the nameplate rule withholds (${TRIALS} generated scenes)`, async () => {
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      const random = seeded(trial * 7919);
      const rules = generateRules(random);
      const roles: readonly Role[] = ['free', 'hidden', 'unseen'];
      const generated = Array.from({ length: 2 + Math.floor(random() * 16) }, (_, index) => ({
        id: `tok_${trial}_${index}`, role: roles[Math.floor(random() * 3)] ?? 'free', name: `Name ${trial}x${index}q`, claim: random() < 0.3 ? 'taken' as const : null,
      }));
      const seats: SeatSource = {
        claimOf: (_map, id) => generated.find((entry) => entry.id === id)?.claim ?? null,
        onlinePlayers: () => [], ownerOf: () => undefined,
      };
      let secretCount = 0;
      const scene = (): ReturnType<typeof sceneState> => {
        const tokens: Record<string, TokenEntity> = {};
        for (const entry of generated) {
          const resources: Record<string, ResourceValue> = {};
          for (const definition of rules.resources) {
            if (random() < 0.2) continue;
            const max = 1 + Math.floor(random() * 30);
            resources[definition.key] = rules.secret.has(definition.key) ? { current: secretValue((secretCount += 1)), max: secretValue((secretCount += 1)) } : { current: Math.floor(random() * (max + 1)), max };
          }
          const pool = entry.role === 'free' ? ['cond0', 'cond1', 'cond2', 'stale_condition_id'] : rules.conditions.map(({ id }) => id);
          const conditions = pool.filter(() => random() < 0.5);
          tokens[entry.id] = {
            ...token(entry.id, { x: random() * 4000, y: random() * 4000, isHidden: entry.role === 'hidden' }),
            kind: 'character', name: entry.name, resources, conditions, conditionValues: Object.fromEntries(conditions.map((id) => [id, 1 + Math.floor(random() * 4)])),
          };
        }
        return sceneState({ objects: { ...sceneState().objects, tokens } });
      };
      const table = shareHarness(scene(), MAP, seats);
      table.rules = { resources: rules.resources, conditions: rules.conditions };
      table.perception = (id) => (generated.find((entry) => entry.id === id)?.role === 'unseen' ? 'unseen' : 'seen');
      table.share.start();
      for (let step = 0; step < STEPS; step += 1) {
        const showNames = random() < 0.5;
        table.settings = { ...table.settings, showNames };
        const from = table.sent.length;
        await table.set(scene());
        await table.advance(random() < 0.5 ? TOKEN_INTERVAL_MS : TOKEN_POLL_MS);
        const stepText = table.sent.slice(from).map(({ body }) => JSON.stringify(body)).join('\n');
        const list = tokenLists(table.sent).at(-1)?.tokens ?? [];
        expect(list.every((entry) => entry.ui?.nameplate !== true || showNames), `trial ${trial} step ${step}: a nameplate with names off`).toBe(true);
        if (showNames) continue;
        for (const entry of generated) {
          if (entry.claim === null) expect(stepText, `trial ${trial} step ${step}: a GM token's name with names off`).not.toContain(entry.name);
        }
      }

      const sent = table.sent.map(({ body }: Sent) => JSON.stringify(body)).join('\n');
      expect(table.sent.every(({ body }) => parseGmMessage(JSON.parse(JSON.stringify(body))) !== null), `trial ${trial}: malformed message`).toBe(true);
      for (let n = 1; n <= secretCount; n += 1) expect(sent, `trial ${trial}: a value players may not see`).not.toContain(String(secretValue(n)));
      rules.resources.forEach((definition, index) => {
        if (rules.secret.has(definition.key)) expect(sent, `trial ${trial}: ${definition.key}'s colour`).not.toContain(`"${secretColour(index)}"`);
      });
      for (const id of rules.secretConditions) {
        const index = Number(id.slice(4));
        expect(sent, `trial ${trial}: the colour of a condition only unseen or hidden tokens carry`).not.toContain(`"${secretColour(100 + index)}"`);
      }
      // No definition's id, key or name leaves the GM: the browser makes its own.
      const words = ['stale_condition_id', 'Condition ', 'Resource ', ...rules.resources.map(({ key }) => `"${key}"`), ...rules.conditions.map(({ id }) => `"${id}"`)];
      for (const word of words) expect(sent, `trial ${trial}: ${word}`).not.toContain(word);
      for (const entry of generated) {
        if (entry.role !== 'free') expect(sent, `trial ${trial}: a ${entry.role} token's name`).not.toContain(entry.name);
      }
    }
  });
});
