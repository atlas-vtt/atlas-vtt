import React, { useMemo } from 'react';
import { t } from '../../../i18n';
import atlasIcon from '../../gm/assets/atlas-icon.png?inline';
import { qrDrawing, qrMatrix } from '../../gm/dock/qrDrawing.ts';

const NAME = t('gmScreen.name');

/** The link as a QR code with the Atlas icon in its middle, dark on white in both themes, as the table's invite. */
export function GmScreenQr({ link }: { link: string }): React.JSX.Element {
  const drawing = useMemo(() => qrDrawing(qrMatrix(link)), [link]);
  const { x, y, side } = drawing.icon;
  return (
    <div className="atlas-gm-screen-qr">
      <svg viewBox={`0 0 ${drawing.side} ${drawing.side}`} role="img" aria-label={t('gmScreen.qrLabel', { name: NAME })}>
        <path d={drawing.modules} />
        <path d={drawing.finders} fillRule="evenodd" />
        <image href={atlasIcon} x={x} y={y} width={side} height={side} />
      </svg>
    </div>
  );
}
