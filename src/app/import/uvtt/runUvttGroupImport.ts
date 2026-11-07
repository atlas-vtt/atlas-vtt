import { type App } from 'obsidian';
import { formatList, t } from '../../i18n';
import type { AssetService } from '../../services/AssetService';
import { showNotice } from '../../ui/notice';
import type { UvttFloor } from './importUvttFloors';
import { runUvttFloorsImport } from './runUvttFloorsImport';
import { PROBLEM_NOTICE_MS, runUvttImport, runUvttSourcesImport } from './runUvttImport';
import { floorNaming } from './uvttFloorNames';
import { floorFilesProblem, floorsProblem } from './uvttFloors';
import { readUvttSource, type UvttSource } from './uvttSource';

/** What the GM is asked when files can be the floors of one scene: the names and order suggested. */
export interface FloorsRequest {
  sceneName: string;
  /** Bottom first. */
  floors: UvttFloor[];
}

/** The GM's answer: the floors of one scene, as named and ordered (bottom first), or a scene of each file. */
export type FloorsChoice = { kind: 'levels'; sceneName: string; floors: UvttFloor[] } | { kind: 'scenes' };

/** Asks the GM how to import files that can be floors; null when they cancel. */
export type ChooseFloors = (request: FloorsRequest) => Promise<FloorsChoice | null>;

/** A scene an import added. */
export interface ImportedScene {
  name: string;
  scenePath: string;
}

/** Reads every file, telling the GM of each that is refused; the rest come back in the order given. */
async function readSources(files: readonly File[]): Promise<UvttSource[]> {
  const progress = showNotice(t('uvttFloors.reading', { files: formatList(files.map((file) => file.name)) }), 0);
  const sources: UvttSource[] = [];
  for (const file of files) {
    const source = await readUvttSource(file);
    if ('ok' in source) showNotice(t('uvtt.couldNot', { file: file.name, problem: source.problem }), PROBLEM_NOTICE_MS);
    else sources.push(source);
  }
  progress.hide();
  return sources;
}

/** A scene of each file, after telling the GM why they did not become the floors of one. */
function separately(reason: string): void {
  showNotice(t('uvttFloors.separately', { reason }), PROBLEM_NOTICE_MS);
}

/**
 * Imports Universal VTT files picked or dropped together. Files that can be the floors of one
 * scene (a grid in common, within the limits together) are offered as that, and `chooseFloors`
 * asks the GM: one scene with a level per file, or a scene of each. Files that cannot are each a
 * scene of their own, and the GM is told why. Without `chooseFloors`, or for one file, each file
 * is a scene. Returns the scenes added.
 */
export async function runUvttGroupImport(app: App, assetService: AssetService, files: readonly File[], collectionId: string, chooseFloors?: ChooseFloors): Promise<ImportedScene[]> {
  if (files.length < 2 || !chooseFloors) return runUvttImport(app, assetService, files, collectionId);
  // Checked before anything is read: reading holds every file's image until the GM has chosen
  const sizes = floorFilesProblem(files.map((file) => ({ bytes: file.size })));
  if (sizes) {
    separately(sizes);
    return runUvttImport(app, assetService, files, collectionId);
  }

  const sources = await readSources(files);
  if (sources.length < 2) return runUvttSourcesImport(app, assetService, sources, collectionId);
  const problem = floorsProblem(sources);
  if (problem) {
    separately(problem);
    return runUvttSourcesImport(app, assetService, sources, collectionId);
  }

  const naming = floorNaming(sources);
  const choice = await chooseFloors({ sceneName: naming.sceneName, floors: naming.floors.map(({ file, name }) => ({ source: file, name })) });
  if (!choice) return [];
  if (choice.kind === 'scenes') return runUvttSourcesImport(app, assetService, sources, collectionId);
  const imported = await runUvttFloorsImport(app, assetService, choice.floors, choice.sceneName, collectionId);
  return imported ? [imported] : [];
}
