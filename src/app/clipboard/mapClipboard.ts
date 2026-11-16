import type { MapObjectContent } from './mapObjectContent';
import { t } from '../i18n';

interface ClipboardEntry {
  content: MapObjectContent;
  /** Text written to the system clipboard for this entry; null when the write did not happen. */
  systemText: string | null;
}

/**
 * Shared by every map view of the vault, so objects copied on one map paste into another.
 * The objects stay in memory; the system clipboard only receives a readable summary.
 */
let entry: ClipboardEntry | null = null;

/** Readable summary of the objects, one line per token, text or pin. */
export function describeMapObjects(content: MapObjectContent): string {
  const lines = [
    ...content.tokens.map((token) => (token.kind === 'character' && (token.name || token.statblockName)) || t('initiative.token')),
    ...content.texts.map((text) => text.text),
    ...content.pins.map((pin) => pin.notePath),
  ];
  const drawings = content.drawings.length;
  if (drawings > 0) lines.push(drawings === 1 ? '1 drawing' : `${drawings} drawings`);
  if (content.levelLinks.length > 0) lines.push(t('levels.copiedStairs', { count: content.levelLinks.length }));
  return lines.join('\n');
}

/** Line endings differ between platforms once text has been through the system clipboard. */
function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

/**
 * Puts the objects on the clipboard. The summary also goes to the system clipboard, which is
 * how a later paste notices that something else has been copied since.
 */
export async function writeMapClipboard(content: MapObjectContent): Promise<void> {
  const current: ClipboardEntry = { content, systemText: null };
  entry = current;
  const text = describeMapObjects(content);
  try {
    await navigator.clipboard.writeText(text);
    current.systemText = text;
  } catch {
    // Without system clipboard access, copy and paste still work between Atlas maps.
  }
}

/**
 * The copied objects, or null when nothing was copied or the system clipboard now holds
 * something copied elsewhere.
 */
export async function readMapClipboard(): Promise<MapObjectContent | null> {
  const current = entry;
  if (!current) return null;
  if (current.systemText === null) return current.content;
  try {
    const text = await navigator.clipboard.readText();
    if (normalize(text) !== normalize(current.systemText)) {
      if (entry === current) entry = null;
      return null;
    }
  } catch {
    // An unreadable system clipboard cannot prove the copy stale.
  }
  return current.content;
}
