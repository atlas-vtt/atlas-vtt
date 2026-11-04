import React from 'react';
import { Button } from '../../../packages/components/primitives/button';
import { cn } from '../../../../utils/cn';

export interface BarAction {
  label: string;
  onClick: () => void;
  /** The action the bar recommends. */
  primary?: boolean | undefined;
  disabled?: boolean | undefined;
}

export interface EditorBarProps {
  text: React.ReactNode;
  actions?: readonly BarAction[] | undefined;
  /** A problem (a conflict, a save that failed): the text takes the error colour's tint. */
  tone?: 'quiet' | 'warning' | undefined;
  /** Below the line, across the bar: a list the question is about. */
  children?: React.ReactNode;
}

/** A line about the template above the canvas, with its actions at the end (§7.4). */
export function EditorBar({ text, actions = [], tone = 'quiet', children }: EditorBarProps): React.JSX.Element {
  return (
    <div className={cn('atlas-te-bar', tone === 'warning' && 'atlas-te-bar--warning')} role="status">
      <div className="atlas-te-bar__line">
        <span className="atlas-te-bar__text">{text}</span>
        {actions.length > 0 && (
          <span className="atlas-te-bar__actions">
            {actions.map((action) => (
              <Button
                key={action.label}
                type="button"
                variant={action.primary ? 'default' : 'ghost'}
                size="sm"
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
