/**
 * Fills the whole canvas with `color`, whatever state its context was left in: setting the
 * width resets every Canvas state, a save, clip or composite operation of a failed draw included.
 */
export function coverCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, color: string): void {
  const { width } = canvas;
  canvas.width = width;
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
}
