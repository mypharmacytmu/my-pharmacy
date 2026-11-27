import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { strToU8, zipSync } from 'fflate';
import { download } from './download';
import { MedicineForm, MedicineList, errorText } from './forms';
import {
  maxImageBytes,
  maxImageSide,
  decodeImage,
  validDataImage,
} from './images';
import { upsert, type Medicine } from './model';
import {
  checkHistory,
  loadIndex,
  manifestPath,
  normalizeCode,
  uniqueForPublication,
  validateIndex,
  validatePack,
  type CodeIndex,
  type TeachingPack,
} from './teaching';
import './style.css';

interface Theme {
  id: string;
  title: string;
  code: string;
  ids: string[];
}
interface Draft {
  catalog: Medicine[];
  themes: Theme[];
}
const emptyTheme = (): Theme => ({
  id: crypto.randomUUID(),
  title: '',
  code: '',
  ids: [],
});

async function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('my-pharmacy-admin-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('無法開啟本機草稿資料庫。'));
  });
}
async function readDraft(): Promise<Draft> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction('drafts')
        .objectStore('drafts')
        .get('current');
      request.onsuccess = () =>
        resolve(request.result ?? { catalog: [], themes: [] });
      request.onerror = () => reject(new Error('無法讀取本機草稿。'));
    });
  } finally {
    db.close();
  }
}
async function saveDraft(draft: Draft) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(draft, 'current');
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(new Error('本機草稿儲存失敗。'));
    });
  } finally {
    db.close();
  }
}
const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2) + '\n');
function zip(files: Record<string, Uint8Array>) {
  const data = zipSync(files, { level: 6 });
  download(
    new Blob([new Uint8Array(data)], { type: 'application/zip' }),
    'my-pharmacy-teaching.zip',
  );
}
const at = (path: string) => `public/teaching/${path}`;

async function exportTheme(theme: Theme, catalog: Medicine[]) {
  const code = normalizeCode(theme.code);
  const index = await loadIndex();
  if (Object.hasOwn(index.codes, code))
    throw new Error('此代碼已占用，請為新版本輸入另一組代碼。');
  const version = crypto.randomUUID();
  const manifest = manifestPath(version);
  const files: Record<string, Uint8Array> = {};
  const items = uniqueForPublication(
    theme.ids.map((id) => {
      const med = catalog.find((m) => m.id === id);
      if (!med) throw new Error('主題包含已移除的藥品，請重新選擇。');
      return med;
    }),
  );
  const medicines = await Promise.all(
    items.map(async ({ id, image, ...fields }) => {
      if (!image) return fields;
      if (!validDataImage(image)) throw new Error('圖片格式無效。');
      const content = await (await fetch(image)).blob();
      const img = await decodeImage(image);
      if (
        content.size > maxImageBytes ||
        Math.max(img.naturalWidth, img.naturalHeight) > maxImageSide
      )
        throw new Error('圖片超過教材限制。');
      const extension =
        content.type === 'image/jpeg' ? 'jpg' : content.type.split('/')[1];
      const path = `images/${version}-${id}.${extension}`;
      files[at(path)] = new Uint8Array(await content.arrayBuffer());
      return { ...fields, image: path };
    }),
  );
  const pack: TeachingPack = {
    schemaVersion: 1,
    title: theme.title.trim(),
    version,
    medicines,
  };
  validatePack(pack, manifest);
  files[at(manifest)] = json(pack);
  files[at('index.json')] = json(
    validateIndex({
      ...index,
      codes: { ...index.codes, [code]: { active: true, manifest } },
    }),
  );
  zip(files);
  return Object.keys(files).sort();
}

function Admin() {
  const [draft, setDraft] = useState<Draft>();
  const [theme, setTheme] = useState(emptyTheme);
  const [editing, setEditing] = useState<Medicine | 'new'>();
  const [index, setIndex] = useState<CodeIndex>();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [publicationPaths, setPublicationPaths] = useState<string[]>([]);
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void readDraft()
      .then(setDraft)
      .catch((err) => setError(errorText(err)));
  }, []);
  async function persist(next: Draft) {
    await saveDraft(next);
    setDraft(next);
  }
  return (
    <>
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <b>+</b> 我的藥局
        </a>
        <span>教材管理</span>
      </header>
      <main>
        <h1>教材管理</h1>
        <p>
          草稿保存在此瀏覽器。由 GitHub
          維護者提交發布包並部署後，學生即可使用有效代碼。
        </p>
        <p>
          <a href={`${import.meta.env.BASE_URL}ADMIN_GUIDE.html`}>
            開啟新手管理手冊
          </a>
        </p>
        <details className="panel" id="publication-guide">
          <summary>如何在 GitHub 網頁上傳教材</summary>
          <ol>
            <li>先從最新 main 建立教材分支，再解壓 ZIP。包內可能包含 <code>public/teaching/</code>。</li>
            <li>在 GitHub 開啟分支的 <code>public/teaching/</code>。用編輯功能將新代碼合併至 <code>public/teaching/index.json</code>，保留既有代碼與對應版本。</li>
            <li>進入 <code>public/teaching/versions/</code>，選 Add file → Upload files，只選新版本 JSON。有圖片時，將圖片放到 <code>public/teaching/images/</code>。</li>
            <li>提交前核對 GitHub 路徑列和檔名，確認最終完整路徑。請勿上傳整個外層資料夾，避免產生 <code>public/teaching/public/teaching/</code>。</li>
            <li>開啟 PR 供審查。合併後等 Actions 的部署成功，再到正式遊戲輸入教材代碼並預覽進貨。</li>
          </ol>
          <a href={`${import.meta.env.BASE_URL}ADMIN_GUIDE.html#c13`}>查看手冊的提交教材步驟</a>
        </details>
        {draft && (
          <fieldset disabled={busy}>
            <section className="panel">
              <h2>教材藥品</h2>
              {editing ? (
                <MedicineForm
                  key={typeof editing === 'object' ? editing.id : 'new'}
                  item={typeof editing === 'object' ? editing : undefined}
                  onCancel={() => setEditing(undefined)}
                  onSave={(input) => {
                    const catalog = upsert(
                      draft.catalog,
                      input,
                      typeof editing === 'object' ? editing.id : undefined,
                    );
                    void run(async () => {
                      await persist({ ...draft, catalog });
                      setEditing(undefined);
                    });
                  }}
                />
              ) : (
                <>
                  <button className="primary" onClick={() => setEditing('new')}>
                    新增教材藥品
                  </button>
                  <MedicineList catalog={draft.catalog}>
                    {(med) => (
                      <div className="actions">
                        <button onClick={() => setEditing(med)}>編輯</button>
                        <button
                          onClick={() => {
                            if (
                              !confirm(
                                `從本機草稿移除 ${med.genericName} 及其主題草稿引用？`,
                              )
                            )
                              return;
                            void run(async () => {
                              const strip = (t: Theme) => ({
                                ...t,
                                ids: t.ids.filter((id) => id !== med.id),
                              });
                              await persist({
                                catalog: draft.catalog.filter(
                                  (m) => m.id !== med.id,
                                ),
                                themes: draft.themes.map(strip),
                              });
                              setTheme(strip);
                            });
                          }}
                        >
                          移除
                        </button>
                      </div>
                    )}
                  </MedicineList>
                </>
              )}
            </section>
            <section className="panel">
              <h2>主題教材</h2>
              <div className="actions">
                <button onClick={() => setTheme(emptyTheme())}>
                  新主題草稿
                </button>
                {draft.themes.map((t) => (
                  <button key={t.id} onClick={() => setTheme(t)}>
                    {t.title}
                  </button>
                ))}
              </div>
              <div className="fields">
                <label>
                  主題名稱
                  <input
                    value={theme.title}
                    onChange={(e) =>
                      setTheme({ ...theme, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  主題代碼
                  <input
                    value={theme.code}
                    onChange={(e) =>
                      setTheme({ ...theme, code: e.target.value })
                    }
                  />
                </label>
              </div>
              <ul className="check-list">
                {draft.catalog.map((m) => (
                  <li key={m.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={theme.ids.includes(m.id)}
                        onChange={(e) =>
                          setTheme({
                            ...theme,
                            ids: e.target.checked
                              ? [...theme.ids, m.id]
                              : theme.ids.filter((id) => id !== m.id),
                          })
                        }
                      />
                      {m.genericName} · {m.strength}
                    </label>
                  </li>
                ))}
              </ul>
              <h3>教材預覽（{theme.ids.length} 項）</h3>
              <ol>
                {theme.ids
                  .map((id) => draft.catalog.find((m) => m.id === id))
                  .filter((m) => m !== undefined)
                  .map((m) => (
                    <li key={m.id}>
                      {m.genericName} · {m.strength}
                    </li>
                  ))}
              </ol>
              <div className="actions">
                <button
                  onClick={() =>
                    void run(async () => {
                      if (!theme.title.trim())
                        throw new Error('請填寫主題名稱。');
                      const next = {
                        ...theme,
                        code: theme.code ? normalizeCode(theme.code) : '',
                      };
                      await persist({
                        ...draft,
                        themes: [
                          ...draft.themes.filter((t) => t.id !== next.id),
                          next,
                        ],
                      });
                      setTheme(next);
                      setFeedback('主題草稿已儲存。');
                    })
                  }
                >
                  儲存主題草稿
                </button>
                <button
                  className="primary"
                  onClick={() =>
                    void run(async () => {
                      setPublicationPaths(await exportTheme(theme, draft.catalog));
                      setFeedback('已匯出教材發布包。');
                    })
                  }
                >
                  驗證並匯出發布包
                </button>
              </div>
            </section>
            <section className="panel">
              <h2>已發布代碼</h2>
              <button
                onClick={() =>
                  void run(async () => {
                    setIndex(await loadIndex());
                  })
                }
              >
                載入已發布索引
              </button>
              {index &&
                (Object.keys(index.codes).length === 0 ? (
                  <p>目前沒有已發布代碼。</p>
                ) : (
                  <ul>
                    {Object.entries(index.codes).map(([code, entry]) => (
                      <li key={code}>
                        {code} · {entry.active ? '啟用' : '停用'}{' '}
                        <button
                          onClick={() =>
                            void run(async () => {
                              const latest = await loadIndex();
                              if (
                                latest.codes[code]?.manifest !==
                                  entry.manifest ||
                                latest.codes[code].active !== entry.active
                              )
                                throw new Error('索引狀態已變更，請重新載入。');
                              const next = {
                                ...latest,
                                codes: {
                                  ...latest.codes,
                                  [code]: { ...entry, active: !entry.active },
                                },
                              };
                              checkHistory(latest, next);
                              zip({ [at('index.json')]: json(next) });
                              setPublicationPaths([at('index.json')]);
                              setFeedback('已匯出索引變更，提交及部署後生效。');
                            })
                          }
                        >
                          {entry.active ? '匯出停用變更' : '匯出重新啟用變更'}
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
            </section>
          </fieldset>
        )}
        {publicationPaths.length > 0 && (
          <section className="panel" aria-label="本次發布包的 GitHub 路徑">
            <h2>本次發布包的 GitHub 路徑</h2>
            <p>提交前逐項比對完整路徑。<a href="#publication-guide">回到上傳說明</a></p>
            <ul>
              {publicationPaths.map((path) => <li key={path}><code>{path}</code></li>)}
            </ul>
          </section>
        )}
        {feedback && (
          <p role="status" className="toast">
            {feedback}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </main>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Admin />);
