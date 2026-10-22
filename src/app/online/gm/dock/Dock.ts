import type { WorkspaceLeaf } from 'obsidian';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { sceneStoreOf, selectedTokenIds, type SceneStore } from '../atlasView.ts';
import { accountActions, MENU_WIDTH, renderMenu, type MenuActions } from './ConnectionMenu.ts';
import { campaignPick, type CampaignPick } from './campaignPicker.ts';
import { DockButton } from './dockButton.ts';
import type { DockDeps } from './dockDeps.ts';
import { copyText, detached, isInsideControl, isPlaced, place, roomAbove, rowOf, BAR_GAP } from './dockDom.ts';
import { qrTableOf, tableFactsOf, viewFactsOf, type ViewStoreState } from './dockFacts.ts';
import { CLOSED, close, closesDiceLog, escapeCloses, escapeClosesQr, keyStaysInControl, makesWay, open, outsidePressCloses, pressClosesQr, tableChanged, toggle, type DockState, type Surface, type TableFacts, type ViewFacts } from './dockState.ts';
import { DockTooltip } from './dockTooltip.ts';
import { FeedbackDraft } from './feedbackForm.ts';
import { gateRowActions } from './gateRows.ts';
import { InviteQr } from './inviteQr.ts';
import { KNOCK_ROOM, knockCards, KnockStack, restCards, stackCards } from './knockStack.ts';
import { DockSurface } from './dockSurface.ts';
import { playerCodeCopier } from './playerCodes.ts';
import { PANEL_WIDTH, panelView, renderPanel, type PanelActions } from './OnlinePanel.ts';
import { badgeOf, isRunning, menuModel, tableTitle, tooltipOf, type OnlineSnapshot, type SceneFacts } from './panelModel.ts';

export type { DockDeps } from './dockDeps.ts';

let nextSurface = 0;

/**
 * The GM's control on one Atlas map view: the button at the bottom left, and the menu or panel it opens
 * above itself. It keeps its two nodes in Atlas's bottom row while the view lives.
 */
export class Dock {
  readonly root: HTMLElement;
  readonly spacer: HTMLElement;
  private readonly leaf: WorkspaceLeaf;
  private readonly container: HTMLElement;
  private readonly store: SceneStore;
  private readonly deps: DockDeps;
  private readonly button: DockButton;
  private readonly tooltip: DockTooltip;
  /** Who waits to be let in, and players' rest requests, as cards over the control. */
  private readonly knocks: KnockStack;
  /** The invite link as a QR code, on a card beside the control. */
  private readonly qr: InviteQr;
  private readonly surface: DockSurface;
  private readonly surfaceId = `atlas-online-surface-${++nextSurface}`;
  private state: DockState = CLOSED;
  /** The campaign the GM picked for the next table; null until they pick one. */
  private picked: string | null = null;
  /** What the GM typed into the campaign search; empty again whenever the menu closes. */
  private query = '';
  private table: TableFacts;
  private view: ViewFacts;
  private layer: HTMLElement | null = null;
  private layerKind: Surface = 'closed';
  private shownKey = '';
  private frame: number | null = null;
  /** The panel's feedback form, kept while the control closes. */
  private readonly feedback: FeedbackDraft;
  private readonly cleanups: (() => void)[] = [];

  constructor(leaf: WorkspaceLeaf, container: HTMLElement, store: SceneStore, deps: DockDeps) {
    this.leaf = leaf;
    this.container = container;
    this.store = store;
    this.deps = deps;
    this.feedback = new FeedbackDraft(deps.feedback, () => this.update());
    // Made in the view's own document (a popout's too), then kept apart until the row is there.
    this.root = detached(container, { cls: 'atlas-online-dock' });
    this.spacer = detached(container, { cls: 'atlas-online-room', attr: { 'aria-hidden': 'true' } });
    const content = this.root.createDiv({ cls: 'atlas-online-dock__content' });
    this.button = new DockButton(this.root, content, (byKeyboard) => this.toggle(byKeyboard));
    this.tooltip = new DockTooltip(this.button.pin, this.button.button);
    this.knocks = new KnockStack(this.root, container, this.button.button);
    this.qr = new InviteQr(this.root, container, () => this.update());
    this.surface = new DockSurface({ root: this.root, maxHeight: (bottom) => this.maxHeight(bottom), moved: () => (this.knocks.reflow(), this.qr.fit()) });
    this.table = tableFactsOf(deps.api.snapshot());
    this.view = viewFactsOf(store.getState());
    this.listen();
    this.mount();
    this.update();
  }

  /** The window the control's listeners belong to. */
  get win(): Window {
    return this.container.win;
  }

  /** Opens the control on its menu or panel, focus in it (the Start command). */
  open(): void {
    this.go(open(this.state, this.table), true);
  }

  /** Opens or closes the control (the button, and the toggle command). */
  toggle(byKeyboard: boolean): void {
    this.go(toggle(this.state, this.table), byKeyboard);
  }

  /** Closes the control: another surface (the table's log) opened over its place. */
  makeWay(): void {
    if (this.state.surface !== 'closed') this.go(close(this.state), false);
  }

  dispose(): void {
    if (this.frame !== null) this.win.cancelAnimationFrame(this.frame);
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.tooltip.dispose();
    this.knocks.dispose();
    this.qr.dispose();
    this.surface.dispose();
    this.root.remove();
    this.spacer.remove();
  }

  private listen(): void {
    const { win, doc } = this.container;
    const add = <T extends Event>(target: EventTarget, type: string, run: (event: T) => void, capture: boolean): void => {
      const listener = (event: Event): void => run(event as T);
      target.addEventListener(type, listener, capture);
      this.cleanups.push(() => target.removeEventListener(type, listener, capture));
    };
    add<KeyboardEvent>(win, 'keydown', (event) => this.escape(event), true);
    add<PointerEvent>(doc, 'pointerdown', (event) => {
      const press = { button: event.button, inside: isInsideControl(this.root, event.target) };
      if (pressClosesQr(press)) this.qr.close();
      if (outsidePressCloses(this.state.surface, press)) this.go(close(this.state), false);
    }, true);
    // Keys pressed in the control never reach the map: Enter would toggle the dice log, Delete delete the selected tokens.
    add<KeyboardEvent>(this.root, 'keydown', (event) => {
      if (keyStaysInControl(event)) event.stopPropagation();
    }, false);
    this.cleanups.push(this.deps.api.onChange(() => this.update()), this.deps.account.onChange(() => this.update()), this.deps.campaigns.onChange(() => this.update()));
    this.cleanups.push(this.store.subscribe((state) => {
      const view = viewFactsOf(state);
      if (makesWay(this.state.surface, this.view, view)) this.go(close(this.state), false);
      this.view = view;
      if (this.state.surface === 'panel') this.schedule();
    }));
    const mutations = new MutationObserver(() => this.mount());
    mutations.observe(this.container, { childList: true, subtree: true });
    this.cleanups.push(() => mutations.disconnect());
    // The view's size bounds the open surface's; refitted on the next frame, outside the observer's callback.
    const resizes = new ResizeObserver(() => this.win.requestAnimationFrame(() => (this.surface.fit(), this.qr.fit())));
    resizes.observe(this.container);
    this.cleanups.push(() => resizes.disconnect());
  }

  /** Puts the two nodes back into the row whenever Atlas rebuilt it; nothing while the view has no row. */
  private mount(): void {
    // Called on every change of the view's DOM: nothing to look up while both nodes stand.
    if (this.root.isConnected && this.spacer.isConnected) return;
    const row = rowOf(this.container);
    if (row === null || isPlaced(row, this.root, this.spacer)) return;
    place(row, this.root, this.spacer);
  }

  private escape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || this.state.surface === 'closed') return;
    // Not `instanceof`: a node of a popout window is none of this window's classes.
    const target = event.target !== null && 'nodeType' in event.target ? (event.target as Node) : null;
    const onNothing = target === null || target === this.container.doc.body;
    const inThisView = (target !== null && this.container.contains(target)) || (onNothing && this.container.closest('.workspace-leaf')?.hasClass('mod-active') === true);
    const inSurface = target !== null && (this.surface.current?.contains(target) ?? false);
    const key = { inThisView, inSurface, handledElsewhere: handledByAnotherControl(event), composing: event.isComposing };
    // The QR card goes first; the surface it hangs from stays.
    if (this.qr.isOpen ? !escapeClosesQr(key) : !escapeCloses(this.state.surface, key)) return;
    event.preventDefault();
    if (this.qr.isOpen) this.qr.close();
    else this.go(close(this.state), false);
  }

  /** Moves to `next`, opening, changing or closing the surface. */
  private go(next: DockState, byKeyboard: boolean): void {
    const before = this.state.surface;
    this.state = next;
    if (before === 'closed' && next.surface !== 'closed') void this.deps.account.refresh(false); // a grant or sign-out made elsewhere shows
    if (closesDiceLog(before, next.surface, this.view)) (this.store.getState() as ViewStoreState).setDiceLogOpen?.(false);
    if (before === 'closed' && next.surface !== 'closed') this.deps.opened?.(this.leaf);
    this.update();
    if (before !== 'closed' && next.surface === 'closed' && this.root.contains(this.root.doc.activeElement)) this.button.button.focus({ preventScroll: true });
    if (byKeyboard && before === 'closed' && this.layer !== null) {
      // The chosen campaign takes focus first, as a radio group's checked radio does.
      const first = this.layer.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ?? this.layer.querySelector<HTMLElement>('button:not([disabled]), input');
      first?.focus({ preventScroll: true });
    }
  }

  private schedule(): void {
    if (this.frame !== null) return;
    this.frame = this.win.requestAnimationFrame(() => {
      this.frame = null;
      this.update();
    });
  }

  private update(): void {
    const snapshot = this.deps.api.snapshot();
    const table = tableFactsOf(snapshot);
    this.state = tableChanged(this.state, this.table, table);
    this.table = table;
    const surface = this.state.surface;
    this.button.setBadge(badgeOf(snapshot, this.state.alert));
    this.button.setOpen(surface !== 'closed', surface === 'closed' ? null : this.surfaceId);
    // Who waits stands over the control, where the closed control's tooltip would.
    const { api } = this.deps;
    const cards = stackCards([...knockCards(snapshot.gate?.waiting ?? [], api.gate), ...restCards(snapshot.rests, api.rests)], snapshot.cardOrder);
    this.knocks.update(cards, () => api.gate.moved());
    this.tooltip.setText(tooltipOf(snapshot));
    this.tooltip.setEnabled(surface === 'closed' && cards.length === 0);
    const width = Math.min(surface === 'panel' ? PANEL_WIDTH : MENU_WIDTH, rowOf(this.container)?.clientWidth ?? Infinity);
    // Before the surface is drawn, whose button says whether the card is open: a table that stopped has closed it.
    this.qr.update(surface === 'closed' ? null : qrTableOf(snapshot), width);
    if (surface === 'closed') return this.closeSurface();
    const scene = this.sceneFacts(snapshot);
    const changedKind = this.layer === null || this.layerKind !== surface;
    const layer = changedKind ? this.newLayer(surface) : this.layer;
    if (layer === null) return;
    const key = surface === 'menu' ? this.drawMenu(layer, snapshot, scene, changedKind) : this.drawPanel(layer, snapshot, scene, changedKind);
    this.shownKey = key;
    if (!changedKind) return;
    this.layer = layer;
    this.layerKind = surface;
    this.surface.open(layer, width);
  }

  /** A content layer for `surface`, named as the dialog the button controls; the layer it replaces gives up the name. */
  private newLayer(surface: Surface): HTMLElement {
    this.layer?.removeAttribute('id');
    return detached(this.root, { attr: { id: this.surfaceId, role: 'dialog', 'aria-label': surface === 'panel' ? 'Online table' : 'Online play' } });
  }

  private drawMenu(layer: HTMLElement, snapshot: OnlineSnapshot, scene: SceneFacts, fresh: boolean): string {
    const model = menuModel(snapshot, scene, this.deps.account.view(), this.qr.isOpen, this.pick());
    const key = JSON.stringify(model);
    if (fresh || key !== this.shownKey) renderMenu(layer, model, this.menuActions());
    return key;
  }

  private drawPanel(layer: HTMLElement, snapshot: OnlineSnapshot, scene: SceneFacts, fresh: boolean): string {
    const view = panelView(snapshot, scene, this.feedback.view(), this.qr.isOpen, tableTitle(snapshot, this.pick()));
    const key = JSON.stringify(view);
    if (fresh || key !== this.shownKey) renderPanel(layer, view, this.panelActions(scene));
    return key;
  }

  private closeSurface(): void {
    if (this.layer === null) return;
    this.layer.removeAttribute('id');
    this.layer = null;
    this.layerKind = 'closed';
    this.shownKey = '';
    this.query = '';
    this.surface.close();
  }

  private sceneFacts(snapshot: OnlineSnapshot): SceneFacts {
    const running = isRunning(snapshot.status);
    return {
      isShared: (running ? snapshot.sharedLeaf : this.leaf) === this.leaf,
      tokens: running ? snapshot.sharedTokens : this.store.getState().objects.tokens,
      selected: selectedTokenIds(this.store.getState()),
    };
  }

  /** The campaigns, and the one the next table would play. */
  private pick(): CampaignPick {
    return campaignPick(this.deps.campaigns.list(), this.picked, this.query);
  }

  private menuActions(): MenuActions {
    return {
      ...accountActions(this.deps.account),
      ...gateRowActions(this.deps.api, this.root),
      start: () => {
        const chosen = this.pick().chosen;
        if (chosen !== null) this.deps.api.start(this.leaf, chosen);
      },
      choose: (campaignId) => {
        this.picked = campaignId;
        this.update();
      },
      search: (query) => {
        this.query = query;
      },
      openCampaigns: () => {
        this.go(close(this.state), false);
        this.deps.openCampaigns();
      },
      stop: () => this.deps.api.stop(),
      share: () => this.deps.api.share(this.leaf),
      copy: () => copyText(this.root, this.deps.api.snapshot().link ?? ''),
      toggleQr: () => this.qr.toggle(),
      hideImage: () => this.deps.api.hideImage(),
      addPlayer: (name) => this.deps.api.addPlayer(name),
      newLink: () => void this.deps.api.newLink(),
    };
  }

  private panelActions(scene: SceneFacts): PanelActions {
    const api = this.deps.api;
    return {
      ...this.menuActions(),
      close: () => this.go(close(this.state), false),
      selectToken: (tokenId) => {
        const snapshot = api.snapshot();
        const shared = isRunning(snapshot.status) ? snapshot.sharedLeaf : this.leaf;
        const store = shared === this.leaf ? this.store : shared === null ? null : sceneStoreOf(shared);
        (store?.getState() as ViewStoreState | undefined)?.setSelection?.([tokenId]);
      },
      mark: (ids) => api.mark(ids),
      unmark: (ids) => api.unmark(ids),
      assign: (ids, playerId) => api.assign(ids, playerId),
      release: (ids) => api.release(ids),
      kick: (playerId) => api.kick(playerId),
      copyPlayerCode: playerCodeCopier(api, this.root),
      newPlayerCode: (playerId) => api.newPlayerCode(playerId),
      renamePlayer: (playerId, name) => api.renamePlayer(playerId, name),
      removeFromCampaign: (playerId) => api.removeFromCampaign(playerId),
      selected: () => (scene.isShared ? selectedTokenIds(this.store.getState()) : []),
      imageSrc: (path) => this.deps.imageSrc(path),
      ...this.feedback.actions,
    };
  }

  /** The surface's tallest height: from its bottom edge up to a gap below the scene tabs, with room for a newcomer's card. */
  private maxHeight(surfaceBottom: number): number {
    const row = rowOf(this.container);
    if (row === null) return Infinity;
    return roomAbove(this.container, row, BAR_GAP) - (row.getBoundingClientRect().bottom - surfaceBottom) - KNOCK_ROOM;
  }
}
