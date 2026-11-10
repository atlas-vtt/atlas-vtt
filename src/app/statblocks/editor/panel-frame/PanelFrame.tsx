import React, { forwardRef, memo } from 'react';
import type { App } from 'obsidian';
import type { StatblockTemplate } from '../../model/templateTypes';
import { BlockChromeContext, type BlockChrome } from '../../render/blockChrome';
import { StatblockSheet } from '../../render/StatblockSheet';
import type { StatblockTokenContext } from '../../render/sheetTypes';
import { ValueEditingContext, type ValueEditing } from '../../render/valueSlot';
import type { FieldRecord } from '../../values/fieldValues';
import '../statblock-pane/statblock-pane.scss';
import './panel-frame.scss';

export interface PanelFrameProps {
  /** The capsule above the card: the note's template, or the template being edited. */
  header: React.ReactNode;
  /** Lines about the statblock above the card: a missing template, a conflict, a save that waits. */
  stateBars?: React.ReactNode;
  /** The card (`PanelCard`) or what stands in for it (a skeleton, a state). */
  children: React.ReactNode;
  /** Under the card: what the panel offers there, or the template editor's line. */
  footer?: React.ReactNode;
  /** Last: the note's other properties. */
  tray?: React.ReactNode;
  /** Wraps the header and the body, e.g. in what shows the pane's dice rolls. */
  wrap?: ((content: React.ReactNode) => React.ReactNode) | undefined;
  /** Outside the body: a live region, dialogs. */
  after?: React.ReactNode;
}

/**
 * The statblock pane as both surfaces draw it (§2.1): `.atlas-sb-pane` with
 * the header capsule, then `.atlas-sb-pane-body` with the state bars, the
 * card, the footer and the tray. The note view and the template editor render
 * this one frame, so the card is in the same place with the same classes.
 */
export const PanelFrame = forwardRef<HTMLDivElement, PanelFrameProps>(({ header, stateBars, children, footer, tray, wrap, after }, ref) => {
  const content = (
    <>
      {header}
      <div className="atlas-sb-pane-body">
        {stateBars}
        {children}
        {footer}
        {tray}
      </div>
    </>
  );
  return (
    <div ref={ref} className="atlas-sb-pane">
      {wrap ? wrap(content) : content}
      {after}
    </div>
  );
});

PanelFrame.displayName = 'PanelFrame';

interface FramedSheetProps {
  chrome: BlockChrome | null;
  valueEditing: ValueEditing | null;
  template: StatblockTemplate;
  name: string;
  record: FieldRecord;
  app: App | undefined;
  sourcePath: string | undefined;
  /** Empty headed sections folded into chips under the card (`foldRule.ts`). */
  folded?: ReadonlySet<string> | undefined;
  /** A block whose tabs open (the template editor's selection). */
  reveal?: string | null | undefined;
  /** `preview` in the template editor: the card's "Add to next roll" switches are inert. */
  rollBonuses?: 'live' | 'preview' | undefined;
  /** The player character the note is, whose values its tracked numbers and Tracks show (the note's panel). */
  token?: StatblockTokenContext | undefined;
}

/** The panel's rolls name no token: a roll beside a note heals none. */
const NO_ROLL_TOKENS: readonly [] = [];

/** The runtime card under a surface's chrome; it renders again only when one of these changes, never on hover. */
const FramedSheet = memo(function FramedSheet({
  chrome, valueEditing, template, name, record, app, sourcePath, folded, reveal, rollBonuses, token,
}: FramedSheetProps): React.JSX.Element {
  return (
    <BlockChromeContext.Provider value={chrome}>
      <ValueEditingContext.Provider value={valueEditing}>
        <StatblockSheet
          template={template} name={name} fields={record} variant="full" mode="editing" app={app} sourcePath={sourcePath}
          folded={folded} reveal={reveal} rollBonuses={rollBonuses} token={token} rollTokens={NO_ROLL_TOKENS}
        />
      </ValueEditingContext.Provider>
    </BlockChromeContext.Provider>
  );
});

export interface PanelCardProps extends Omit<FramedSheetProps, 'chrome' | 'valueEditing'> {
  chrome?: BlockChrome | null | undefined;
  valueEditing?: ValueEditing | null | undefined;
  /** Puts something around the sheet inside the card: the template editor's stage. */
  around?: ((sheet: React.ReactNode) => React.ReactNode) | undefined;
}

/**
 * The card both surfaces draw (§2.1): `.atlas-sb-pane-card[data-columns]` with
 * the runtime card in the editing mode. A one-column template keeps the DM
 * screen's widest feed (statblock-pane.scss).
 */
export const PanelCard = forwardRef<HTMLDivElement, PanelCardProps>(({ chrome = null, valueEditing = null, around, ...sheet }, ref) => {
  const drawn = <FramedSheet chrome={chrome} valueEditing={valueEditing} {...sheet} />;
  return (
    <div ref={ref} className="atlas-sb-pane-card" data-columns={sheet.template.layout.maxColumns}>
      {around ? around(drawn) : drawn}
    </div>
  );
});

PanelCard.displayName = 'PanelCard';
