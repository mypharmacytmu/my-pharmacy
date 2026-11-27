import { maxImageBytes, maxImageSide } from '../src/images';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import {
  checkHistory,
  safeImage,
  safeManifest,
  validateIndex,
  validatePack,
  type CodeIndex,
} from '../src/teaching';
import { identity } from '../src/model';

const directory = 'public/teaching';
const indexPath = `${directory}/index.json`;
// Allow the original bytes of the two legacy files committed before this check.
const legacyFiles: Record<string, string> = {
  'teaching/index.json':
    'da3d92d2d035a25fe1c430dd59cbce9f714453c1bd8f35b1925b7e5b21a4559b',
  'teaching/versions/61c09a50-1c8b-462b-b2d4-09b8b2278595.json':
    'c2d7f2700cb66f8a3b19d466ce570aa13d9913db2cb91093eaf0650d2c7e0b2a',
};
const uuid = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
const exportedImage = new RegExp(`(?:^|/)${uuid}-${uuid}\\.(png|jpg|webp)$`);

async function statIfPresent(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function hasTeachingSchema(path: string) {
  const content = await readFile(path, 'utf8');
  try {
    const data = JSON.parse(content);
    return data?.schemaVersion === 1 &&
      (Object.hasOwn(data, 'codes') ||
        (Object.hasOwn(data, 'version') && Object.hasOwn(data, 'medicines')));
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}

async function listTeachingResources() {
  const paths = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  ).split('\0');
  const resources = new Set<string>();
  for (const path of new Set(paths)) {
    if (!path || path === indexPath) continue;
    const relative = path.slice(directory.length + 1);
    const inside = path.startsWith(`${directory}/`);
    const teachingPath =
      /(?:^|\/)teaching\/(?:public\/|index\.json$|versions\/|images\/)/.test(path);
    const generatedImage = exportedImage.test(path);
    if (!inside && !teachingPath && !generatedImage && !path.endsWith('.json'))
      continue;
    // Git may still list files deleted from the local working tree.
    const info = await statIfPresent(path);
    if (!info) continue;
    if (inside && (safeManifest(relative) || safeImage(relative))) {
      resources.add(relative);
      continue;
    }
    if (info.isFile() && Object.hasOwn(legacyFiles, path)) {
      const digest = createHash('sha256').update(await readFile(path)).digest('hex');
      if (digest === legacyFiles[path]) continue;
    }
    if (
      inside || teachingPath || generatedImage ||
      (info.isFile() && await hasTeachingSchema(path))
    )
      throw new Error(`教材檔案位置錯誤：${path}。請核對 ${indexPath} 及正式版本／圖片目錄。`);
  }
  return resources;
}

const resources = await listTeachingResources();
const read = async (name: string) => {
  const path = `${directory}/${name}`;
  const parent = path.slice(0, path.lastIndexOf('/'));
  if (
    !(await statIfPresent(directory))?.isDirectory() ||
    !(await statIfPresent(parent))?.isDirectory() ||
    !(await statIfPresent(path))?.isFile()
  ) {
    throw new Error(`教材資源不存在或不是普通檔案：${path}`);
  }
  return readFile(path);
};
const current = validateIndex(
  JSON.parse((await read('index.json')).toString()),
);
const oldRef = process.argv[2] || undefined;
if (oldRef && !/^[a-f0-9]{40}$/.test(oldRef))
  throw new Error('基準 Git SHA 無效。');
const historical = (name: string) =>
  execFileSync('git', ['show', `${oldRef}:${directory}/${name}`]);
const priorFiles =
  oldRef && !/^0+$/.test(oldRef)
    ? new Set(
        execFileSync(
          'git',
          ['ls-tree', '-r', '--name-only', oldRef, '--', directory],
          { encoding: 'utf8' },
        )
          .trim()
          .split('\n'),
      )
    : new Set<string>();
const before: CodeIndex | undefined = priorFiles.has(`${directory}/index.json`)
  ? validateIndex(JSON.parse(historical('index.json').toString()))
  : undefined;
if (before) checkHistory(before, current);

const files = new Map<string, Buffer>();
const isOld = (path: string) => priorFiles.has(`${directory}/${path}`);
async function checkFile(path: string) {
  const existing = files.get(path);
  if (existing) return existing;
  const data = await read(path);
  if (isOld(path) && !historical(path).equals(data))
    throw new Error(`已發布的資源不得改寫：${path}`);
  files.set(path, data);
  return data;
}

for (const [code, entry] of Object.entries(current.codes)) {
  const pack = validatePack(
    JSON.parse((await checkFile(entry.manifest)).toString()),
    entry.manifest,
  );
  if (before?.codes[code] && !isOld(entry.manifest))
    throw new Error(`歷史版本缺少原始檔案：${code}`);
  const ids = new Set<string>();
  for (const med of pack.medicines) {
    const key = identity(med);
    if (ids.has(key))
      throw new Error(`${code} 中含有重複藥品：${med.genericName}`);
    ids.add(key);
    if (!med.image) continue;
    const bytes = await checkFile(med.image);
    if (bytes.length > maxImageBytes)
      throw new Error(`教材圖片檔案過大：${med.image}`);
    const img = sharp(bytes, {
      limitInputPixels: maxImageSide ** 2,
      failOn: 'warning',
    });
    const meta = await img.metadata();
    const expected = med.image.endsWith('.jpg')
      ? 'jpeg'
      : med.image.split('.').at(-1);
    if (
      meta.format !== expected ||
      Math.max(meta.width, meta.height) > maxImageSide ||
      (meta.pages ?? 1) > 1
    ) {
      throw new Error(`教材圖片格式或尺寸錯誤：${med.image}`);
    }
    await img.raw().toBuffer();
  }
}
for (const resource of resources) {
  if (!files.has(resource) && !isOld(resource))
    throw new Error(`新增教材資源未登錄或未引用：${directory}/${resource}`);
}
for (const file of priorFiles) {
  const relative = file.slice(directory.length + 1);
  if (/^(versions|images)\//.test(relative) && !files.has(relative))
    await checkFile(relative);
}
console.log(
  `已驗證 ${Object.keys(current.codes).length} 組教材代碼及 ${files.size} 個版本或圖片檔案。`,
);
