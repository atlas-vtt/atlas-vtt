import type { App, TAbstractFile } from 'obsidian';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { partyOf, type PartyMember } from '../../../campaigns/campaignParty';
import type { Campaign } from '../../../campaigns/campaignTypes';
import { scenePlacedTokens } from '../../../campaigns/scenePlacedTokens';
import { AssetService } from '../../../services/AssetService';
import { resourceUrl } from './libraryPictures';

/** A player character's face, with its art as a resource URL. */
export interface PartyFace extends PartyMember {
  src: string;
}

/** Each campaign's party, by campaign id: the player characters on its last scene. */
export type CampaignParties = ReadonlyMap<string, readonly PartyFace[]>;

const NO_PARTIES: CampaignParties = new Map();

/** How long a scene file must be quiet before its party is read again: a map being played saves often. */
export const PARTY_RELOAD_MS = 1500;

/** Whether the element is on screen: connected and not inside a hidden tab. */
function isShown(element: HTMLElement | null): boolean {
  if (!element?.isConnected) return false;
  return typeof element.checkVisibility !== 'function' || element.checkVisibility();
}

async function readParties(app: App, lastScenes: ReadonlyMap<string, string>): Promise<{ parties: CampaignParties; paths: Set<string> }> {
  const assets = AssetService.getInstance(app);
  const [scenes, tokens] = await Promise.all([assets.getAssets(undefined, 'scene'), assets.getAssets(undefined, 'token')]);
  const pathOf = new Map(scenes.map((scene) => [scene.id, scene.data?.mapPath]));
  const parties = new Map<string, PartyFace[]>();
  const paths = new Set<string>();
  await Promise.all([...lastScenes].map(async ([campaignId, sceneId]) => {
    const path = pathOf.get(sceneId);
    if (!path) return;
    paths.add(path);
    const placed = await scenePlacedTokens(app, path);
    const faces = placed ? partyOf(placed, tokens).flatMap((member) => {
      const src = resourceUrl(app, member.artPath);
      return src ? [{ ...member, src }] : [];
    }) : [];
    if (faces.length > 0) parties.set(campaignId, faces);
  }));
  return { parties, paths };
}

/**
 * The player characters who stood on each campaign's last scene, read from the scene's file. A
 * change of the library or of one of those files reads them again once things are quiet
 * (`PARTY_RELOAD_MS`), and only while `rootRef` is shown; a hidden dashboard reads them when it is
 * shown again. Only the newest read is applied. Empty while unknown.
 */
export function useCampaignParties(app: App, campaigns: readonly Campaign[], rootRef: RefObject<HTMLElement | null>): CampaignParties {
  const [parties, setParties] = useState<CampaignParties>(NO_PARTIES);
  // Only a change of which scene was played last asks for a new read, not every edit of a campaign.
  const key = JSON.stringify(campaigns.flatMap((campaign) => (campaign.lastScene ? [[campaign.id, campaign.lastScene]] : [])));
  const lastScenes = useMemo(() => new Map(JSON.parse(key) as [string, string][]), [key]);

  useEffect(() => {
    if (lastScenes.size === 0) {
      setParties(NO_PARTIES);
      return undefined;
    }
    let current = true;
    let latest = 0;
    let stale = false;
    let timer: number | null = null;
    let watched = new Set<string>();

    const load = (): void => {
      const run = ++latest;
      stale = false;
      readParties(app, lastScenes)
        .then(({ parties: next, paths }) => {
          if (!current || run !== latest) return;
          watched = paths;
          setParties(next);
        })
        .catch((error: unknown) => console.error('[Dashboard] Reading the campaigns\' parties failed:', error));
    };
    const loadIfShown = (): void => {
      if (stale && isShown(rootRef.current)) load();
    };
    const reloadLater = (): void => {
      stale = true;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        loadIfShown();
      }, PARTY_RELOAD_MS);
    };
    const onModify = (file: TAbstractFile): void => {
      if (watched.has(file.path)) reloadLater();
    };

    stale = true;
    loadIfShown();
    const workspaceRefs = [
      app.workspace.on('atlas-vtt:refresh-assets', reloadLater),
      // A dashboard in a tab behind others is hidden; it catches up once it is shown.
      app.workspace.on('active-leaf-change', loadIfShown),
      app.workspace.on('layout-change', loadIfShown),
    ];
    const vaultRef = app.vault.on('modify', onModify);
    return () => {
      current = false;
      if (timer !== null) window.clearTimeout(timer);
      for (const ref of workspaceRefs) app.workspace.offref(ref);
      app.vault.offref(vaultRef);
    };
  }, [app, lastScenes, rootRef]);

  return parties;
}
