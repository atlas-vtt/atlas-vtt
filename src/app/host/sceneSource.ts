/** The state a renderer reads, without access to store actions. */
export interface SceneSource<Slice> {
  get(): Slice;
  /** Changes after subscribing; read the initial value with get(). Returns the listener's cleanup. */
  subscribe(listener: (next: Slice, previous: Slice) => void): () => void;
}
