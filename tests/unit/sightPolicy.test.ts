import { describe, expect, it } from 'vitest';
import { GM_SIGHT_POLICY, PLAYER_SIGHT_POLICY } from '../../src/app/vision/tokenSightPolicy';
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
});
