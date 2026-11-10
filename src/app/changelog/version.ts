const RELEASE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BETA = /^((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-beta\.(?:0|[1-9]\d*)$/;

/** Obsidian community releases use numeric x.y.z versions. */
export function isReleaseVersion(value: unknown): value is string {
  return typeof value === 'string' && RELEASE.test(value);
}

/** The stable release a build's notes belong to: itself for releases, the targeted release for beta builds. */
export function releaseBaseVersion(value: string): string | null {
  return RELEASE.test(value) ? value : (value.match(BETA)?.[1] ?? null);
}

export function compareVersions(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

/** Feature announcements include minor and major releases, but skip patch-only updates. */
export function crossesFeatureRelease(previous: string, current: string): boolean {
  if (!isReleaseVersion(previous) || !isReleaseVersion(current) || compareVersions(current, previous) <= 0) return false;
  const [previousMajor, previousMinor] = previous.split('.').map(Number);
  const [currentMajor, currentMinor] = current.split('.').map(Number);
  return currentMajor! > previousMajor! || (currentMajor === previousMajor && currentMinor! > previousMinor!);
}

/**
 * Whether `candidate` is a release newer than `installed`. A beta of `x.y.z` counts as just below
 * `x.y.z`, so a tester on `0.8.1-beta.0` hears of `0.8.1`; a beta is never a candidate.
 */
export function isNewerRelease(candidate: string, installed: string): boolean {
  const base = releaseBaseVersion(installed);
  if (!isReleaseVersion(candidate) || base === null) return false;
  const difference = compareVersions(candidate, base);
  return difference > 0 || (difference === 0 && base !== installed);
}
