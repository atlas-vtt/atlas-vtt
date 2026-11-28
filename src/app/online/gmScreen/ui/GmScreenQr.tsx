import React, { useEffect, useId, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
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

/** How long the code shows after the press that showed it: longer than a campaign's code, as a phone must be found and pointed. */
export const QR_SHOWN_MS = 30_000;

function QrDrawing({ link, hidden }: { readonly link: string; readonly hidden: boolean }): React.JSX.Element {
  const drawing = useMemo(() => qrDrawing(qrMatrix(link, RECOVERY), ICON_RING), [link]);
  const clip = useId();
  const { x, y, side } = drawing.icon;
  return (
    <svg viewBox={`0 0 ${drawing.side} ${drawing.side}`} {...(hidden ? { 'aria-hidden': true } : { role: 'img', 'aria-label': t('gmScreen.qrLabel', { name: NAME }) })}>
      <clipPath id={clip}>
        <rect x={x} y={y} width={side} height={side} rx={side * ICON_CORNER} />
      </clipPath>
      <path d={drawing.modules} />
      <path d={drawing.finders} fillRule="evenodd" />
      <image href={SIDEKICK_ICON} x={x} y={y} width={side} height={side} clipPath={`url(#${clip})`} />
    </svg>
  );
}

/**
 * The link as a QR code with Sidekick's icon in its middle, dark on white in both themes. It opens hidden, so a GM who
 * streams the table never shows it, as a campaign's codes do: what stands there blurred is the code of no link, one as
 * long, so nothing of the link is on screen until the GM presses it. It shows for `QR_SHOWN_MS`, and hides again with
 * a new link (the panel keys it by the link) and when the panel closes.
 */
export function GmScreenQr({ link }: { link: string }): React.JSX.Element {
  const [shown, setShown] = useState(false);
  const [pressed, setPressed] = useState(0);
  useEffect(() => {
    if (!shown) return undefined;
    const hide = window.setTimeout(() => setShown(false), QR_SHOWN_MS);
    return () => window.clearTimeout(hide);
  }, [shown, pressed]);
  const show = (): void => {
    setShown(true);
    setPressed((count) => count + 1);
  };
  return (
    <div className="atlas-gm-screen-qr" data-hidden={!shown || undefined}>
      <QrDrawing link={shown ? link : 'x'.repeat(link.length)} hidden={!shown} />
      {!shown && (
        <button type="button" className="atlas-gm-screen-qr__reveal" onClick={show}>
          <span className="atlas-gm-screen-qr__reveal-label">
            <Eye aria-hidden="true" />
            {t('gmScreen.showQr')}
          </span>
        </button>
      )}
    </div>
  );
}
