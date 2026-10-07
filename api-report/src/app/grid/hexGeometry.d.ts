/**
 * Hexagonal grid geometry.
 *
 * Conventions follow Foundry VTT and Owlbear Rodeo:
 * - `size` is the flat-to-flat distance of a hex (the width of a pointy-top hex,
 *   the height of a flat-top hex). A 70px hex map therefore uses size 70 just
 *   like a 70px square map, and a size-1 token fits the hex's inscribed circle.
 * - Cells are addressed with axial coordinates (q, r); cube rounding is used to
 *   resolve pixel positions to cells (see redblobgames.com/grids/hexagons).
 * - The grid origin (offsetX, offsetY) is the top-left corner of the bounding
 *   box of hex (0, 0), so a hex map whose first hex is flush with the image
 *   corner aligns at offset (0, 0).
 */
export type HexOrientation = 'pointy' | 'flat';
export type HexGridType = 'hex-horizontal' | 'hex-vertical';
export interface Point {
    x: number;
    y: number;
}
export interface AxialCoord {
    q: number;
    r: number;
}
export interface HexLayout {
    orientation: HexOrientation;
    /** Flat-to-flat distance in pixels. */
    size: number;
    /** Top-left corner of hex (0, 0)'s bounding box. */
    originX: number;
    originY: number;
}
export declare function isHexGridType(type: string | undefined): type is HexGridType;
/** `hex-horizontal` is flat-top (columns), `hex-vertical` is pointy-top (rows). */
export declare function hexOrientationForGridType(type: HexGridType): HexOrientation;
export declare function createHexLayout(type: HexGridType, size: number, originX: number, originY: number): HexLayout;
/** Distance from hex center to any vertex. */
export declare function hexCircumradius(size: number): number;
/** Bounding box of a single hex. */
export declare function hexCellExtent(layout: HexLayout): {
    width: number;
    height: number;
};
/** Pixel center of hex (0, 0). */
export declare function hexOriginCenter(layout: HexLayout): Point;
export declare function axialToPixel(layout: HexLayout, hex: AxialCoord): Point;
/** Fractional axial coordinates of a pixel position (not rounded). */
export declare function pixelToFractionalAxial(layout: HexLayout, point: Point): AxialCoord;
/** Rounds fractional axial coordinates to the containing hex using cube rounding. */
export declare function axialRound(fractional: AxialCoord): AxialCoord;
export declare function pixelToAxial(layout: HexLayout, point: Point): AxialCoord;
/** Number of hex steps between two cells. */
export declare function axialDistance(a: AxialCoord, b: AxialCoord): number;
export declare function nearestHexCenter(layout: HexLayout, point: Point): Point;
/** The six vertices of the hex centered at `center`, in clockwise order. */
export declare function hexVertices(layout: HexLayout, center: Point): Point[];
