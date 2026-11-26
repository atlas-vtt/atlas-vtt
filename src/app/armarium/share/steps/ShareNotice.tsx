import React from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';

const ICONS = { error: CircleAlert, success: CircleCheck, info: Info } as const;

/** A line the open step stands out with: a refusal, a success, or something to know. Errors are announced as alerts. */
export function ShareNotice({ tone, children }: { tone: keyof typeof ICONS; children: React.ReactNode }): React.JSX.Element {
  const Icon = ICONS[tone];
  return (
    <div className="atlas-share-notice" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon className="atlas-share-notice__icon" aria-hidden="true" />
      <div className="atlas-share-notice__body">{children}</div>
    </div>
  );
}
