/** Close codes the relay uses; clients do not reconnect after `badSecret`, `version` and `ended`. */
export const CLOSE = {
  badSecret: 4001,
  replaced: 4002,
  full: 4003,
  tooLarge: 4004,
  rateLimited: 4005,
  protocol: 4006,
  version: 4007,
  ended: 4008,
  kicked: 4009,
  /** The table asks for a join code and the hello had none or a wrong one. */
  wrongCode: 4010,
  /** Too many wrong codes: nobody new joins for a while. */
  paused: 4011,
  declined: 4012,
  /** The GM answered a knock neither way in time. */
  noAnswer: 4013,
  tooManyKnocks: 4014,
  /** The table's account may not host (any more): a GM's hello is refused, and the table is over for everyone at it. */
  noAccess: 4015,
  /** The table ended because its account started another table. */
  superseded: 4016,
  /** A newcomer's name is another player's in the GM's campaign: they come back with their own code, or under another name. */
  nameTaken: 4017,
  /** The hello was for another kind of room than this one (`RoomKind`): a players' page at the GM's own room, or a GM's device at a players' table. */
  otherRoom: 4018,
} as const;

/** The close codes of the join gates: the player's page stops and says why; only a new try by the player connects again. */
export const GATE_CLOSE_CODES: readonly number[] = [CLOSE.wrongCode, CLOSE.paused, CLOSE.declined, CLOSE.noAnswer, CLOSE.tooManyKnocks, CLOSE.nameTaken];

/** Close codes after which a client gives up instead of reconnecting. */
export const FINAL_CLOSE_CODES: readonly number[] = [CLOSE.badSecret, CLOSE.version, CLOSE.ended, CLOSE.replaced, CLOSE.kicked, CLOSE.noAccess, CLOSE.superseded, CLOSE.otherRoom, ...GATE_CLOSE_CODES];
