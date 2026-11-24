import React from 'react';
import type { App } from 'obsidian';
import { t } from '../../i18n';
import type { MusicKind } from '../../services/itemBundle/itemBundleFormat';
import type { LibraryFile } from '../../soundLibrary/SoundLibrary';
import { nameOfRelative, parentOfRelative } from '../../soundLibrary/soundPaths';
import { showHostedDialog } from '../../statblocks/editor/hostedDialog';
import { showNotice } from '../../ui/notice';
import { createMusicShareSession, type MusicShareRequest } from '../upload/createShareSession';
import { pickedKind } from '../upload/musicShareRules';
import { libraryTrackTitles } from '../upload/trackTitles';
import { MusicSharePicker } from './MusicSharePicker';
import { HOST_CLASS, HostedShare } from './openItemShare';

/** "Share in the Armarium" of music: the share dialog on `doc`'s body, over whatever is open there. */
export function openMusicShare(app: App, request: MusicShareRequest, doc: Document = activeDocument): void {
  const session = createMusicShareSession(app, request);
  if (session === null) {
    showNotice(t('armariumShare.notReady'));
    return;
  }
  session.start();
  showHostedDialog(doc, HOST_CLASS, (close) => <HostedShare key="share" app={app} session={session} onClose={close} />);
}

/** What files are called together to begin with: the folder they all lie in, else nothing. */
function sharedFolderName(files: readonly LibraryFile[]): string {
  const folders = new Set(files.map((file) => parentOfRelative(file.path)));
  const [only] = folders;
  return folders.size === 1 && only !== undefined && only !== '' ? nameOfRelative(only) : '';
}

/** A share of `files`: a track is named by its title, an album by `name` (a tag's), else by the folder its tracks share. */
function requestFor(kind: MusicKind, files: readonly LibraryFile[], name: string, listing?: string): MusicShareRequest {
  const named = kind === 'music-track' && files[0] ? libraryTrackTitles([files[0]], '').titles[0] ?? '' : name || sharedFolderName(files);
  return { kind, files, name: named, listing };
}

/** Shares files of the Sound library's music root: one as a track, several as an album. */
export function shareMusicFiles(app: App, files: readonly LibraryFile[], name = '', doc?: Document): void {
  if (files.length === 0) return;
  openMusicShare(app, requestFor(files.length === 1 ? 'music-track' : 'music-album', files, name), doc);
}

/** The Sound library's music to choose from, then the share of what was chosen (the Armarium's Share, in Atlas). */
export function pickMusicToShare(app: App, kind: MusicKind, listing?: string, doc: Document = activeDocument): void {
  showHostedDialog(doc, HOST_CLASS, (close) => (
    <MusicSharePicker key="pick" app={app} kind={kind} onClose={close} onPick={(files, name) => {
      close();
      openMusicShare(app, requestFor(pickedKind(kind, files.length), files, name, listing), doc);
    }} />
  ));
}
