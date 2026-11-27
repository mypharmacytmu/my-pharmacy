# My Pharmacy 網站搬遷與交接

## 網站與版本

正式維護庫為 [mypharmacytmu/my-pharmacy](https://github.com/mypharmacytmu/my-pharmacy)，部署來源為 `main`。搬遷基準為 `fac95fff0b92adf98b9ced465967887754c55891`。README 標示 My Pharmacy v24，套件版本為 `1.0.0`。此版提供繁體中文 3D 藥局、藥架與上架操作，以及供老師與助教使用的教材管理端。

- [學生遊戲](https://mypharmacytmu.github.io/my-pharmacy/)
- [教材管理端](https://mypharmacytmu.github.io/my-pharmacy/admin/)
- [管理端操作手冊](https://mypharmacytmu.github.io/my-pharmacy/ADMIN_GUIDE.html)

以上為預定的正式入口。開課前請依下列驗收步驟檢查部署紀錄與網站。原建立者的儲存庫由原擁有者管理。

## 首次部署與日常更新

1. 由儲存庫管理員開啟 [Pages 設定](https://github.com/mypharmacytmu/my-pharmacy/settings/pages)，在 **Build and deployment → Source** 選擇 **GitHub Actions**。若選項不可用，請 Organization Owner 檢查儲存庫可見性、GitHub 方案及組織 Pages 政策。
2. 到 [Actions 設定](https://github.com/mypharmacytmu/my-pharmacy/settings/actions) 確認組織政策允許工作流程使用的 Actions。到 [Environments](https://github.com/mypharmacytmu/my-pharmacy/settings/environments) 確認 `github-pages` 允許由 `main` 部署。若設有審核規則，請由指定審核者核准。
3. 到 [Pages 工作流程](https://github.com/mypharmacytmu/my-pharmacy/actions/workflows/pages.yml) 選 **Run workflow**，分支選 `main`。確認 `verify` 和 `deploy` 都成功，並核對該次執行的 SHA。工作流程會先驗證教材、測試與建置，再上傳 `dist/` 並部署。
4. 日常更新以最新 `main` 建立分支，提交 PR，待檢查及審查通過後合併。合併會觸發部署。Vite 的網站路徑是 `/my-pharmacy/`，遊戲、管理端與資源都依此路徑提供。

本機使用 Node.js 24、npm 與支援 WebGL 的 Chromium。由專案根目錄執行以下檢查，教材檢查的基準為目前目的地 `main`。

```sh
git fetch origin
npm ci
npm test
npm run check:teaching -- "$(git rev-parse origin/main)"
npm run build
npx playwright install chromium
npm run e2e
```

## 教材發布

1. 在管理端建立或修改草稿，驗證後匯出 ZIP 並保存備份。草稿存於該瀏覽器的 IndexedDB，從舊網址搬到新網址時應保留匯出的檔案。
2. 以最新 `main` 建立教材分支。解壓縮後，把索引、版本及圖片放到 `public/teaching/index.json`、`public/teaching/versions/` 與 `public/teaching/images/`。如有其他教材先合併，請用最新索引重新匯出，或在最新索引中合併本次新增的資料。
3. 保留既有代碼與版本的對應。已發布版本及圖片保持原樣，停用或重新啟用只調整索引狀態。發 PR 後請另一位維護者核對差異並等 CI 通過。教材和代碼會公開，請在發布前移除學生資料或其他敏感內容。
4. 部署成功後，從遊戲選擇「我要管理藥品 → 從已知的代碼進貨」，用六位代碼預覽並核對。確認後再把代碼提供給學生。

## 驗收與故障復原

- 用支援 WebGL 的瀏覽器開啟三個正式入口。操作一次藥架和上架，確認管理端可建立草稿及匯出 ZIP，確認手冊可開啟、搜尋及導覽。在瀏覽器開發者工具確認 JavaScript、CSS、圖片、教材索引及檢視器資源成功載入，並用有效教材代碼完成一次預覽。
- 部署失敗時，先在 Actions 查明失敗的工作與 SHA。修正後開 PR。若要重跑同一份已確認的版本，可由該次 Actions 執行頁使用 **Re-run jobs**。
- 若正式站壞在新版本，從最新 `main` 開修復分支，用 GitHub 的 **Revert** 或 `git revert` 建立可審查的還原 PR。涉及教材時，保留已發布的代碼、版本及圖片，依索引狀態停用有問題的教材。合併後查驗新部署，並重做正式站驗收。
- 若網址回傳 404，先確認 Pages 設定的來源、最近成功的部署及 Vite base。若只有資源失敗，從瀏覽器 Network 檢查請求路徑與回應型別，再比對 `dist/` 內容。

## Organization 權限與原建立者退出

1. 建立由校方管理的 [Organization 團隊](https://github.com/orgs/mypharmacytmu/teams)。安排至少兩位校方人員具備必要的 Organization Owner 或儲存庫管理權，指定主要與備援維護者。助教依職責授予適當的儲存庫權限，用 PR 交付變更。
2. 在 [儲存庫存取設定](https://github.com/mypharmacytmu/my-pharmacy/settings/access) 盤點個人、外部協作者和團隊。用 [規則集](https://github.com/mypharmacytmu/my-pharmacy/settings/rules) 保護 `main`，要求 PR、適當審查與必要 CI 檢查。檢查 `github-pages` 的部署分支及審核者。
3. 由新維護者實作一次教材 PR、合併、部署與正式站驗收。交接教材匯出備份、歷次發布紀錄和聯絡窗口。盤點 Organization 的 GitHub Apps、Actions secrets、部署金鑰及整合，將依賴個人帳戶的項目移交或輪替。此工作流程使用 GitHub 提供的工作流程憑證及 OIDC。
4. 確認新維護者可獨立營運後，由 Organization Owner 移除原建立者在新儲存庫的直接權限、團隊及外部協作者身分，若仍為 Organization Owner 則先確認備援管理員再調整角色。檢查群組繼承權限，移除僅供交接使用的存取，並確認後續部署可由校方自行完成。Git 歷史中的原作者資訊會保留。
