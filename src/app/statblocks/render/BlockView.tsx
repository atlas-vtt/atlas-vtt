import React, { useContext, useMemo } from 'react';
import type { TemplateBlock } from '../model/templateTypes';
import { blockDisplay, type BlockDisplay } from './blockDisplay';
import { BlockFrame } from './BlockFrame';
import { provisionalSheet } from './provisionalSheet';
import { SheetContext, useSheet } from './sheetContext';
import { strandedDividers } from './strandedDividers';
import { CountersView } from './blocks/CountersView';
import { DividerView } from './blocks/DividerView';
import { EntriesView } from './blocks/EntriesView';
import { HeadingView } from './blocks/HeadingView';
import { ImageView } from './blocks/ImageView';
import { LineView } from './blocks/LineView';
import { MetricView } from './blocks/MetricView';
import { PairsView } from './blocks/PairsView';
import { RowView } from './blocks/RowView';
import { ScoresView } from './blocks/ScoresView';
import { ScriptView } from './blocks/ScriptView';
import { SectionView } from './blocks/SectionView';
import { SpellsView } from './blocks/SpellsView';
import { StatView } from './blocks/StatView';
import { TabsView } from './blocks/TabsView';
import { TagsView } from './blocks/TagsView';
import { TextView } from './blocks/TextView';
import { TitleView } from './blocks/TitleView';
import { TrackView } from './blocks/TrackView';
import { ValueEditingContext } from './valueSlot';

/**
 * A list of blocks, each in its frame; the root and every Section and Row render their children with it, Tabs one per
 * panel. A rule left at an edge or under another rule by blocks that hide is not drawn.
 */
export function BlockList({ blocks }: { blocks: readonly TemplateBlock[] }): React.JSX.Element {
  const { state } = useSheet();
  const stranded = strandedDividers(blocks, (block) => blockDisplay(block, state) !== null);
  return <>{blocks.filter((block) => !stranded.has(block.id)).map((block) => <BlockView key={block.id} block={block} />)}</>;
}

function content(block: TemplateBlock, display: BlockDisplay): React.ReactNode {
  switch (block.type) {
    case 'section': return <SectionView block={block} display={display}><BlockList blocks={block.blocks} /></SectionView>;
    case 'row': return <RowView block={block} display={display}><BlockList blocks={block.blocks} /></RowView>;
    case 'tabs': return <TabsView block={block} display={display} renderBlock={(tab) => <BlockView block={tab} />} />;
    case 'title': return <TitleView block={block} display={display} />;
    case 'line': return <LineView block={block} display={display} />;
    case 'stat': return <StatView block={block} display={display} />;
    case 'metric': return <MetricView block={block} display={display} />;
    case 'scores': return <ScoresView block={block} display={display} />;
    case 'tags': return <TagsView block={block} display={display} />;
    case 'text': return <TextView block={block} display={display} />;
    case 'entries': return <EntriesView block={block} display={display} />;
    case 'pairs': return <PairsView block={block} display={display} />;
    case 'track': return <TrackView block={block} display={display} />;
    case 'counters': return <CountersView block={block} display={display} />;
    case 'image': return <ImageView block={block} display={display} />;
    case 'spells': return <SpellsView block={block} display={display} />;
    case 'heading': return <HeadingView block={block} display={display} />;
    case 'divider': return <DividerView />;
    case 'script': return <ScriptView block={block} display={display} renderBlock={(shown) => <BlockView block={shown} />} />;
    case 'opaque': return null;
  }
}

/**
 * One block of a template, rendered for the statblock, or nothing where it hides. In the template editor a tile not
 * named yet is drawn with the field its name will make (`provisionalSheet`), so it looks as it will once named.
 */
export function BlockView({ block }: { block: TemplateBlock }): React.JSX.Element | null {
  const sheet = useSheet();
  const unnamed = useContext(ValueEditingContext)?.drawsUnnamed === true;
  const state = unnamed ? provisionalSheet(block, sheet.state) : sheet.state;
  const own = useMemo(() => (state === sheet.state ? sheet : { ...sheet, state }), [sheet, state]);
  const display = blockDisplay(block, state);
  if (!display) return null;
  // Always behind a provider, so naming the tile keeps its element.
  return <SheetContext.Provider value={own}><BlockFrame block={block} display={display}>{content(block, display)}</BlockFrame></SheetContext.Provider>;
}
