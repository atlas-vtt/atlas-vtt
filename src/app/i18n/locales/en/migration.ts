import type { Message } from '../../types';

export const migration = {
  'migration.running': 'Atlas: migrating data files to hidden folders...',
  'migration.errors': 'Atlas VTT: Migration completed with {count} errors. Check console for details.',
  'migration.done': 'Atlas VTT: Successfully migrated {count} data files.',
} as const satisfies Record<string, Message>;
