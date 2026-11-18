/** What decides whether Atlas runs on a device. */
export interface SupportFacts {
  /** A mobile app with very limited screen space (`Platform.isPhone`). */
  readonly isPhone: boolean;
  /**
   * Whether the web view has `OffscreenCanvas`, which Atlas' image and map workers draw on. It is
   * what iOS and iPadOS 16.4 brought, so it stands for the system's version: a capability can be
   * asked, a version would have to be read out of the user agent.
   */
  readonly hasOffscreenCanvas: boolean;
}

/** Why Atlas does not run on a device, or `supported`. */
export type DeviceSupport = 'supported' | 'phone' | 'old-os';

export function deviceSupport(facts: SupportFacts): DeviceSupport {
  if (facts.isPhone) return 'phone';
  return facts.hasOffscreenCanvas ? 'supported' : 'old-os';
}
