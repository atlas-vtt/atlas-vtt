import { parseFormula } from './parseFormula';
import { writtenSide } from './writtenAdvantage';

/**
 * Whether Atlas's dice tool rolls a formula as it stands: it parses, and holds at least one die. A side
 * written last (`1d20+5 adv`) is the dice tool's to read and is no part of what is parsed here.
 * Atlas completes a formula without dice with the map's default roll, which a player causes only
 * with a bonus from their sheet (`playerFormula`), and tells a formula it cannot parse with a notice
 * on the GM's screen, which is never for a player or a controller to cause.
 */
export function rollableFormula(formula: string): boolean {
  const parsed = parseFormula(writtenSide(formula).formula);
  return parsed.ok && parsed.terms.some((term) => term.kind === 'dice' && term.count > 0);
}
