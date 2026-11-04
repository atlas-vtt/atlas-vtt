import type { App, EventRef, TAbstractFile } from 'obsidian';
import { CampaignFiles, type CampaignStorage } from '../campaigns/CampaignFiles';
import { CampaignPlay } from '../campaigns/campaignPlay';
import { CampaignService } from '../campaigns/CampaignService';
import { onPlayedCampaignChange } from '../campaigns/playedCampaign';
import { QuestIds } from '../campaigns/quests/questIds';
import { QuestIndex } from '../campaigns/quests/QuestIndex';
import { bookQuestOrder } from '../online/gm/book/bookQuests.ts';
import type { HandedQuest, QuestGate } from '../online/gm/book/questGate.ts';
import { isImagePath } from './questImages';
import { QuestHandouts } from './questHandouts';

const sameList = (a: readonly HandedQuest[], b: readonly HandedQuest[]): boolean => a.length === b.length && a.every((quest, n) => quest === b[n]);

/** Calls `listener` whenever a vault image is written, made, moved or deleted; returns what stops it. */
function onImageChange(app: App, listener: () => void): () => void {
  const heard = (file: TAbstractFile, oldPath?: string): void => {
    if (isImagePath(file.path) || (oldPath !== undefined && isImagePath(oldPath))) listener();
  };
  const refs: EventRef[] = [
    app.vault.on('modify', (file) => heard(file)),
    app.vault.on('create', (file) => heard(file)),
    app.vault.on('delete', (file) => heard(file)),
    app.vault.on('rename', (file, oldPath) => heard(file, oldPath)),
  ];
  return () => {
    for (const ref of refs) app.vault.offref(ref);
  };
}

/**
 * The quests players read are the quest notes of the campaign this device plays: none while it
 * plays none. They may be others whenever another campaign (or none) is played, a campaign changes,
 * a quest note is written, added, moved or deleted, or an image a quest's text embeds changes. A
 * note is given its id the first time it is handed on, should it have none. Only notes that changed
 * are read again (`QuestHandouts`), and the answer is the same array while no quest changed, so
 * books compare it by identity. The assets of the quests last answered (whole texts, images) are
 * served by hash; nothing else is.
 */
export function campaignQuestGate(
  app: App,
  play: () => CampaignPlay = () => CampaignPlay.forApp(app),
  storage: () => CampaignStorage | undefined = () => CampaignFiles.forApp(app),
  index: () => QuestIndex | undefined = () => QuestIndex.forApp(app),
): QuestGate {
  const ids = new QuestIds(app);
  const handouts = new QuestHandouts(app);
  let last: readonly HandedQuest[] = [];

  const read = async (): Promise<readonly HandedQuest[]> => {
    const campaigns = storage();
    const quests = index();
    const playing = play().playing();
    const list = campaigns === undefined ? [] : new CampaignService(campaigns).list();
    const campaign = playing === null ? undefined : list.find((entry) => entry.id === playing);
    if (campaign === undefined || quests === undefined) {
      handouts.retain(new Set());
      return [];
    }
    const shown = bookQuestOrder(quests.of(campaign, list));
    const idOf = await ids.idsOf(quests.all(), shown);
    const books = await Promise.all(shown.map(async (quest) => {
      const id = idOf.get(quest.path);
      return id === undefined ? null : handouts.of(quest, id);
    }));
    handouts.retain(new Set(shown.map((quest) => quest.path)));
    // Each id once: a book with an id twice would not be read.
    const kept = new Map<string, HandedQuest>();
    for (const book of books) if (book !== null && !kept.has(book.id)) kept.set(book.id, book);
    return [...kept.values()];
  };

  return {
    quests: async (): Promise<readonly HandedQuest[]> => {
      const next = await read();
      if (!sameList(next, last)) last = next;
      return last;
    },
    asset: (hash) => handouts.asset(hash),
    onChange: (listener) => {
      const stops = [
        onPlayedCampaignChange(app, listener, play, storage),
        index()?.onChange(listener) ?? ((): void => undefined),
        onImageChange(app, () => {
          if (handouts.embedsImages()) listener();
        }),
      ];
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
}
