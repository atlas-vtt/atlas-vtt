import { describe, expect, it } from 'vitest';
import type { TokenEntity } from '../../src/app/types';
import { GM_SIGHT_POLICY, ownPolicy, PLAYER_SIGHT_POLICY, sightPolicyFor } from '../../src/app/vision/tokenSightPolicy';
import {
  footprintCouplingProblems,
  footprintDecisionProblems,
  memoProblems,
  misfiledSelectionProblems,
  perceptionDecisionProblems,
  policyValueProblems,
  sceneSpotsDecisionProblems,
  selectionDecisionProblems,
  sourceDecisionProblems,
} from '../helpers/sightPolicyContract';

describe('sight policies', () => {
  it('give sight and always show the tokens the player view and the GM view did before', () => {
    expect(policyValueProblems()).toEqual([]);
  });

  it('the GM\'s view shares the players\' footprints while both pictures have the same sight', () => {
    expect(GM_SIGHT_POLICY.alwaysSeen).toBe(PLAYER_SIGHT_POLICY.alwaysSeen);
    expect(footprintCouplingProblems()).toEqual([]);
  });

  it('decide which tokens are sight sources, never one without vision on', () => {
    expect(sourceDecisionProblems()).toEqual([]);
  });

  it('decide which tokens perception always shows, keeping the rule for held tokens', () => {
    expect(perceptionDecisionProblems()).toEqual([]);
  });

  it('decide which tokens get a footprint where the map around them is dark', () => {
    expect(footprintDecisionProblems()).toEqual([]);
  });

  it('decide a scene\'s footprints through the policy it was made with', () => {
    expect(sceneSpotsDecisionProblems()).toEqual([]);
  });

  it('decide which regions a picture keeps of a sight worked out for more tokens', () => {
    expect(selectionDecisionProblems()).toEqual([]);
  });

  it('are part of what remembered perception is kept for', () => {
    expect(memoProblems()).toEqual([]);
  });

  it('select the player view from a record that files a token under another key as before', () => {
    expect(misfiledSelectionProblems()).toEqual([]);
  });

  it('a player\'s own picture always shows their own tokens, defeated or blind, and sees only by their own that see', () => {
    const tok = (id: string, changes: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', imagePath: '', x: 0, y: 0, size: 1, ...changes } as TokenEntity);
    const seer = tok('seer', { vision: { enabled: true } });
    const blind = tok('blind');
    const hidden = tok('hidden', { isHidden: true });
    const other = tok('other', { vision: { enabled: true } });
    const own = new Set(['seer', 'blind', 'hidden']);
    const policy = sightPolicyFor(ownPolicy((token) => token.id === 'seer', (token) => own.has(token.id)), { defeated: (token) => token.id === 'seer' });
    expect([seer, blind, hidden, other].map(policy.alwaysSeen)).toEqual([true, true, false, false]);
    expect([seer, blind, hidden, other].map(policy.givesSight)).toEqual([false, false, false, false]);
  });
});
