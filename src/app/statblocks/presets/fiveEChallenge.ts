// SPDX-License-Identifier: AGPL-3.0-only AND CC-BY-4.0

/**
 * Experience points and proficiency bonus by challenge rating, the lookup
 * tables of the 5E templates. Both SRDs (5.1 and 5.2.1) give the same values;
 * a CR 0 creature is worth 0 or 10 XP there, and the tables give 10.
 */

const EXPERIENCE: readonly (readonly [string, number])[] = [
  ['0', 10], ['1/8', 25], ['1/4', 50], ['1/2', 100],
  ['1', 200], ['2', 450], ['3', 700], ['4', 1100], ['5', 1800], ['6', 2300], ['7', 2900], ['8', 3900],
  ['9', 5000], ['10', 5900], ['11', 7200], ['12', 8400], ['13', 10000], ['14', 11500], ['15', 13000],
  ['16', 15000], ['17', 18000], ['18', 20000], ['19', 22000], ['20', 25000], ['21', 33000], ['22', 41000],
  ['23', 50000], ['24', 62000], ['25', 75000], ['26', 90000], ['27', 105000], ['28', 120000], ['29', 135000],
  ['30', 155000],
];

/** The highest whole challenge rating of each proficiency bonus. */
const PROFICIENCY_UP_TO: readonly (readonly [number, string])[] = [
  [4, '+2'], [8, '+3'], [12, '+4'], [16, '+5'], [20, '+6'], [24, '+7'], [28, '+8'], [30, '+9'],
];

function ratingValue(rating: string): number {
  const [numerator, denominator] = rating.split('/');
  return Number(numerator) / (denominator === undefined ? 1 : Number(denominator));
}

function proficiencyAt(rating: string): string {
  const value = ratingValue(rating);
  return PROFICIENCY_UP_TO.find(([highest]) => value <= highest)?.[1] ?? '';
}

/** "1,100" for 1100, as stat blocks write experience. */
function experienceText(points: number): string {
  return points.toLocaleString('en-US');
}

/** Experience points by challenge rating, one row per rating from 0 to 30. */
export function experienceTable(): Record<string, string> {
  return Object.fromEntries(EXPERIENCE.map(([rating, points]) => [rating, experienceText(points)]));
}

/** Proficiency bonus by challenge rating, one row per rating from 0 to 30. */
export function proficiencyTable(): Record<string, string> {
  return Object.fromEntries(EXPERIENCE.map(([rating]) => [rating, proficiencyAt(rating)]));
}
