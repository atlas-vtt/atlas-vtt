import { vi } from 'vitest';

/**
 * Every window asks for reduced motion until the mocks are restored: measurements then come and go
 * by fading alone and never grow or morph, so a test of what is drawn reads it at its own size.
 */
export function preferReducedMotion(): void {
  const media = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({ ...media(query), matches: query.includes('reduce') }));
}
