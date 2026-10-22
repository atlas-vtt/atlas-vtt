import React from 'react';
import { hexToNumber } from '../../../styles/designTokens';
import type { ConditionDefinition } from '../../../types/collectionSettingsTypes';
import { conditionGlyph } from '../../../utils/conditionGlyph';
import { ConditionBadge } from '../../../packages/components/shared/ConditionBadge';

interface ConditionBadgePreviewProps {
  condition: Pick<ConditionDefinition, 'name' | 'color' | 'icon'>;
  size: number;
}

/** The condition's badge as tokens show it on the map. */
export function ConditionBadgePreview({ condition, size }: ConditionBadgePreviewProps): React.ReactElement {
  return <ConditionBadge condition={{ color: hexToNumber(condition.color), glyph: conditionGlyph(condition) }} size={size} />;
}
