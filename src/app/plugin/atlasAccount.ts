import { requireApiVersion, type Plugin } from 'obsidian';
import { AtlasAccount } from '../account/AtlasAccount';
import { obsidianHttp } from '../account/obsidianHttp';
import { SECRET_STORAGE_VERSION, secretTokenStore } from '../account/tokenStore';
import { showNotice } from '../ui/notice';
import { WorkerTimers, type Timers } from '../utils/workerTimers';

/** Timers whose worker is made when the first one is set: a GM who never signs in gets none. */
function lazyWorkerTimers(): { timers: Timers; dispose: () => void } {
  let worker: WorkerTimers | null = null;
  const timers = (): WorkerTimers => (worker ??= new WorkerTimers());
  return {
    timers: {
      now: () => performance.now(),
      setTimer: (run, ms) => timers().setTimer(run, ms),
      clearTimer: (timer) => worker?.clearTimer(timer),
    },
    dispose: () => worker?.dispose(),
  };
}

/**
 * The Atlas account, at plugin level and in no experimental switch: one per app, shared by online play and the
 * Armarium. Signing in needs the Obsidian that keeps the token in its secret storage; on an older one the account
 * reads as unavailable and nothing is asked of the service.
 */
export function registerAtlasAccount(plugin: Plugin): AtlasAccount {
  const { app } = plugin;
  const { timers, dispose } = lazyWorkerTimers();
  const account = AtlasAccount.open(app, {
    http: obsidianHttp,
    timers,
    tokens: secretTokenStore(app),
    available: requireApiVersion(SECRET_STORAGE_VERSION),
    openUrl: (url) => void window.open(url),
    notify: (text) => showNotice(text),
  });
  plugin.register(() => {
    AtlasAccount.release(app);
    dispose();
  });
  return account;
}
