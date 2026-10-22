# Deprecated — 歷史規格／交接

原位置：`KD/ROUTINE/equipment-d1-r2-plan.md`；保留當時獨有決策、來源及證據，不作目前工作指令、DBschema、branch或验收結果。替代來源：[AI_CONTEXT/DATA_MODEL.md](../../../AI_CONTEXT/DATA_MODEL.md)。原文內路徑依原位置／repository root解讀。

---

# 檢具與測試設備：草稿持久化與送審接線規劃

## 目前事實

交接檔是單頁 HTML 原型，沒有網站後端、Cloudflare Worker 設定、D1 資料庫綁定或 R2 儲存桶。新版原型使用瀏覽器 IndexedDB 還原同一瀏覽器的草稿和照片；它不能保證換電腦、換瀏覽器或清除網站資料後仍可還原。頁面內的「版本確認平台」也是示範畫面，尚未寫入真正的品質系統資料庫。

## 正式資料位置

| 資料 | 位置 | 主要欄位／物件鍵 |
| --- | --- | --- |
| 草稿、修訂號、作者、狀態 | D1 `EQUIPMENT_DB` → `equipment_drafts` | `draft_id`, `owner_user_id`, `revision`, `status`, `payload_json`, `updated_at` |
| 生效版本與送審內容 | D1 → `equipment_versions`, `equipment_review_requests` | `version_id`, `draft_id`, `submitted_revision`, `review_status`, `submitted_at`, `reviewed_at` |
| 審核及刪除操作紀錄 | D1 → `equipment_audit` | `actor_id`, `action`, `target_id`, `created_at` |
| 設備和分類照片 | R2 `EQUIPMENT_MEDIA` | `equipment/{tenant_id}/drafts/{draft_id}/{photo_id}`；核准後保留版本參照 |
| 照片中繼資料 | D1 → `equipment_photos` | `photo_id`, `r2_key`, `sha256`, `mime_type`, `bytes`, `draft_id` |

## 接線流程

1. 登入使用者以既有網站身分讀取 `GET /api/equipment/draft`；後端依身分和租戶查 D1。重新登入、跨瀏覽器或跨電腦，取得同一筆草稿與修訂號。
2. 上傳照片到 R2，D1 寫入照片物件鍵。照片不以大型 base64 存在 D1；未完成的上傳要清理孤兒物件。
3. `PUT /api/equipment/draft` 攜帶預期 `revision`，後端在 D1 交易內更新草稿及遞增修訂號；版本衝突回 `409`，不能默默蓋掉另一台電腦的修改。
4. `POST /api/equipment/draft/submit` 在後端再次檢查本次新增或修改資料的必要欄位、R2 照片存在與關聯一致性，然後於 D1 建立 `equipment_review_requests` 並將草稿鎖定。前端驗證只是即時提示。
5. 品質系統資料庫／版本確認平台從 D1 查待確認案件。核准時在 D1 交易中建立新版本並記錄審核者；退回時恢復草稿可修改。照片與既有版本的參照不能因刪除草稿而意外消失。

## 上線前缺的接入資料

- 現有網站儲存庫、登入與權限機制、品質系統資料庫與版本確認平台的程式碼或 API。
- Cloudflare 帳號中的 D1/R2 資源與部署設定；目前沒有可核對的資料庫 ID、bucket 名稱或環境綁定。
- 需要在真實登入狀態下驗證「儲存草稿 → 登出 → 換瀏覽器／電腦登入 → 接續編輯 → 送審 → 平台待確認 → 核准」整條流程。

**目前不得把 IndexedDB 或預覽卡片描述成已完成跨裝置保存或正式送審。**
