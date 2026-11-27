import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { t } from '../../../i18n';
import { Button } from '../../../packages/components/primitives/button';
import { COPIED_MS } from '../../gm/dock/controls.ts';
import { copyText } from '../../gm/dock/dockDom.ts';
import { useEscapeUndo } from './panelEscape.ts';

/** The link as the panel shows it: its host, and its path with a mark where the key was left out. */
export interface ShownLink {
  readonly host: string;
  readonly rest: string;
}

/** What may be shown of `link`: its host and path. The key in its fragment goes to the clipboard alone. */
export function shownLink(link: string): ShownLink {
  const url = new URL(link);
  return { host: url.host, rest: `${url.pathname}${url.hash === '' ? '' : '#…'}` };
}

type Copied = { readonly kind: 'idle' | 'copied' | 'failed'; readonly press: number };

/**
 * The link as one control: a press (or Enter, or Space) copies the whole link and says so in place for a
 * moment; nothing is selected and no notice shows elsewhere. A screen reader hears what it does, and then
 * that it copied.
 */
export function LinkCopy({ link }: { link: string }): React.JSX.Element {
  const button = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<Copied>({ kind: 'idle', press: 0 });
  useEffect(() => {
    if (copied.kind === 'idle') return undefined;
    const timer = window.setTimeout(() => setCopied(({ press }) => ({ kind: 'idle', press })), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);
  useEscapeUndo(copied.kind !== 'idle', () => setCopied(({ press }) => ({ kind: 'idle', press })));
  const copy = (): void => {
    if (button.current === null) return;
    void copyText(button.current, link).then((done) => setCopied(({ press }) => ({ kind: done ? 'copied' : 'failed', press: press + 1 })));
  };
  const { host, rest } = shownLink(link);
  const said = copied.kind === 'copied' ? t('gmScreen.linkCopied') : copied.kind === 'failed' ? t('gmScreen.copyFailed') : '';
  return (
    <div className="atlas-gm-screen-link-row">
      <Button ref={button} type="button" variant="ghost" className="atlas-gm-screen-link" data-state={copied.kind} aria-label={t('gmScreen.copyLink')} onClick={copy}>
        <span className="atlas-gm-screen-link__face" aria-hidden="true">
          <span className="atlas-gm-screen-link__url" data-shown={copied.kind === 'idle'}>
            <span className="atlas-gm-screen-link__host">{host}</span>
            {rest}
          </span>
          <span className="atlas-gm-screen-link__note" data-shown={copied.kind !== 'idle'}>{copied.kind === 'failed' ? t('gmScreen.copyFailed') : t('gmScreen.copied')}</span>
        </span>
        <span className="atlas-gm-screen-link__glyph" aria-hidden="true">
          <Copy data-shown={copied.kind === 'idle'} />
          <Check data-shown={copied.kind === 'copied'} />
          <X data-shown={copied.kind === 'failed'} />
        </span>
      </Button>
      <span className="atlas-gm-screen-link__said" role="status">{said}</span>
    </div>
  );
}
