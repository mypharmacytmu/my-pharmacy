# v25 資料模型提案｜待審核

## 既有基線

`MedicineInput` 描述學名、劑量、劑型、商品名、分類、包裝、圖片、裁切等。既有 `identity()` 用於進貨／重複判斷，目錄 ID 與架位引用分開。v1 教材索引含 `schemaVersion: 1`、`codes[code].active`、`manifest`。v1 教材由 `validatePack` 驗證版本與藥品，且拒絕額外欄位。已發布 JSON、舊藥品 ID、圖片與分享成果保持原樣。

## 實體與引用

| 實體 | 提案欄位及關聯 |
|---|---|
| Medicine | `medicineRef` 為教材內穩定 ID，`base` 保存 v1 欄位，`indicationIds[]`、`drugClassId?`、`pregnancyStatus?` 為教學註記。分類至多一項。維持既有重複鍵，發版藥品參照與個人目錄 ID 各自保存。 |
| Taxonomy | `taxonomyVersion` 封存當時標籤與分類。兩套字典分開，項目含穩定 `id`、教學顯示名稱、英文候選、審核狀態、說明。草稿或退役項目不可供新的正式案例任意引用。 |
| Layout / Shelf / Placement | `layoutVersion` 指定位置與格位規格。配置內 `rackId` 在該版本中唯一，`slotIndex` 引用有效格位，`medicineRef` 指向包內藥品。同一架位不可分配兩次。v24 的位置 ID 與舊成果保留原版本解讀。 |
| CaseBase | `caseId`、`title`、`prompt`、`explanation`、`targetSeconds`、`allowPersonalPractice`。型別聯集依 `kind` 區別 `prescription`／`otc`。 |
| PrescriptionCase | 題目明確列出教師核准的答案 `medicineRef`；藥品、劑量、劑型皆核對。不儲存抓藥數量分數。複方或等價答案的結構待確認。 |
| OtcCase | `requiredIndicationIds[]`、`allergyDrugClassIds[]`、`pregnancy`、`maxDistinctMedicines`。引用封存字典，不依顯示文字配分。 |
| SimulationEdition | 提案以 `schemaVersion: 2` 的獨立版本描述，含藥品、字典、藥局配置、案例與 `rulesVersion`。抽題設定以 `pool`（題庫及處方／OTC 題數）或 `fixed`（案例 ID 集合）表示。 |
| Session / Attempt | 瀏覽器本機工作階段。記錄調整前後的題數與原因、凍結的版本與來源、呈現順序、每題開始／提交時間、選取的參照、覆蓋及安全判斷、各分數及檢討資料。教師藥局快照唯讀，學生選取另存；不進發布包。 |

孕婦狀態的候選代碼為 `allowed`、`contraindicated`、`review`、`unknown`。舊資料缺值仍表示未審核，不視同 `allowed`。校驗任何懷孕標記須依教師設定，適用範圍及不適用欄位的顯示待審。

## 載入、驗證與發布

1. 未審核前不改 v1 parser、索引或 JSON。後續先按版本判別再進入對應 validator，保留已發布版本的欄位及內容檢查；未知版本顯示不支援。舊成果仍依原有 v24 模型閱讀。
2. 若在同一索引引用 v2，必須先驗證既有程式版本接受索引與新版本路徑，另選擇相容策略。建議審查是否採獨立模擬索引及全域代碼衝突檢查，或先發可辨識兩種版本的 loader 再放新內容。兩者皆維持一組模擬代碼對一個完整不可變版本。
3. 驗證路徑、檔名與版本、圖片大小與引用、代碼／參照／架位唯一性、封存字典中的標籤和分類、案例與抽題參照屬於同版本。錯誤精確回報欄位或資源路徑。
4. 匯出基於最新正式索引。若基準更新，要求同步並重新匯出或合併個別索引項目。PR 與 main 驗證相對於發布歷史的代碼關聯、圖片及版本 bytes 不可變。保留 GitHub Pages 靜態發布，同一教材不需要外部服務。
