import React, { useId } from 'react';
import { InfoMark } from './InfoMark';

interface SettingRowProps {
  label: string;
  /** What the setting does, behind the info mark beside the label, so the row stays one line. */
  info?: string;
  /** The control at the row's end, given the label's id to name itself by. */
  control: (labelId: string) => React.ReactNode;
  /** A quiet line under the row: a preview of what the setting reads, or an error. */
  children?: React.ReactNode;
}

/** One compact setting: a short label (with its info mark) at the start, its control at the end. */
export function SettingRow({ label, info, control, children }: SettingRowProps): React.ReactElement {
  const id = useId();
  return (
    <div className="atlas-csm-setting">
      <div className="atlas-csm-setting__row">
        <span className="atlas-csm-label-row">
          <span id={id} className="atlas-csm-toggle-label">{label}</span>
          {info && <InfoMark label={info} />}
        </span>
        <div className="atlas-csm-setting__control">{control(id)}</div>
      </div>
      {children}
    </div>
  );
}
