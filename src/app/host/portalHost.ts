import { getDomHost } from './dom';

const HOST_CLASS = 'atlas-portal-host';

const hosts = new Set<HTMLElement>();

/**
 * Where Atlas' floating UI joins a document: one element under `<body>` per document, made when first
 * asked for and removed when Atlas unloads (`releasePortalHosts`). React roots, React portals and Radix
 * portals that would render into `<body>` render here instead, and so do Atlas' own layers there, which
 * keeps them in the order they were opened. React listens for events on every element it renders into
 * and never lets go: rendered into `<body>`, each copy of Atlas a reload left behind stayed attached to the
 * page, and in memory, for good. It has `display: contents`, so it adds no box, no stacking context and no
 * containing block (`styles/_portal-host.scss`).
 */
export function portalHost(doc: Document = document): HTMLElement {
  for (const host of hosts) {
    if (!host.isConnected) hosts.delete(host);
    else if (host.ownerDocument === doc) return host;
  }
  // A host an unloaded copy of Atlas made after its release (a view that closed after `onunload` asked for one) would
  // stay in <body> for good, one more per reload: the first host of this copy takes their place.
  for (const stale of doc.body.querySelectorAll<HTMLElement>(`:scope > .${HOST_CLASS}`)) stale.remove();
  const host = getDomHost().createDiv(doc.body, HOST_CLASS);
  hosts.add(host);
  return host;
}

/** Removes every host, with whatever is still in it; React's listeners on them go with them. */
export function releasePortalHosts(): void {
  for (const host of hosts) host.remove();
  hosts.clear();
}
