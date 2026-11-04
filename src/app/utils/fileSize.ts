/** A byte count for display, such as "1.5 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const BYTE_UNITS = ['kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;

/** A byte count in the given locale's words and digits, from kilobytes up: "0 kB", "1.5 GB", "1,5 ГБ". */
export function formatByteSize(bytes: number, locale: string): string {
  const step = bytes >= 1024 ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length) - 1 : 0;
  const value = bytes / 1024 ** (step + 1);
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: BYTE_UNITS[step],
    unitDisplay: 'short',
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}
