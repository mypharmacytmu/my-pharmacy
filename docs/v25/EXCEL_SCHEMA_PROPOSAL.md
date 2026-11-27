# Excel 匯入資料字典｜欄名與範本待審核

範本提案使用一個工作簿、首列為欄名，ID 與代碼採文字，布林欄使用 TRUE／FALSE，秒數用正數。以下示例僅演示格式，無臨床案例或藥品答案。星號代表提案必填，條件欄依題型使用。

| 工作表 | 欄位 | 中文說明 | 型別／可接受值 | 示例 |
|---|---|---|---|---|
| Meta | templateVersion* | 匯入範本版本 | 文字 | draft-1 |
| Medicines | medicineRef* | 包內藥品鍵 | 唯一文字 ID | med-001 |
| Medicines | genericName* / brand | 學名／商品名 | 文字 | 示例學名／示例商品 |
| Medicines | strength* / dosageFormId* | 劑量／劑型 | 文字／既有劑型 ID | 10 mg／tablet |
| Medicines | category / indication | 原分類及適應症文字 | 文字，僅顯示 | 原始備註 |
| Medicines | classification | OTC／RX 標記 | 沿用既有允許值或空白 | OTC |
| Medicines | drugClassId | 單一藥理分類 | DrugClasses.id／空白 | class-review-01 |
| Medicines | pregnancyStatus | 孕婦使用教學標記 | allowed / contraindicated / review / unknown／空白 | unknown |
| Medicines | template / palette | 包裝／配色 | 既有列舉值 | box／slate |
| Medicines | imagePath / cropX / cropY / cropW / cropH | 資源及裁切 | 相對路徑／數值群，依既有 validator | images/asset.webp／空白 |
| MedicineIndications | medicineRef* / indicationId* | 藥品與多個標籤的對應 | 兩外鍵，每對唯一 | med-001／ind-review-01 |
| Indications | id* / labelZh* / labelEn / status* / note | 適應症標籤 | 唯一文字鍵、顯示文字、候選／已審／退役 | ind-review-01／候選標籤 |
| DrugClasses | id* / labelZh* / labelEn / status* / note | 藥理分類 | 同上，不與適應症共用表 | class-review-01／候選分類 |
| Cases | caseId* / title* / kind* | 案例鍵、名稱、題型 | 唯一文字／文字／prescription、otc | case-001／測試欄位／otc |
| Cases | prompt* / explanation* | 題幹及教師解析 | 文字 | 待教師填寫 |
| Cases | targetSeconds* / allowPersonalPractice* | 目標時間與開放個人練習 | 秒數 > 0／布林 | 60／FALSE |
| Cases | pregnancy / maxDistinctMedicines | OTC 孕況與品項上限 | 暫提 yes/no/unknown／正整數，適用規則待審 | unknown／2 |
| CaseIndications | caseId* / indicationId* | OTC 需求標籤 | OTC 案例與已審標籤外鍵 | case-001／ind-review-01 |
| CaseAllergies | caseId* / drugClassId* | 案例過敏類別 | 案例與已審分類外鍵，適用題型待審 | case-001／class-review-01 |
| PrescriptionTargets | caseId* / medicineRef* | 指定教師核准的處方品項 | 處方案例與藥品外鍵；等價及複方待審 | case-id／med-001 |

## 匯入與相容策略

- 關聯表用逐行外鍵表達多選，不在單一儲存格用自由文字配對。老師用字典 ID 編輯標籤，大小寫及正規化規則須先定案。數字型 ID 禁止自動轉型，避免遺失前導零。
- 藥品以現行 `identity()` 查重，另檢查 Excel 的 medicineRef 唯一。案例鍵、字典鍵和各關聯鍵分別查重。重複項逐列報告，合併／覆蓋需要教師審核。
- 匯入先解析成草稿並列出新增、重複、缺欄、外鍵錯誤（含工作表、列、欄）及無效圖片。建議有任何錯誤時原子拒絕整批寫入，修正後重試；不自動覆蓋草稿或已發布檔。公式、巨集及外部連結不做執行來源。
- v1 Excel 或 JSON 缺新欄時維持原資料，分類和孕況不自行從舊文字補值。正式上架前由教師驗證；欄位空值、圖片包與舊表欄名的對應仍待確認。
