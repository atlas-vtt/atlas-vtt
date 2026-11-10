import { describe, expect, it } from 'vitest';
import { importTableFile } from '../../../../src/app/randomTables/import/importFile';

const options = { resultHeader: 'Result', rollHeader: 'Roll' };
const file = (name: string, text: string): { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> } => {
  const bytes = new TextEncoder().encode(text);
  return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer };
};

describe('import file boundary', () => {
  it('reads case-insensitive extensions and UTF-8 with BOM', async () => {
    const result = await importTableFile(file('Weather.CSV', '\ufeffWeather,\nd4,Result\n1-4,Rain'), options);
    expect(result.tables[0]?.name).toBe('Weather');
  });

  it('refuses image/OCR and binary spreadsheet formats explicitly', async () => {
    await expect(importTableFile(file('Table.png', 'fake'), options)).rejects.toMatchObject({ code: 'unsupported' });
    await expect(importTableFile(file('Table.xls', 'fake'), options)).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('checks limits before reading, and ignores cancelled completions', async () => {
    const input = file('Table.txt', 'a');
    input.size = 300000;
    await expect(importTableFile(input, options)).rejects.toMatchObject({ code: 'tooLarge' });
    const controller = new AbortController();
    controller.abort();
    await expect(importTableFile(file('Table.md', ''), options, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
