/** Integer world coordinates in eighths of a pixel. */
export type Q = number;

/** A ring as [x0, y0, x1, y1, …], without a repeated closing point. */
export type QPolygon = readonly Q[];

/** NonZero boundary rings: positive outer contours and negative holes. */
export type QShape = readonly QPolygon[];

export const Q_SCALE = 8;
export const MAX_Q = 2 ** 24;
