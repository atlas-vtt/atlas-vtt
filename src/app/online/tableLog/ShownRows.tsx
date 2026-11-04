import type { ImageEntry, LootEntry } from '../protocol/index.ts';
import { ImageIcon } from 'lucide-react';
import { memo, type ReactElement } from 'react';
import type { LootDraw } from '../../loot/lootRoller';
import { rarityTone } from '../../loot/lootRarity';
import { LootItemContent } from '../../react/components/loot/LootItemContent';
import { AuthorDisc } from './AuthorDisc.tsx';
import { reactionsFor, shownName } from './logAuthors.ts';
import type { ThreadStat } from './logThreads.ts';
import type { RowApi, RowFlags } from './panelTypes.ts';
import { ReactionChips } from './ReactionChips.tsx';
import { RowShell } from './RowShell.tsx';
import { ThreadPill } from './ThreadPill.tsx';

interface ShownRowProps extends Omit<RowFlags, 'editing'> {
  readonly time: string;
  /** Its thread's pill, where it has answers and the whole log shows. */
  readonly thread: ThreadStat | null;
  readonly api: RowApi;
}

/** Who showed or handed out something, and when, over what they did. */
function Byline({ who, name, verb, time, api }: { readonly who: string; readonly name: string; readonly verb: string; readonly time: string; readonly api: RowApi }): ReactElement {
  return (
    <div className="atlas-online-log__byline">
      <span className="atlas-online-log__name">{`${shownName(who, name, api.self)} ${verb}`}</span>
      <span className="atlas-online-log__time">{time}</span>
    </div>
  );
}

export interface ImageRowProps extends ShownRowProps {
  readonly entry: ImageEntry;
  /** The image as this viewer can show it, or null while it is not there yet. */
  readonly src: string | null;
  /** Opens the image large; without it the image is only shown here. */
  readonly onOpen: (() => void) | undefined;
}

/** An image the GM showed every player, kept here to look at again; its place is held at its own shape while it loads. */
export const ImageRow = memo(function ImageRow({ entry, src, onOpen, time, thread, api, ...flags }: ImageRowProps): ReactElement {
  const reactions = reactionsFor(entry, api.self);
  const picture = src === null
    ? <span className="atlas-online-log__shown-placeholder"><ImageIcon /></span>
    : <img className="atlas-online-log__shown-image" src={src} alt="" draggable={false} />;
  return (
    <RowShell id={entry.id} className="atlas-online-log__row--shown" reactions={reactions} canEdit={false} canDelete={api.moderator} api={api} editing={false} {...flags}>
      <div className="atlas-online-log__message">
        <AuthorDisc who={entry.who} name={entry.name} size="row" />
        <div className="atlas-online-log__content">
          <Byline who={entry.who} name={entry.name} verb="showed an image" time={time} api={api} />
          <div className="atlas-online-log__shown" style={{ aspectRatio: `${entry.width} / ${entry.height}` }}>
            {onOpen === undefined || src === null ? picture : <button type="button" className="atlas-online-log__shown-open" aria-label="Open the image" onClick={onOpen}>{picture}</button>}
          </div>
          <ReactionChips id={entry.id} reactions={reactions} api={api} />
          <ThreadPill stat={thread} onOpen={() => api.openThread(entry.id)} />
        </div>
      </div>
    </RowShell>
  );
});

export interface LootRowProps extends ShownRowProps {
  readonly entry: LootEntry;
}

/** An item the GM handed out, as the players' loot window shows it, as text only. */
export const LootRow = memo(function LootRow({ entry, time, thread, api, ...flags }: LootRowProps): ReactElement {
  const reactions = reactionsFor(entry, api.self);
  // The loot card reads a draw: the item's text, and neither its note nor the base it came from.
  const draw: LootDraw = { ...entry.item, id: entry.id, source: [], notePath: '', properties: [...entry.item.properties] };
  return (
    <RowShell id={entry.id} className="atlas-online-log__row--shown" reactions={reactions} canEdit={false} canDelete={api.moderator} api={api} editing={false} {...flags}>
      <div className="atlas-online-log__message">
        <AuthorDisc who={entry.who} name={entry.name} size="row" />
        <div className="atlas-online-log__content">
          <Byline who={entry.who} name={entry.name} verb="handed out" time={time} api={api} />
          <div className="atlas-loot-card atlas-online-log__loot" data-rarity={rarityTone(entry.item.rarity)}>
            <LootItemContent draw={draw} />
          </div>
          <ReactionChips id={entry.id} reactions={reactions} api={api} />
          <ThreadPill stat={thread} onOpen={() => api.openThread(entry.id)} />
        </div>
      </div>
    </RowShell>
  );
});
