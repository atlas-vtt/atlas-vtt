import React from 'react';
import { PanelHostContent } from '../panel-frame/PanelHost';
import { StatblockEditorRoot } from '../StatblockEditorRoot';
import type { StatblockPaneProps } from '../statblock-pane/paneTypes';
import './note-statblock-panel.scss';

export interface NotePanelRootProps {
  pane: StatblockPaneProps;
  width: number;
  /** The view is too narrow for two columns: the panel stands above the note and keeps its height. */
  stacked: boolean;
  availableWidth: () => number;
  onResize: (width: number, done: boolean) => void;
  onCancelResize: () => void;
  onResetWidth: () => void;
}

/** What the panel beside a note draws: the line that resizes it and, scrolling on its own, the statblock pane. */
export function NotePanelRoot({ pane, ...host }: NotePanelRootProps): React.JSX.Element {
  return (
    <PanelHostContent {...host}>
      <StatblockEditorRoot surface={{ kind: 'statblock-pane', props: pane }} />
    </PanelHostContent>
  );
}
