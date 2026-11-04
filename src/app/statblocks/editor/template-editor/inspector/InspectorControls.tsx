/**
 * The inspector's rows (§7.4, §7.10). A group is one grid, labels in its first
 * column and controls in its second, so padding and the gap between rows are
 * the same 12 px; a control that needs the width spans both columns.
 */

import React, { useId } from 'react';
import { SegmentedControl, type SegmentedOption } from '../../../../packages/components/primitives/SegmentedControl';
import { Select, type SelectOption } from '../../../../packages/components/primitives/Select';
import { ToggleSwitch } from '../../../../packages/components/primitives/Toggle';
import { cn } from '../../../../../utils/cn';
import type { EditorSession } from '../sessionTypes';
import { useGestureText } from './useGestureText';

interface SettingProps {
  label: string;
  /** The control, named by the label's id. */
  children: (labelId: string) => React.ReactNode;
  /** The control takes the whole width, under its label. */
  wide?: boolean | undefined;
}

/** A label and its control, in the group's two columns. */
export function Setting({ label, children, wide = false }: SettingProps): React.JSX.Element {
  const labelId = useId();
  return (
    <>
      <span id={labelId} className={cn('atlas-te-setting__label', wide && 'atlas-te-span')}>{label}</span>
      <div className={cn('atlas-te-setting__control', wide && 'atlas-te-span')}>{children(labelId)}</div>
    </>
  );
}

export interface TextSettingProps {
  label: string;
  value: string;
  session: EditorSession;
  onText: (text: string) => void;
  disabled: boolean;
  mode?: 'live' | 'commit' | undefined;
  multiline?: boolean | undefined;
  wide?: boolean | undefined;
  placeholder?: string | undefined;
  /** Keys and patterns: monospace. */
  code?: boolean | undefined;
  /** Says what is wrong with the text as typed, under the input. */
  check?: ((text: string) => string | null) | undefined;
  /** Names the input for a control elsewhere that brings focus to it (`data-focus-key`). */
  focusKey?: string | undefined;
}

/** A text the template holds; typing it is one undo step. */
export function TextSetting(props: TextSettingProps): React.JSX.Element {
  const { label, value, session, onText, disabled, mode, multiline = false, wide = multiline, placeholder, code = false, check, focusKey } = props;
  const text = useGestureText({ value, session, onText, mode, multiline });
  const problem = check?.(text.value) ?? null;
  const problemId = useId();
  const shared = {
    ...text,
    disabled,
    placeholder,
    spellCheck: false,
    className: cn('atlas-te-input', code && 'atlas-te-input--code'),
    'aria-invalid': problem ? true : undefined,
    'aria-describedby': problem ? problemId : undefined,
    'data-focus-key': focusKey,
  };
  return (
    <Setting label={label} wide={wide}>
      {(labelId) => (
        <>
          {multiline
            ? <textarea {...shared} aria-labelledby={labelId} rows={3} />
            : <input {...shared} type="text" aria-labelledby={labelId} />}
          {problem && <span id={problemId} className="atlas-te-setting__problem">{problem}</span>}
        </>
      )}
    </Setting>
  );
}

export interface ChoiceSettingProps<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled: boolean;
}

/** A few choices side by side. */
export function ChoiceSetting<T extends string>({ label, value, options, onChange, disabled }: ChoiceSettingProps<T>): React.JSX.Element {
  return (
    <Setting label={label}>
      {() => <SegmentedControl value={value} options={options} onChange={onChange} ariaLabel={label} disabled={disabled} className="atlas-segmented--fit" />}
    </Setting>
  );
}

export interface SelectSettingProps<T extends string> {
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  disabled: boolean;
}

/** More choices than fit side by side. */
export function SelectSetting<T extends string>({ label, value, options, onChange, disabled }: SelectSettingProps<T>): React.JSX.Element {
  return (
    <Setting label={label}>
      {(labelId) => <Select value={value} options={options} onChange={onChange} labelledBy={labelId} disabled={disabled} />}
    </Setting>
  );
}

export interface SwitchSettingProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}

/** On or off. */
export function SwitchSetting({ label, value, onChange, disabled }: SwitchSettingProps): React.JSX.Element {
  return (
    <Setting label={label}>
      {(labelId) => (
        <ToggleSwitch
          value={value}
          labelledBy={labelId}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : 0}
          className="atlas-te-switch"
          onChange={() => { if (!disabled) onChange(!value); }}
        />
      )}
    </Setting>
  );
}

/** A sentence across the group: what a setting does, or why it can't be set. */
export function SettingNote({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warning' }): React.JSX.Element {
  return <p className={cn('atlas-te-setting__note atlas-te-span', tone === 'warning' && 'atlas-te-setting__note--warning')}>{children}</p>;
}
