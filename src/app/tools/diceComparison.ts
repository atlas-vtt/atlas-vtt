/** The comparisons dice modifiers name a target with: `r<3`, `x>=9`, `cs>=8`. */

export type ComparisonOperator = '=' | '<' | '<=' | '>' | '>=';

export interface Comparison {
  readonly operator: ComparisonOperator;
  readonly value: number;
}

/** Whether a face of `face` meets the comparison. */
export function meets(face: number, { operator, value }: Comparison): boolean {
  switch (operator) {
    case '=': return face === value;
    case '<': return face < value;
    case '<=': return face <= value;
    case '>': return face > value;
    case '>=': return face >= value;
  }
}

/** How many of the faces from `lowest` to `highest` meet the comparison. */
export function facesMeeting(lowest: number, highest: number, comparison: Comparison): number {
  let count = 0;
  for (let face = lowest; face <= highest; face++) if (meets(face, comparison)) count++;
  return count;
}
