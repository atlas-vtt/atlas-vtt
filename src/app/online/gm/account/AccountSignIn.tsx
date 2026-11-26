import React from 'react';
import { Button } from '../../../packages/components/primitives/button';
import type { ButtonVariant } from '../../../packages/components/primitives/buttonClasses';
import type { SignInActions, SignInButton, SignInPrompt } from './signInPrompt.ts';

const VARIANTS: Readonly<Record<SignInButton['kind'], ButtonVariant>> = { cta: 'default', plain: 'secondary', ghost: 'ghost' };

/** The shared sign-in (`signInPrompt`) in a React surface: its lines, the code to approve, and its buttons. */
export function AccountSignIn({ prompt, actions }: { prompt: SignInPrompt; actions: SignInActions }): React.JSX.Element {
  return (
    <div className="atlas-sign-in">
      {prompt.lines.map((line) => (
        <p key={line.text} className={line.tone === 'help' ? 'atlas-sign-in__help' : `atlas-sign-in__status atlas-online-tone--${line.tone}`} role={line.tone === 'help' ? undefined : 'status'}>
          {line.text}
        </p>
      ))}
      {prompt.code !== null && <p className="atlas-sign-in__code" aria-label={prompt.code.label}>{prompt.code.text}</p>}
      {prompt.buttons.length > 0 && (
        <div className="atlas-sign-in__actions">
          {prompt.buttons.map((shown) => (
            <Button key={shown.action} variant={VARIANTS[shown.kind]} disabled={shown.disabled} onClick={() => actions[shown.action]()}>{shown.label}</Button>
          ))}
        </div>
      )}
    </div>
  );
}
