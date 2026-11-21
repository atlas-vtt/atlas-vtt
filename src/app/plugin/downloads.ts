import type { Plugin } from 'obsidian';
import { DownloadManager } from '../downloads/DownloadManager';
import { isActive } from '../downloads/downloadTypes';
import { t } from '../i18n';
import { showNotice } from '../ui/notice';

/**
 * The app's downloads, released on unload, and one notice once the queue has run dry: the job's name where one
 * finished, the count where several did, nothing for failures and cancels (the downloads button shows those).
 */
export function registerDownloads(plugin: Plugin): void {
  const manager = DownloadManager.forApp(plugin.app);
  // A job is news once per run: a retried one that finishes again has another finishing time.
  const told = new Set<string>();
  const unsubscribe = manager.subscribe(() => {
    const jobs = manager.jobs();
    if (jobs.some(isActive)) return;
    const fresh = jobs.filter((job) => job.state === 'done' && !told.has(`${job.id}@${job.finishedAt}`));
    for (const job of fresh) told.add(`${job.id}@${job.finishedAt}`);
    const [only] = fresh;
    if (fresh.length === 1 && only) showNotice(t('downloads.finishedOne', { title: only.title }));
    else if (fresh.length > 1) showNotice(t('downloads.finishedMany', { count: fresh.length }));
  });
  plugin.register(() => {
    unsubscribe();
    DownloadManager.release(plugin.app);
  });
}
