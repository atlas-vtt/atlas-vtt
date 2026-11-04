function randomUint32(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

const NO_CODES: ReadonlySet<string> = new Set();

/**
 * A join code: six digits, each code as likely as any other (numbers past the last whole million are
 * drawn again), and never one of `taken` (the codes a campaign's players have, which share the field).
 */
export function newJoinCode(random: () => number = randomUint32, taken: ReadonlySet<string> = NO_CODES): string {
  const span = 1_000_000;
  const limit = Math.floor(2 ** 32 / span) * span;
  for (;;) {
    let value = random();
    while (value >= limit) value = random();
    const code = String(value % span).padStart(6, '0');
    if (!taken.has(code)) return code;
  }
}
