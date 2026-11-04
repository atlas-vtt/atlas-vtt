/** A player character's value as its campaign keeps it: as a token holds it, and whether its maximum was set by hand. */
export interface PartyValue {
  readonly current: number;
  readonly max: number;
  /** The maximum was set by hand (`overriddenMax`); without it each token's statblock decides its own. */
  readonly maxByHand?: true;
}

/** `JSON.stringify([campaignId, characterId, resourceKey])`, built and read only by `campaigns/partyValues/partyKeys.ts`. */
export type PartyKey = string;

/** The played campaign's values of its player characters, one per character and resource. */
export type PartyValues = Readonly<Record<PartyKey, PartyValue>>;
