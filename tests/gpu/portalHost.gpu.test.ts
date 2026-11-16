import '../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import css from '../../styles/_portal-host.scss?inline';
import { portalHost, releasePortalHosts } from '../../src/app/host/portalHost';

/** Obsidian's own rule (app.css): whatever follows its app container in the body takes no drag. */
const OBSIDIAN_RULE = 'body.is-frameless > .app-container ~ * { -webkit-app-region: no-drag; }';

const regionOf = (element: Element): string => getComputedStyle(element).getPropertyValue('-webkit-app-region');

/** A fixed, stacked layer as Atlas' menus and dialogs are. */
function layer(parent: HTMLElement, zIndex: number): HTMLElement {
  const element = parent.createDiv();
  Object.assign(element.style, { position: 'fixed', left: '10%', top: '20px', width: '50%', height: '30px', zIndex: String(zIndex) });
  return element;
}

/** What Atlas renders into its host must lay out, stack and take window drag as a child of <body> did. */
describe('Atlas\' portal host', () => {
  const styles = document.createElement('style');
  styles.textContent = `${OBSIDIAN_RULE}\n${css}`;
  const appContainer = document.createElement('div');
  appContainer.className = 'app-container';

  beforeEach(() => {
    document.head.append(styles);
    document.body.classList.add('is-frameless');
    document.body.append(appContainer);
  });

  afterEach(() => {
    releasePortalHosts();
    appContainer.remove();
    styles.remove();
    document.body.classList.remove('is-frameless');
  });

  it('adds no box: a layer in it lies and stacks where it would on <body>', () => {
    const host = portalHost();
    expect(host.parentElement).toBe(document.body);
    expect(getComputedStyle(host).display).toBe('contents');
    const inHost = layer(host, 5);
    const onBody = layer(document.body, 4);
    expect(inHost.getBoundingClientRect().toJSON()).toEqual(onBody.getBoundingClientRect().toJSON());
    const { x, y } = inHost.getBoundingClientRect();
    expect(document.elementFromPoint(x + 1, y + 1)).toBe(inHost);
    onBody.remove();
  });

  it('keeps what it holds out of a frameless window\'s drag region, as Obsidian does for <body>\'s children', () => {
    const inHost = layer(portalHost(), 1);
    expect(regionOf(inHost)).toBe('no-drag');
  });

  it('is one per document, and gone with what it holds once released', () => {
    const host = portalHost();
    host.createDiv();
    expect(portalHost(document)).toBe(host);
    releasePortalHosts();
    expect(host.isConnected).toBe(false);
    expect(document.body.querySelector('.atlas-portal-host')).toBeNull();
  });
});
