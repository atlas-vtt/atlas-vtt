import { useEffect, useRef } from 'react';
import { type App } from 'obsidian';
import { runUvttGroupImport, type ChooseFloors } from '../../../../import/uvtt/runUvttGroupImport';
import { isUvttFileName } from '../../../../import/uvtt/uvttFileNames';
import { openCreatedScene } from '../../../../import/openCreatedScene';
import { runVideoMapImport } from '../../../../import/videoMaps/runVideoMapImport';
import { isVideoMapPath } from '../../../../pixi/mapImage/video/videoMapFiles';
import { useStableCallback } from '../../../../react/hooks/useStableCallback';
import type { AssetService } from '../../../../services/AssetService';
import { showNotice } from '../../../../ui/notice';

/**
 * Imports map files into a collection: videos become animated maps, and Universal VTT files
 * scenes (several files that share a grid, the floors of one if the GM chooses), of which the
 * last that arrived opens, as a new scene is opened. Where `stay` says so
 * once they arrived, the scenes are only added.
 */
export type ImportMaps = (files: readonly File[], collectionId: string, stay?: () => boolean) => Promise<void>;

export interface UvttImportOptions {
  app: App;
  assetService: AssetService | null;
  /** The asset manager is open; map files dropped on its window are imported while it is. */
  isOpen: boolean;
  isMapCreatorOpen: boolean;
  /** Another dialog of the asset manager is open, which opening a scene would close with it. */
  isBusy: boolean;
  /** Where a map file dropped on the asset manager goes. */
  collectionId: string;
  /** Runs once an imported scene is open: the asset manager closes then, as after a new scene. */
  onSceneOpened: () => void;
  /** Asks how files that can be the floors of one scene are imported; without it each file is a scene. */
  chooseFloors?: ChooseFloors;
}

const MANAGER_WINDOW = '.atlas-asset-manager-container';

/** The types a browser names the videos an animated map may be while they are dragged. */
const VIDEO_MAP_TYPES: ReadonlySet<string> = new Set(['video/webm', 'video/mp4', 'video/x-m4v']);

/** The files of `files` that are map files by their names: Universal VTT maps and animated maps. */
export function mapFilesAmong(files: readonly File[]): File[] {
  return files.filter((file) => isUvttFileName(file.name) || isVideoMapPath(file.name));
}

/**
 * Whether a drag carries a file that may be a map file. A drag names no files, only their types,
 * and the browser knows none for a Universal VTT file's extension: of the files of a type it
 * knows, only videos are taken.
 */
export function mayCarryMapFile(transfer: Pick<DataTransfer, 'items'>): boolean {
  return Array.from(transfer.items).some((item) => item.kind === 'file' && (item.type === '' || VIDEO_MAP_TYPES.has(item.type)));
}

function overManager(event: DragEvent): DataTransfer | null {
  const { target, dataTransfer } = event;
  return dataTransfer && target instanceof Element && target.closest(MANAGER_WINDOW) ? dataTransfer : null;
}

function sayNotMaps(files: readonly File[]): void {
  const names = files.map((file) => file.name);
  const last = names.pop();
  const which = names.length > 0 ? `${names.join(', ')} and ${last} are not maps` : `${last} is not a map`;
  showNotice(`${which} Atlas can import. Drop a .dd2vtt, .uvtt or .df2vtt file, or a WebM or MP4 video.`);
}

/**
 * The asset manager's import of map files (Universal VTT maps and videos): the function its map
 * creator calls, and map files dropped anywhere on its window, a folder tile included. The scene of an import opens
 * only for the asset manager that started it, while it is still open and nothing else is open
 * in it that the scene would close: an import takes seconds, and the GM may have moved on.
 */
export function useUvttImport(options: UvttImportOptions): ImportMaps {
  const latest = useRef(options);
  latest.current = options;
  // Counts each opening, so one that closed and opened again is told from the one that asked
  const managerOpenings = useRef(0);
  const creatorOpenings = useRef(0);
  useEffect(() => { if (options.isOpen) managerOpenings.current++; }, [options.isOpen]);
  useEffect(() => { if (options.isMapCreatorOpen) creatorOpenings.current++; }, [options.isMapCreatorOpen]);

  const importMaps = useStableCallback(async (files: readonly File[], collectionId: string, stay?: () => boolean): Promise<void> => {
    const { app, assetService } = latest.current;
    if (!assetService || files.length === 0) return;
    const manager = managerOpenings.current;
    const creator = latest.current.isMapCreatorOpen ? creatorOpenings.current : null;

    const videos = files.filter((file) => isVideoMapPath(file.name));
    if (videos.length > 0) await runVideoMapImport(app, assetService, videos, collectionId);
    const uvttFiles = files.filter((file) => isUvttFileName(file.name));
    if (uvttFiles.length === 0) return;
    const imported = await runUvttGroupImport(app, assetService, uvttFiles, collectionId, latest.current.chooseFloors);
    const last = imported[imported.length - 1];
    const now = latest.current;
    if (!last || !now.isOpen || managerOpenings.current !== manager || now.isBusy) return;
    // A map creator that was not the one asking may hold images waiting to be created
    if (now.isMapCreatorOpen && creatorOpenings.current !== creator) return;
    if (stay?.()) return;
    if (await openCreatedScene(app, last.scenePath, last.name)) now.onSceneOpened();
  });

  // Listened for on the document, ahead of the manager's own handlers: a folder tile takes
  // every drop on it for itself.
  useEffect(() => {
    if (!options.isOpen) return;
    const onDragOver = (event: DragEvent): void => {
      const transfer = overManager(event);
      if (!transfer || !mayCarryMapFile(transfer)) return;
      event.preventDefault();
      transfer.dropEffect = 'copy';
    };
    const onDrop = (event: DragEvent): void => {
      const transfer = overManager(event);
      if (!transfer) return;
      const files = Array.from(transfer.files);
      const maps = mapFilesAmong(files);
      const lookalikes = files.filter((file) => file.type === '' && !maps.includes(file));
      // A drop that holds neither is not for the import; it goes where it would have gone
      if (maps.length === 0 && lookalikes.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (lookalikes.length > 0) sayNotMaps(lookalikes);
      if (maps.length > 0) void importMaps(maps, latest.current.collectionId);
    };
    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('drop', onDrop, true);
    return () => {
      document.removeEventListener('dragover', onDragOver, true);
      document.removeEventListener('drop', onDrop, true);
    };
  }, [options.isOpen, importMaps]);

  return importMaps;
}
