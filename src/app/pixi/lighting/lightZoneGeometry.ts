import type { LightZone } from '../../types/lightingTypes';

/** The colour a zone's handle shows its light in: its tint (white without one) at its level, as the eye takes it. */
export function zoneLightColor(zone: Pick<LightZone, 'ambient' | 'ambientColor'>): number {
  const tint = Number.parseInt((zone.ambientColor ?? '#ffffff').slice(1), 16);
  const level = Math.min(1, Math.max(0, zone.ambient)) ** (1 / 2.2);
  const channel = (shift: number): number => Math.round(((tint >> shift) & 0xff) * level);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
