import type { App } from 'obsidian';
import type { ExternalImport } from '../services/collectionBundle/externalImport';

/** An open asset manager, which can show the Armarium and the import review of an install from it. */
export interface ArmariumHost {
  /** Shows the Armarium in place of the library: its front, or one of its pages (`armariumListingUrl`). */
  show(page?: string): void;
  /** Shows the import review of a verified download over the window. */
  review(pending: ExternalImport): void;
}

/**
 * The asset managers that are open, newest last. The command, the install link and an install's review go to the
 * newest, so the GM goes from the store to its review in the window the store is shown in; an asset manager attaches
 * anew when it shows the Armarium, which makes it the newest. One list per app.
 */
export class ArmariumHosts {
  private static readonly lists = new WeakMap<App, ArmariumHosts>();

  static forApp(app: App): ArmariumHosts {
    let hosts = ArmariumHosts.lists.get(app);
    if (!hosts) {
      hosts = new ArmariumHosts();
      ArmariumHosts.lists.set(app, hosts);
    }
    return hosts;
  }

  private readonly hosts: ArmariumHost[] = [];

  /** Adds `host` as the newest; the returned function takes it out again. */
  attach(host: ArmariumHost): () => void {
    this.hosts.push(host);
    return (): void => {
      const index = this.hosts.lastIndexOf(host);
      if (index >= 0) this.hosts.splice(index, 1);
    };
  }

  /** The newest open asset manager, if any. */
  current(): ArmariumHost | null {
    return this.hosts.at(-1) ?? null;
  }
}
