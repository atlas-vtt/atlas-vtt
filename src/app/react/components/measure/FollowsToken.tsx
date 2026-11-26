import React, { useMemo } from 'react';
import { t } from '../../../i18n';
import { levelObjects } from '../../../levels/levelObjects';
import { auraCells, auraDirection, auraPoints } from '../../../measure/auraArea';
import { isAura, isFollower } from '../../../measure/keptMeasures';
import { anchorOf, tokenAtStart } from '../../../measure/measureFollowers';
import type { KeptMeasure } from '../../../measure/measureTypes';
import { mapMeasurementSettings } from '../../../services/mapMeasurementSettings';
import { rulesLookup } from '../../../services/mapRules';
import { mapTokens } from '../../../tokens/offMap';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore, useViewStoreHook } from '../../ViewStoreContext';
import { SwitchRow } from './SwitchRow';

/**
 * Whether a kept measurement follows a token. On, it is grouped with the token its start lies on:
 * it keeps its shape and moves and turns with the token (`followTokensWithMeasures`). Off, it stays
 * where it lies. An aura (made from the token's menu) shows it on, and off is let go as the circle
 * it shows. A measurement starting on no token shows the switch as it is and says why it cannot be
 * switched. One store write either way, so one undo step.
 */
export function FollowsToken({ measure }: { measure: KeptMeasure }): React.ReactElement {
  const { app } = useAtlasUI();
  const store = useViewStoreHook();
  const rules = useMemo(() => rulesLookup(app), [app]);
  const follows = isAura(measure) || isFollower(measure);
  const under = useAtlasStore((state) => {
    const start = measure.points[0];
    return start && state.grid ? tokenAtStart(start, Object.values(mapTokens(levelObjects(state))), state.grid)?.id ?? null : null;
  });

  const change = (on: boolean): void => {
    const state = store.getState();
    if (on) {
      const token = under === null ? undefined : mapTokens(levelObjects(state))[under];
      if (token && !follows) state.updateMeasure(measure.id, { follows: token.id, anchor: anchorOf(token) });
      return;
    }
    if (!isAura(measure)) {
      state.updateMeasure(measure.id, { follows: undefined, anchor: undefined });
      return;
    }
    // An aura is let go as the circle it shows around its token; where its token is gone from the map shown, where it lies.
    const token = mapTokens(levelObjects(state))[measure.follows];
    const { grid } = state;
    const points = token && grid ? auraPoints(token, auraCells(measure.aura, mapMeasurementSettings(rules, state).unitDistance), grid, auraDirection(measure)) : undefined;
    state.updateMeasure(measure.id, { follows: undefined, aura: undefined, ...(points && { points }) });
  };

  return <SwitchRow label={t('measure.followsToken')} value={follows} onChange={change} unavailable={follows || under !== null ? null : t('measure.noTokenUnder')} />;
}
