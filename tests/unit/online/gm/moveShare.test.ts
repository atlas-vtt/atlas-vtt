import { describe, expect, it } from 'vitest';
import { sharedMoveSteps, sharedTokenMove, type MoveShareState, type TokenMoves } from '../../../../src/app/online/gm/moveShare.ts';
import { sharedRules } from '../../../../src/app/online/gm/RulesShare.ts';
import { parseRules } from '../../../../src/app/online/protocol/rules.ts';
import { parseTokenMove } from '../../../../src/app/online/protocol/tokens.ts';
import { movementTurn } from '../../../../src/app/initiative/movedThisTurn';
import { withTurnMoves } from '../../../../src/app/measure/turnMoves';
import type { MovementRules } from '../../../../src/app/measure/movementRules';
import { createDefaultInitiativeState, type InitiativeState } from '../../../../src/app/types/initiativeTypes';
import type { TokenEntity } from '../../../../src/app/types';

const MOVE = { name: 'Move', multiple: 1, color: '#22C55E' };
const DASH = { name: 'Dash', multiple: 2, color: '#f59e0b' };
const rules = (changes: Partial<MovementRules> = {}): MovementRules => ({ steps: [MOVE, DASH], countPerTurn: false, ...changes });
const moves = (movement: MovementRules, speed: number | null): TokenMoves => ({ rules: () => movement, speedOf: () => speed, prepare: () => undefined });
const ogre = { id: 'ogre' } as TokenEntity;
const GRID = { type: 'square', size: 70, offsetX: 0, offsetY: 0 } as const;

describe('a token\'s move as players are sent it', () => {
  it('sends the steps in the page\'s spelling, and none where the page could not read them', () => {
    const steps = sharedMoveSteps(rules());
    expect(steps).toEqual([{ name: 'Move', multiple: 1, colour: '#22c55e' }, { name: 'Dash', multiple: 2, colour: '#f59e0b' }]);
    expect(sharedMoveSteps(rules({ steps: [] }))).toBeNull();
    expect(sharedMoveSteps(rules({ steps: [DASH, MOVE] }))).toBeNull();
    expect(sharedMoveSteps(rules({ steps: [{ ...MOVE, color: 'green' }] }))).toBeNull();
    // What goes out is what the page reads back.
    const sent = sharedRules(GRID, null, null, false, null, null, steps);
    expect(parseRules({ t: 'rules', scene: 's', ...sent })?.moveSteps).toEqual(steps);
    expect(parseRules({ t: 'rules', scene: 's', ...sharedRules(GRID, null, null) })).not.toHaveProperty('moveSteps');
  });

  it('leaves out steps that cannot be read and keeps the rules', () => {
    const sent = { t: 'rules', scene: 's', ...sharedRules(GRID, null, null) };
    for (const moveSteps of [[], [{ name: 'Move', multiple: 0, colour: '#22c55e' }], [{ name: 'Move', multiple: 1, colour: 'red' }], [MOVE, MOVE], 'steps', Array.from({ length: 5 }, (_, n) => ({ name: 'S', multiple: n + 1, colour: '#000000' }))]) {
      const read = parseRules({ ...sent, moveSteps });
      expect(read).not.toBeNull();
      expect(read).not.toHaveProperty('moveSteps');
    }
  });

  it('tells a token\'s speed only where the map names steps and the token has one', () => {
    const state: MoveShareState = { initiative: undefined };
    expect(sharedTokenMove(state, moves(rules(), 30), ogre)).toEqual({ speed: 30 });
    expect(sharedTokenMove(state, moves(rules(), null), ogre)).toBeNull();
    expect(sharedTokenMove(state, moves(rules({ steps: [] }), 30), ogre)).toBeNull();
    expect(sharedTokenMove(state, null, ogre)).toBeNull();
  });

  it('tells what the token moved in the running turn only where the map counts it', () => {
    const initiative: InitiativeState = {
      ...createDefaultInitiativeState(), isActive: true, round: 1,
      entries: [{ id: 'e', tokenId: 'ogre', name: 'ogre', initiative: 10, initiativeModifier: 0, imagePath: '', isActive: true, isNPC: true, order: 0 }],
    };
    const turnMoves = withTurnMoves({}, movementTurn({ initiative, fightsStarted: 1 }), ['ogre'], 20);
    const state: MoveShareState = { initiative, turnMoves, fightsStarted: 1 };
    expect(sharedTokenMove(state, moves(rules({ countPerTurn: true }), 30), ogre)).toEqual({ speed: 30, moved: 20 });
    expect(sharedTokenMove(state, moves(rules(), 30), ogre)).toEqual({ speed: 30 });
    // Another turn: nothing moved yet.
    expect(sharedTokenMove({ ...state, fightsStarted: 2 }, moves(rules({ countPerTurn: true }), 30), ogre)).toEqual({ speed: 30 });
  });

  it('reads a token\'s move back, and none from what is no move', () => {
    expect(parseTokenMove({ speed: 30, moved: 20 })).toEqual({ speed: 30, moved: 20 });
    expect(parseTokenMove({ speed: 30, moved: -1 })).toEqual({ speed: 30 });
    for (const move of [undefined, null, {}, { speed: 0 }, { speed: Infinity }, { speed: '30' }, { speed: 2_000_000 }]) expect(parseTokenMove(move)).toBeUndefined();
  });
});
