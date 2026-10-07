import { bundleNoteKeys } from '../../extensions/bundleNoteKeys';
import { isNote, withoutJsonExtensions, withoutNoteKeys } from './bundleExtensionData';
import type { BundleFile, BundleFileRole } from './bundleFormat';
import { movedFolders, remapPaths, type PathMap } from './pathRemap';

/** JSON files carry vault paths and asset ids that must follow the files and records they point at. */
const JSON_ROLES: ReadonlySet<BundleFileRole> = new Set<BundleFileRole>(['asset-file', 'scene-map', 'scene-snapshot']);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** `text` as UTF-8 bytes in an ArrayBuffer of their own. */
export function toBuffer(text: string): ArrayBuffer {
  const bytes = encoder.encode(text);
  // Copy into a fresh ArrayBuffer: TextEncoder's view may sit on a shared or offset buffer.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/** The indentation `text` was written with, so a rewrite keeps the file's layout and a round trip its exact bytes. */
function indentationOf(text: string): string | undefined {
  return /^[[{]\r?\n([ \t]+)\S/.exec(text)?.[1];
}

function rewriteJson(text: string, rewrites: PathMap): string {
  try {
    const parsed: unknown = JSON.parse(text);
    const remapped = remapPaths(withoutJsonExtensions(parsed), rewrites);
    if (JSON.stringify(remapped) === JSON.stringify(parsed)) return text;
    return JSON.stringify(remapped, null, indentationOf(text)) + (text.endsWith('\n') ? '\n' : '');
  } catch {
    return text;
  }
}

const FRONTMATTER = /^(---\r?\n)([\s\S]*?)(\r?\n---)/;

/** Points the note's artwork field at where the artwork now lives; only a single-line value is rewritten. */
function relinkStatblockNote(file: BundleFile, text: string, rewrites: PathMap): string {
  const image = file.statblockImage;
  const target = image && rewrites.get(image.path);
  if (!image || !target) return text;
  const frontmatter = FRONTMATTER.exec(text);
  if (!frontmatter) return text;
  // The manifest check limits the key to the statblock image fields, so it is safe inside the pattern.
  const line = new RegExp(`^${image.key}:[ \\t]*\\S[^\\n]*$`, 'm').exec(frontmatter[2]!);
  if (!line) return text;
  // Splice at the matched line: a plain replace would hit the first equal text and expand `$` patterns in the path.
  const start = frontmatter.index + frontmatter[1]!.length + line.index;
  return `${text.slice(0, start)}${image.key}: ${JSON.stringify(target)}${text.slice(start + line[0].length)}`;
}

/** A quoted text without quotes inside, so the folder in `'file.inFolder("Items")'` is found within the quoted filter. */
const QUOTED = /(["'])([^"'\n]+)\1/g;

/** What stands before a quoted path in a base: `file.inFolder(`, or `file.folder` / `file.path` compared or asked (`.startsWith(`). */
const PATH_CONTEXT = /(?:\.inFolder\(|file\.(?:folder|path)(?:\.\w+\()?\s*(?:[=!]=)?)\s*$/;

/**
 * Points the folders and files a base names at where they now are. A base
 * finds its notes by path (`file.inFolder("Items/Armor")`), so each quoted
 * path that moved is replaced where the base asks for a path; a tag or a
 * property value that reads like a moved folder is left alone.
 */
function relinkLootBase(text: string, rewrites: PathMap): string {
  const folders = movedFolders(rewrites);
  return text.replace(QUOTED, (literal: string, quote: string, value: string, offset: number) => {
    const path = value.endsWith('/') ? value.slice(0, -1) : value;
    const target = rewrites.get(path) ?? folders.get(path);
    if (!target || !PATH_CONTEXT.test(text.slice(Math.max(0, offset - 80), offset))) return literal;
    return `${quote}${target}${value.slice(path.length)}${quote}`;
  });
}

/** `text` of a file that `refersToFiles`, with the paths and ids it refers to rewritten; `text` itself when nothing changes. */
export function rewriteText(file: BundleFile, text: string, rewrites: PathMap): string {
  if (JSON_ROLES.has(file.role)) return rewriteJson(text, rewrites);
  if (file.role === 'statblock-note') return relinkStatblockNote(file, text, rewrites);
  if (file.role === 'loot-base') return relinkLootBase(text, rewrites);
  return text;
}

/**
 * `raw` with the paths and ids it refers to rewritten: JSON files follow moved
 * files and renamed records, statblock notes follow their artwork, loot bases
 * the folders of their items. Returns `raw` itself when nothing changes, so
 * unchanged files keep their exact bytes.
 */
export function rewriteContent(file: BundleFile, raw: ArrayBuffer, rewrites: PathMap, recordsMayHoldExtensionData = true): ArrayBuffer {
  if (!mayRewrite(file, rewrites, recordsMayHoldExtensionData)) return raw;
  const text = decoder.decode(raw);
  // Only here, never in `rewriteText`: moving a scene to another collection rewrites the user's own notes in place.
  const rewritten = rewriteText(file, withoutNoteKeys(file, text, bundleNoteKeys.keys()), rewrites);
  if (rewritten === text) return raw;
  // The shared decoder drops a byte order mark (JSON path rewrites rely on that), so a note gets its own back.
  return toBuffer(isNote(file) && startsWithByteOrderMark(raw) ? BYTE_ORDER_MARK + rewritten : rewritten);
}

const BYTE_ORDER_MARK = '﻿';

/** Whether `raw` starts with the UTF-8 byte order mark (EF BB BF). */
function startsWithByteOrderMark(raw: ArrayBuffer): boolean {
  const head = new Uint8Array(raw, 0, Math.min(3, raw.byteLength));
  return head.length === 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf;
}

/** Whether the file is text that refers to other files or records: JSON, a statblock note that shows artwork, or a loot base. */
export const refersToFiles = (file: BundleFile): boolean =>
  JSON_ROLES.has(file.role) || file.role === 'loot-base' || (file.role === 'statblock-note' && file.statblockImage !== undefined);

/**
 * Whether `rewriteContent` may change the file's bytes, so they must be read to know the result. Record files
 * may carry extension data, which never travels, and notes may carry a property an extension keeps out. An export
 * from a vault whose index holds no extension data (`AssetService.holdsExtensionData`) passes
 * `recordsMayHoldExtensionData` false, so it reads record files only where paths move, as before; an install, whose
 * bundle comes from elsewhere, always reads them.
 */
export const mayRewrite = (file: BundleFile, rewrites: PathMap, recordsMayHoldExtensionData = true): boolean =>
  (refersToFiles(file) && (rewrites.size > 0 || (recordsMayHoldExtensionData && file.role === 'asset-file')))
  || (isNote(file) && bundleNoteKeys.keys().size > 0);
