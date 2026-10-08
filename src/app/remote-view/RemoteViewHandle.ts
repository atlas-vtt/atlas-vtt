/**
 * The handle an extension holds on one remote map view (`RemoteView`): it owns the view, takes
 * what the extension feeds and tells it what the player did. Every listener runs guarded, and
 * everything is let go once the view closes, whoever closed it.
 */
import type { WorkspaceLeaf } from 'obsidian';
import type { RemoteView } from '../../api/types/remoteViews';
import type { Disposer } from '../../api/types/common';
import { callGuarded, ListenerSet } from './listeners';
import type { RemoteMapView } from './RemoteMapView';
import type { RemoteViewOwner } from './remoteOwners';
import { registerRemoteControls } from './remoteControls';
import { RemoteViewDice, type RollListener } from './RemoteViewDice';
import { RemoteViewMotion } from './RemoteViewMotion';
import { RemoteViewScene } from './RemoteViewScene';
import type { TokenMove } from '../../api/types/tokens';
import type { ViewCamera } from '../services/presentedCamera';

const noop: Disposer = () => undefined;

export class RemoteViewHandle implements RemoteViewOwner {
  readonly ready: Promise<boolean>;
  private view: RemoteMapView | null = null;
  private done = false;
  private settle: (opened: boolean) => void = () => undefined;
  private readonly closeListeners = new ListenerSet<() => void>('onClose');
  private facade: RemoteView | null = null;
  private scene: RemoteViewScene | null = null;
  private motion: RemoteViewMotion | null = null;
  private dice: RemoteViewDice | null = null;
  private stopControls: Disposer = noop;

  constructor(readonly owner: string, readonly title: string, readonly icon: string, readonly leaf: WorkspaceLeaf, private readonly maxDice: number) {
    this.ready = new Promise((resolve) => { this.settle = resolve; });
  }

  get isClosed(): boolean {
    return this.done;
  }

  /** The view this handle owns, once it opened; null before and after. */
  get openView(): RemoteMapView | null {
    return this.done ? null : this.view;
  }

  /** What the extension holds: the handle's methods, frozen. */
  get api(): RemoteView {
    const view = this.view;
    if (!view) throw new Error('[Atlas API] RemoteView: the remote view has not opened.');
    this.facade ??= Object.freeze({
      viewId: view.viewId,
      setScene: (scene: unknown): void => { this.scene?.setScene(scene); this.motion?.checkDrag(); },
      setPlayer: (state: unknown): void => { this.scene?.setPlayer(state); this.motion?.checkDrag(); },
      setCamera: (camera: ViewCamera, options?: { animate?: boolean; padded?: boolean }): void => { this.motion?.setCamera(camera, options); },
      cancelDrag: (): void => { this.motion?.cancelDrag(); },
      onTokenDrop: (listener: (move: TokenMove) => void): Disposer => this.motion?.drops.add(listener) ?? noop,
      onCameraMoved: (listener: (byUser: boolean) => void): Disposer => this.motion?.cameraMoves.add(listener) ?? noop,
      setStatus: (status: unknown): void => { this.dice?.setStatus(status); },
      onStatusAction: (listener: (id: string) => void): Disposer => this.dice?.statusActions.add(listener) ?? noop,
      setDiceLog: (entries: unknown): void => { this.dice?.setDiceLog(entries); },
      throwRoll: (result: unknown): void => { this.dice?.throwRoll(result); },
      setDiceLook: (lookId: unknown): void => { this.dice?.setDiceLook(lookId); },
      onRoll: (listener: RollListener): Disposer => this.dice?.rolls.add(listener) ?? noop,
      onClose: (listener: () => void): Disposer => this.closeListeners.add(listener),
      close: (): void => this.close(),
    });
    return this.facade;
  }

  opened(view: unknown): void {
    if (this.done) return;
    try {
      this.start(view as RemoteMapView);
      this.settle(true);
    } catch (error) {
      // A view that cannot be fed closes: `open()` rejects rather than waiting forever.
      console.error('[Atlas API] A remote view failed to start:', error);
      this.close();
    }
  }

  private start(remote: RemoteMapView): void {
    this.view = remote;
    const scene = new RemoteViewScene({
      app: remote.app, viewId: remote.viewId, atlasStore: remote.atlasStore, containerEl: remote.containerEl, renderer: remote.renderer,
    });
    this.scene = scene;
    this.motion = new RemoteViewMotion({
      atlasStore: remote.atlasStore,
      eventBus: remote.serviceManager.getEventBus(), viewport: remote.serviceManager.getRendererService().getViewport(),
      mapSize: () => scene.mapSize(), refreshScene: () => scene.refresh(),
      windowOf: () => remote.containerEl.ownerDocument.defaultView ?? window,
    });
    const motion = this.motion;
    const dice = new RemoteViewDice(remote.atlasStore, this.maxDice);
    this.dice = dice;
    this.stopControls = registerRemoteControls(remote.viewId, {
      owner: this.owner, fitMap: () => motion.fitMap(), roll: (picked, modifier) => dice.roll(picked, modifier),
    });
  }

  closed(): void {
    this.finish();
  }

  resized(): void {
    this.motion?.resize();
  }

  close(): void {
    if (this.done) return;
    this.finish();
    this.leaf.detach();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.settle(false);
    this.stopControls();
    this.dice?.dispose();
    this.dice = null;
    this.motion?.dispose();
    this.motion = null;
    this.scene?.dispose();
    this.scene = null;
    const listeners = this.closeListeners.list();
    this.closeListeners.close();
    for (const listener of listeners) callGuarded('close', listener);
  }
}
