import React from 'react';
import { Circle, CircleOff, Minus } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { t } from '../../../../i18n';

export function TokenRingToggle({ value, onChange, label, disabled = false, mixed = false }: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  mixed?: boolean;
}): React.JSX.Element {
  return <LabelTooltip label={mixed ? t('creator.ringMixed') : value ? t('creator.ringShown') : t('creator.ringHidden')} describe>
    <Button variant={value ? 'secondary' : 'outline'} className="atlas-token-ring-toggle" role="switch" aria-checked={value} aria-label={label} disabled={disabled} onClick={() => onChange(!value)}>
      {mixed ? <Minus /> : value ? <Circle /> : <CircleOff />}<span>{t('creator.toggleRing')}</span>
    </Button>
  </LabelTooltip>;
}
