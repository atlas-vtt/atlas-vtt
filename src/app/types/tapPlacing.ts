/**
 * What a finger's tap places with the tool in hand, where a press would place it at once:
 * - `'taps'`: a shape placed tap by tap is under way, or the tool's shape is one (a fog polygon, a
 *   wall chain): nothing is dragged there, so a finger that moves pans and only a tap places;
 * - `'press'`: a press places something (a light, a chain's first corner), and what is there is
 *   dragged (a wall's end): the press is held back until the finger lifts or leaves its place.
 *
 * Either way a second finger, which with the first moves the map, never finds a point placed.
 */
export type TapPlacing = 'taps' | 'press';
