import type { Message } from '../../types';

/** The Armarium in the asset manager, and installing its free collections with a click. */
export const armarium = {
  'armarium.title': 'Armarium',
  'armarium.page': 'The Armarium, Atlas\' library of collections',
  'armarium.loading': 'Loading the Armarium',
  'armarium.offlineBody': 'The Armarium is on atlas-vtt.dev and needs an internet connection.',
  'armarium.command': 'Open the Armarium',
  'armarium.backToLibrary': 'Back to the library',
  'armarium.openInBrowser': 'Open in browser',
  'armarium.reload': 'Reload',
  'armarium.busy': 'Another collection is being installed. Finish its review first.',
  'armarium.unreachable': 'The Armarium could not be reached. Check your connection and try again.',
  'armarium.listFailed': 'The Armarium did not answer as expected. Try again in a moment.',
  'armarium.notListed': 'This collection is no longer offered in the Armarium.',
  'armarium.versionChanged': '{name} changed since the page was loaded: version {version} is offered now. Reload the Armarium and try again.',
  'armarium.downloading': 'Downloading {name}…',
  'armarium.downloadFailed': '{name} could not be downloaded. Check your connection and try again.',
  'armarium.mismatch': 'The download of {name} is not the file the Armarium lists, so nothing was installed.',
  'armarium.failed': 'Installing from the Armarium failed.',
  'armarium.badLink': 'This install link is incomplete. Open the collection in the Armarium and try again.',
} as const satisfies Record<string, Message>;
