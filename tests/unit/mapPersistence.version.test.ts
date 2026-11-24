import { describe, expect, it } from 'vitest';
import { ATLAS_VERSION } from '../../src/app/services/MapPersistence';

describe('ATLAS_VERSION', () => {
  it('stays 4: an older Atlas loads a map with a higher version empty and saves that over the file', () => {
    expect(ATLAS_VERSION).toBe(4);
  });
});
