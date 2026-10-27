import { useCallback, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { createDungeonScene } from '../../../dungeons/scene/createDungeonScene';
import { maxPxPerCell } from '../../../dungeons/render/layoutSize';
import { dungeonStyle } from '../../../dungeons/styleCatalog';
import type { DungeonWorkerClient } from '../../../dungeons/worker/DungeonWorkerClient';
import { AssetService } from '../../../services/AssetService';
import { showNotice } from '../../../ui/notice';
import { parentPath } from '../../../utils/pathUtils';
import { t } from '../../../i18n';
import { saveDungeonExport, type DungeonExportKind } from './dungeonExports';
import type { DungeonState } from './useDungeonState';

/** How a map PNG is saved. */
export interface MapExportOptions {
  pxPerCell: number;
  transparent: boolean;
}

/** A scene the generator made. */
export interface CreatedDungeonScene {
  name: string;
  scenePath: string;
  /** The level the scene opens on: its entry floor; unset for a dungeon of one floor. */
  entryLevel?: string;
}

export interface GeneratorActions {
  creating: boolean;
  /** Why the last scene could not be created. */
  problem: string | null;
  create: () => Promise<void>;
  /** The largest cell a map PNG of the shown dungeon may have; null until it is generated. */
  maxCell: number | null;
  exportAs: (kind: DungeonExportKind, map?: MapExportOptions) => Promise<void>;
}

interface ActionOptions {
  app: App;
  client: DungeonWorkerClient;
  state: DungeonState;
  collectionId: string;
  onCreated: (scene: CreatedDungeonScene) => void;
  onBusyChange?: ((busy: boolean) => void) | undefined;
}

/** Creating the scene and saving exports from what the panel shows. */
export function useGeneratorActions({ app, client, state, collectionId, onCreated, onBusyChange }: ActionOptions): GeneratorActions {
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const latest = useRef({ state, collectionId, onCreated, onBusyChange });
  latest.current = { state, collectionId, onCreated, onBusyChange };
  const busy = useRef(false);

  const create = useCallback(async (): Promise<void> => {
    const now = latest.current;
    const { request, model, settings } = now.state;
    const name = now.state.name.trim();
    if (busy.current || !name) return;
    busy.current = true;
    setCreating(true);
    setProblem(null);
    now.onBusyChange?.(true);
    try {
      const assetService = AssetService.getInstance(app);
      await assetService.initialize();
      const result = await createDungeonScene(app, assetService, {
        name,
        request,
        // The dungeon as shown, hidden wings included; generated anew where none arrived yet.
        ...(model ? { model } : {}),
        style: dungeonStyle(settings.style),
        view: settings.view,
        collectionId: now.collectionId,
      });
      if (result.ok) latest.current.onCreated({ name: result.name, scenePath: result.scenePath, ...(result.entryLevel && { entryLevel: result.entryLevel }) });
      else setProblem(result.problem);
    } catch (error) {
      console.error('[Atlas] Creating a dungeon scene failed', error);
      setProblem(t('dungeon.createFailed'));
    } finally {
      busy.current = false;
      setCreating(false);
      latest.current.onBusyChange?.(false);
    }
  }, [app]);

  const exportAs = useCallback(async (kind: DungeonExportKind, map?: MapExportOptions): Promise<void> => {
    const { state: now, collectionId: collection } = latest.current;
    if (!now.model) return;
    try {
      const path = await saveDungeonExport({ app, render: (job) => client.render(job) }, kind, {
        request: now.request,
        model: now.model,
        name: now.name,
        style: dungeonStyle(now.settings.style),
        view: now.settings.view,
        floor: now.floor,
        collectionId: collection,
        ...map,
      });
      showNotice(t('dungeon.export.saved', { name: path.slice(path.lastIndexOf('/') + 1), folder: parentPath(path) }));
    } catch (error) {
      console.error('[Atlas] A dungeon export failed', error);
      showNotice(t('dungeon.export.failed'));
    }
  }, [app, client]);

  return {
    creating,
    problem,
    create,
    maxCell: state.model ? maxPxPerCell(state.model, state.settings.view) : null,
    exportAs,
  };
}
