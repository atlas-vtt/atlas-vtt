import React, { useId, useMemo } from 'react';
import { t } from '../../../i18n';
import { qrDrawing, qrMatrix } from '../../gm/dock/qrDrawing.ts';
import { SIDEKICK_ICON } from './SidekickIcon';

const NAME = t('gmScreen.name');

/** An app icon's corner as a share of its side, as a phone rounds it. */
export const ICON_CORNER = 0.225;

/**
 * Level M and a ring of two modules round the icon read best with zbar, the strictest reader at hand: over 200
 * links each, plain and blurred as a phone at arm's length sees the panel, M's smaller code (its modules a fifth
 * larger) did better than H's extra recovery; at a ring of one module the icon's tile kept nearly every code from
 * reading (0 of 80).
 */
const RECOVERY = 'M';
const ICON_RING = 2;

/** The link as a QR code with Sidekick's icon in its middle, dark on white in both themes. */
export function GmScreenQr({ link }: { link: string }): React.JSX.Element {
  const drawing = useMemo(() => qrDrawing(qrMatrix(link, RECOVERY), ICON_RING), [link]);
  const clip = useId();
  const { x, y, side } = drawing.icon;
  return (
    <div className="atlas-gm-screen-qr">
      <svg viewBox={`0 0 ${drawing.side} ${drawing.side}`} role="img" aria-label={t('gmScreen.qrLabel', { name: NAME })}>
        <clipPath id={clip}>
          <rect x={x} y={y} width={side} height={side} rx={side * ICON_CORNER} />
        </clipPath>
        <path d={drawing.modules} />
        <path d={drawing.finders} fillRule="evenodd" />
        <image href={SIDEKICK_ICON} x={x} y={y} width={side} height={side} clipPath={`url(#${clip})`} />
      </svg>
    </div>
  );
}
