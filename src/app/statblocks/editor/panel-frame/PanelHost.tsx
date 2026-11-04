import React, { forwardRef } from 'react';
import { PanelResizeHandle } from '../note-panel/PanelResizeHandle';
import './panel-frame.scss';

/** CSS variables set inline. */
type HostStyle = React.CSSProperties & Record<`--${string}`, string>;

export interface PanelHostContentProps {
  /** The panel's width in CSS pixels, which the resize edge starts from. */
  width: number;
  /** The view is too narrow for two columns: the panel stands above the note and has no resize edge. */
  stacked: boolean;
  /** The width of the room the panel shares with the note. */
  availableWidth: () => number;
  onResize: (width: number, done: boolean) => void;
  onCancelResize: () => void;
  onResetWidth: () => void;
  children: React.ReactNode;
}

/**
 * What a panel host holds (§2.1): the resize edge and, scrolling on its own,
 * the statblock. The note view creates the host element itself
 * (`NoteStatblockPanel`) and renders this into it; the template editor
 * renders `PanelHost`, which adds the element.
 */
export function PanelHostContent({ width, stacked, availableWidth, onResize, onCancelResize, onResetWidth, children }: PanelHostContentProps): React.JSX.Element {
  return (
    <>
      {!stacked && (
        <PanelResizeHandle
          width={width}
          availableWidth={availableWidth}
          onResize={onResize}
          onCancel={onCancelResize}
          onReset={onResetWidth}
        />
      )}
      <div className="atlas-sb-note-panel__scroll">
        {children}
      </div>
    </>
  );
}

/**
 * The host element of the statblock beside a note, `.atlas-sb-note-panel`,
 * with its width, as the note view builds it: the template editor draws its
 * card in it, so the card gets the same classes, width and theme rules.
 */
export const PanelHost = forwardRef<HTMLDivElement, PanelHostContentProps>((props, ref) => {
  const style: HostStyle = { '--atlas-sb-panel-width': `${props.width}px` };
  return (
    <div ref={ref} className="atlas-vtt-plugin atlas-sb-note-panel" style={style}>
      <PanelHostContent {...props} />
    </div>
  );
});

PanelHost.displayName = 'PanelHost';
