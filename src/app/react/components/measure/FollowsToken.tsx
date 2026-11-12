import React, { useId, useMemo } from 'react';
import { t } from '../../../i18n';
import { levelObjects } from '../../../levels/levelObjects';
import { auraCells, auraCellsOfCircle, auraDirection, auraOfCells, auraPoints } from '../../../measure/auraArea';
import { isAura } from '../../../measure/keptMeasures';
import type { KeptMeasure } from '../../../measure/measureTypes';
import { tokenStandingAt } from '../../../measure/tokenDistance';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { mapMeasurementSettings } from '../../../services/mapMeasurementSettings';
import { rulesLookup } from '../../../services/mapRules';
import { mapTokens } from '../../../tokens/offMap';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore, useViewStoreHook } from '../../ViewStoreContext';
import { SwitchRow } from './SwitchRow';

/**
 * Whether a kept circle follows a token. On, it becomes the aura of the token its centre lies on:
 * it reaches as far past the edge of that token's space as it did, in whole cells where the map
 * counts cells, and goes where the token goes. Off, it stays where it is as a circle. A circle on
 * no token shows the switch as it is and says why it cannot be switched. One store write either
 * way, so one undo step.
 */
export function FollowsToken({ measure }: { measure: KeptMeasure }): React.ReactElement {
  const id = useId();
  const { app } = useAtlasUI();
  const store = useViewStoreHook();
  const rules = useMemo(() => rulesLookup(app), [app]);
  const follows = isAura(measure);
  const under = useAtlasStore((state) => {
    const centre = measure.points[0];
    return centre && state.grid ? tokenStandingAt(centre, Object.values(mapTokens(levelObjects(state))), state.grid)?.id ?? null : null;
  });

  const change = (on: boolean): void => {
    const state = store.getState();
    const { grid } = state;
    const tokenId = isAura(measure) ? measure.follows : under;
    const token = tokenId === null ? undefined : mapTokens(levelObjects(state))[tokenId];
    if (!grid || !token) {
      // Its token is gone from the map shown: it is let go where it lies.
      if (!on) state.updateMeasure(measure.id, { follows: undefined, aura: undefined });
      return;
    }
    const { unitDistance } = mapMeasurementSettings(rules, state);
    const cells = isAura(measure) ? auraCells(measure.aura, unitDistance) : auraCellsOfCircle(measure.points, token, grid);
    const points = auraPoints(token, cells, grid, auraDirection(measure));
    state.updateMeasure(measure.id, on ? { follows: token.id, aura: auraOfCells(cells, unitDistance), points } : { follows: undefined, aura: undefined, points });
  };

  if (follows || under !== null) return <SwitchRow label={t('measure.followsToken')} value={follows} onChange={change} />;
  return (
    <div className="atlas-light-popover__flicker">
      <span id={id}>{t('measure.followsToken')}</span>
      <LabelTooltip label={t('measure.noTokenUnder')} describe>
        <ToggleSwitch size="s" value={false} labelledBy={id} disabled onChange={() => undefined} />
      </LabelTooltip>
    </div>
  );
}
