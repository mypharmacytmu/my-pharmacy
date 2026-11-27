import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { validateIndex, validatePack } from '../src/teaching';

const library = new URL('../public/teaching/', import.meta.url);
const read = (path: string) =>
  JSON.parse(readFileSync(new URL(path, library), 'utf8'));

test.each([
  ['AP4444', '6985fa2a-304a-4c75-a1d8-70e986a4ef85'],
  ['AP5555', '61c09a50-1c8b-462b-b2d4-09b8b2278595'],
  ['DAPA22', '9c73ba8f-2a98-4df4-b0a0-d886b66c1622'],
  ['TEST66', 'bf04492b-8785-4e0c-b0ac-aa523c0113b9'],
])('已發布的 %s 保留 v1 版本及資源相容性', (code, version) => {
  const manifest = `versions/${version}.json`;
  const index = validateIndex(read('index.json'));
  expect(index.codes[code]?.manifest).toBe(manifest);
  const pack = validatePack(read(manifest), manifest);
  expect(pack.version).toBe(version);
  for (const medicine of pack.medicines) {
    if (medicine.image)
      expect(readFileSync(new URL(medicine.image, library)).byteLength).toBeGreaterThan(0);
  }
});
