/**
 * What the JSON files that lie beside `campaign.json` share (`characters.json`, `players.json`):
 * named by their purpose and never after anything, keyed by their `campaignId`, created in the
 * campaign's folder (`RecordFiles.createAt`), following the folder when it is renamed. Fields
 * Atlas does not know are kept, and a file of a later format is read and never written.
 */

import type { RecordLayout, StoredRecord } from '../services/recordFiles/recordLayout';
import { CAMPAIGNS_FOLDER } from './campaignPaths';
import { isRecord } from './campaignValues';

export interface CampaignFileSpec {
  /** The file's name in the campaign's folder. */
  readonly file: string;
  /** The format this Atlas writes. */
  readonly format: number;
  /** What the file is, for messages. */
  readonly kind: string;
}

export interface CampaignFileLayout<Stored extends StoredRecord> {
  /** Whether `path` is the file: its name directly in a campaign's folder. */
  readonly isPath: (path: string) => boolean;
  /** The file of the campaign whose folder is `folder`. */
  readonly pathIn: (folder: string) => string;
  /** Whether this Atlas may write the file: one of a later format is only read. */
  readonly isWritable: (stored: Stored) => boolean;
  readonly layout: RecordLayout<Stored>;
}

/** The layout of a campaign's file `spec.file`, held as a record whose id is its `campaignId`. */
export function campaignFileLayout(spec: CampaignFileSpec): CampaignFileLayout<StoredRecord> {
  const isPath = (path: string): boolean => {
    const rest = path.startsWith(`${CAMPAIGNS_FOLDER}/`) ? path.slice(CAMPAIGNS_FOLDER.length + 1) : '';
    const parts = rest.split('/');
    return parts.length === 2 && parts[0] !== '' && parts[1] === spec.file;
  };

  const read = (text: string): StoredRecord | null => {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!isRecord(parsed) || typeof parsed.campaignId !== 'string' || parsed.campaignId === '') return null;
      return { ...parsed, id: parsed.campaignId };
    } catch {
      return null;
    }
  };

  const text = (record: StoredRecord): string => {
    const { id, format, campaignId: _campaignId, ...rest } = record;
    const kept = typeof format === 'number' && format > spec.format ? format : spec.format;
    return `${JSON.stringify({ format: kept, campaignId: id, ...rest }, null, 2)}\n`;
  };

  return {
    isPath,
    pathIn: (folder) => `${folder}/${spec.file}`,
    isWritable: (stored) => !(typeof stored.format === 'number' && stored.format > spec.format),
    layout: {
      root: CAMPAIGNS_FOLDER,
      kind: spec.kind,
      isRecordPath: isPath,
      read,
      text,
      namedPath: (path) => path,
      recordPathIn: (path) => path,
      freeNamedPath: () => {
        throw new Error(`A ${spec.kind} file is created in its campaign's folder.`);
      },
      isNamedAfter: () => true,
    },
  };
}
