export interface ReleaseNote {
  version: string;
  /** Publication date (YYYY-MM-DD). Beta builds carry pending notes without a date. */
  date?: string;
  title: string;
  markdown: string;
}

export interface ReleaseBundle {
  version: string;
  releases: ReleaseNote[];
}

/** One headed block of a release note; the leading text before any heading has no label. */
export interface ReleaseSection {
  label: string | null;
  /** 1 under a `#` group heading, 2 under a `##` category heading, null before any heading. */
  level: 1 | 2 | null;
  markdown: string;
}

export interface ChangelogOptions {
  releases: ReleaseNote[];
  currentVersion: string;
  newVersions: Set<string>;
  showOnUpdate: boolean;
  majorUpdatesOnly: boolean;
  onPreferenceChange: (enabled: boolean) => void;
  onMajorUpdatesChange: (enabled: boolean) => void;
  onClose: (rendered: boolean) => void;
}
