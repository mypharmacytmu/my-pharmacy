import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const script = resolve('scripts/check-teaching.ts');
const tsx = import.meta.resolve('tsx');
const library = 'public/teaching';
const indexPath = `${library}/index.json`;
const oldManifest = 'versions/old.json';
const newManifest = 'versions/new.json';
const existing = { active: true, manifest: oldManifest };
const newEntry = { active: true, manifest: newManifest };
const pack = (version: string) => ({
  schemaVersion: 1,
  title: '教材',
  version,
  medicines: [{ genericName: 'sennoside', strength: '12mg', dosageFormId: 'tablet' }],
});
let cwd: string;
let baseline: string;

function put(path: string, contents: string | Buffer) {
  const target = join(cwd, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function json(path: string, value: unknown) {
  put(path, JSON.stringify(value));
}

function index(codes: Record<string, typeof existing>) {
  json(indexPath, { schemaVersion: 1, codes });
}

function git(...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function verify() {
  return spawnSync(process.execPath, ['--import', tsx, script, baseline], {
    cwd,
    encoding: 'utf8',
  });
}

function expectFailure(message: string) {
  const result = verify();
  expect(result.status, result.stderr).toBe(1);
  expect(result.stderr).toContain(message);
}

describe('教材發布驗證', () => {
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'pharmacy-teaching-'));
    git('init', '--quiet');
    index({ OLD001: existing });
    json(`${library}/${oldManifest}`, pack('old'));
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'base');
    baseline = git('rev-parse', 'HEAD');
  });

  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it('接受新教材、既有代碼停用、原始舊路徑及一般專案檔案', () => {
    index({ OLD001: { ...existing, active: false }, NEW001: newEntry });
    json(`${library}/${newManifest}`, pack('new'));
    json('docs/schema/pack.schema.json', { properties: { medicines: {} } });
    json('public/assets/metadata.json', { schemaVersion: 1, version: '1.0.0' });
    for (const path of ['teaching/index.json', 'teaching/versions/61c09a50-1c8b-462b-b2d4-09b8b2278595.json'])
      put(path, readFileSync(resolve(path)));
    const result = verify();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('已驗證 2 組教材代碼');
  });

  it.each([
    ['public/teaching/public/teaching/index.json', '{}'],
    ['teaching/index.json', '{}'],
    ['public/versions/new.json', JSON.stringify(pack('new'))],
    ['downloads/catalog.json', JSON.stringify({ schemaVersion: 1, codes: {} })],
    ['public/images/bf04492b-8785-4e0c-b0ac-aa523c0113b9-bf04492b-8785-4e0c-b0ac-aa523c0113b9.webp', ''],
  ])('拒絕放錯位置的教材 %s', (path, content) => {
    put(path, content);
    expectFailure(`教材檔案位置錯誤：${path}`);
  });

  it('拒絕未登錄的新版本', () => {
    json(`${library}/${newManifest}`, pack('new'));
    expectFailure(`新增教材資源未登錄或未引用：${library}/${newManifest}`);
  });

  it('拒絕指向不存在版本的索引', () => {
    index({ OLD001: existing, NEW001: newEntry });
    expectFailure(`教材資源不存在或不是普通檔案：${library}/${newManifest}`);
  });

  it('拒絕刪除既有代碼', () => {
    index({});
    expectFailure('不得刪除或重新分配已發布代碼 OLD001');
  });

  it('拒絕指到另一版本的既有代碼', () => {
    index({ OLD001: newEntry });
    json(`${library}/${newManifest}`, pack('new'));
    expectFailure('不得刪除或重新分配已發布代碼 OLD001');
  });
});
