import React, { useEffect, useRef } from 'react';
import { setIcon } from 'obsidian';
import type { RunAction } from './selectionActions';

interface SideBySideRowProps {
  /** The actions of the row, each a button. */
  actions: readonly RunAction[];
  onClose: () => void;
}

function IconSpan({ name }: { name: string }): React.ReactElement {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.replaceChildren();
      setIcon(ref.current, name);
    }
  }, [name]);
  return <span ref={ref} className="atlas-ctx-icon" />;
}

/** The menu's last row: what ends a token (Kill, Delete), side by side. */
export function SideBySideRow({ actions, onClose }: SideBySideRowProps): React.ReactElement {
  return (
    <div className="atlas-ctx-destructive-row">
      {actions.map((action) => (
        <div
          key={action.id}
          role="menuitem"
          tabIndex={0}
          className="atlas-ctx-destructive-btn"
          onClick={(e) => {
            e.stopPropagation();
            action.run();
            onClose();
          }}
        >
          <IconSpan name={action.icon ?? ''} />
          <span>{action.label}</span>
        </div>
      ))}
    </div>
  );
}
