import type { App } from 'obsidian';
import { packTemplateFile, templateBodyAt } from '../../statblocks/bundles/bundleTemplates';
import { readVaultBinary } from '../../utils/hiddenVaultFiles';
import { rewriteContent, toBuffer } from './bundleContent';
import { DICE_SET_RECORDS } from './bundleDiceSetFiles';
import { TEMPLATE_BODY_ROLE, TEMPLATE_ROLE, type BundleFile } from './bundleFormat';
import { PRESET_RECORDS } from './bundlePresetFiles';
import { flushRecordEdits, packedRecord, type BundledRecordKind } from './bundleRecordFiles';
import type { InstalledRecord, InstalledTemplate } from './installRecord';
import { comparedBytes } from './recordPayload';
import { thumbnailAsNamedWebp, type NamedWebp } from './webpNamedFiles';

const RECORD_KINDS: ReadonlyArray<{ kind: BundledRecordKind; key: 'presets' | 'diceSets' }> = [
  { kind: PRESET_RECORDS, key: 'presets' },
  { kind: DICE_SET_RECORDS, key: 'diceSets' },
];

/** What the publisher's install record keeps of the files an export packs by id, each keyed by its id. */
export interface PackedById {
  templates: Record<string, InstalledTemplate>;
  presets: Record<string, InstalledRecord>;
  diceSets: Record<string, InstalledRecord>;
}

/**
 * Packs the files of one export in their order: what each file's bytes in the bundle are, and
 * what the export packed by id. Templates travel without code (§6.5) and with the note beside
 * them; a template file that holds no template stays behind, and its note with it. A preset or
 * dice set file that holds none stays behind too. A thumbnail stored in another format than its
 * WebP name travels as the WebP it is named (`webpNamedFiles.ts`).
 */
export class BundlePacker {
  readonly byId: PackedById = { templates: {}, presets: {}, diceSets: {} };
  /** WebPs made for mislabelled thumbnails, which a release or fork stores over the vault's copies. */
  readonly namedWebps: NamedWebp[] = [];
  /** Templates packed so far, whose notes may follow. */
  private readonly templates = new Set<string>();

  private constructor(
    private readonly app: App,
    private readonly names: ReadonlyMap<string, string>,
    /** Templates whose note the export packs: only those count their note as part of them. */
    private readonly withBodies: ReadonlySet<string>,
  ) {}

  /** A packer for `files`, once the record edits not yet on disk are written, so the export packs what the user sees. */
  static async open(app: App, files: readonly BundleFile[], names: ReadonlyMap<string, string>): Promise<BundlePacker> {
    for (const { kind } of RECORD_KINDS) {
      if (files.some((file) => file.role === kind.role)) await flushRecordEdits(app, kind);
    }
    const withBodies = new Set(files.flatMap((file) => (file.role === TEMPLATE_BODY_ROLE ? file.linkedFrom ?? [] : [])));
    return new BundlePacker(app, names, withBodies);
  }

  /** The bytes the bundle holds for `file`; null for a file that stays behind. */
  async pack(file: BundleFile): Promise<ArrayBuffer | null> {
    if (file.role === TEMPLATE_BODY_ROLE) return this.body(file);
    const content = await readVaultBinary(this.app, file.vaultPath);
    if (!content) return null;
    if (file.role === TEMPLATE_ROLE) return this.template(file.vaultPath, content);
    const webp = file.role === 'thumbnail' ? await thumbnailAsNamedWebp(file.vaultPath, content) : null;
    if (webp) {
      this.namedWebps.push({ path: file.vaultPath, data: webp });
      return webp;
    }
    const record = RECORD_KINDS.find(({ kind }) => kind.role === file.role);
    if (record) {
      const installed = await packedRecord(record.kind, content);
      if (!installed) return null;
      this.byId[record.key][installed.localId] = installed;
    }
    return rewriteContent(file, comparedBytes(file.vaultPath, content), this.names);
  }

  private async template(path: string, content: ArrayBuffer): Promise<ArrayBuffer | null> {
    const body = this.withBodies.has(path) ? await templateBodyAt(this.app, path) : null;
    const template = await packTemplateFile(path, content, body);
    if (!template) return null;
    this.byId.templates[template.installed.localId] = template.installed;
    this.templates.add(path);
    return toBuffer(template.text);
  }

  /** The note as the user sees it, read the way its template's fingerprint read it. */
  private async body(file: BundleFile): Promise<ArrayBuffer | null> {
    const template = file.linkedFrom?.[0];
    if (template === undefined || !this.templates.has(template)) return null;
    const text = await templateBodyAt(this.app, template);
    return text === null ? null : toBuffer(text);
  }
}
