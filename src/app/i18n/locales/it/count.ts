import type { Translation } from '../../types';

export const count = {
  "count.assets": {
    "one": "{count} risorsa",
    "other": "{count} risorse"
  },
  "count.files": {
    "one": "{count} file",
    "other": "{count} file"
  },
  "count.items": {
    "one": "{count} elemento",
    "other": "{count} elementi"
  },
  "count.encounters": { one: "{count} incontro", other: "{count} incontri" },
  "count.maps": { one: "{count} mappa", other: "{count} mappe" },
  "count.scenes": { one: "{count} scena", other: "{count} scene" },
  "count.tokens": { one: "{count} token", other: "{count} token" },
} satisfies Translation;
