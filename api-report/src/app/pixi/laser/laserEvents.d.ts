/** The GM's laser reached a point (world units), or was let go. */
export type LocalLaserEvent = {
    kind: 'point';
    x: number;
    y: number;
} | {
    kind: 'lift';
};
/** New points of someone else's laser, in their colour. */
export interface RemoteLaser {
    from: string;
    color: string;
    points: ReadonlyArray<{
        x: number;
        y: number;
    }>;
    lifted: boolean;
    /** Milliseconds from each point to the one before it in the stroke, when the sender timed them. */
    dt?: ReadonlyArray<number>;
}
