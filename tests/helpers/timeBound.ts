/** A time bound in ms. The bounds are set on a developer's machine; a CI runner is several times slower and runs the whole suite beside the test. */
export const timeBound = (ms: number): number => (process.env.CI ? ms * 4 : ms);
