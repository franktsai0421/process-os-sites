## 2026-10-30 核准群組路線的空工段提示

畫布保留已核准群組 defaultStages；以 effective 產品路線一次計數，各工段沒有適用產品時顯示中越文提醒。D 工段即使沒有產品經過，也保留既有方塊與歷史；不讀取未核准主資料草稿來改變適用範圍，不放寬新增引用或審核政策。規格見[群組路線](../../docs/specs/current/GROUP_ROUTES.md)，測試見[後續修正](../../docs/acceptance/AB_C_DOT_HANDOFF_20261030.md)。

## 2026-10-30 群組預設與不適用的舊引用

`app.categoryStageCodes` 優先讀 approved `ACTIVE_MASTER_CATEGORIES.defaultStages`，舊資料 fallback 最大聯集；僅改可見工段清單，不裁切 workspace。`process-editor` 的產品／BOM 新選項依產品有效路線篩選。伺服器 authoring structure 禁止新加入路線外產品及 BOM，允許原方塊保留舊引用並編輯其他欄位；validation 加入 `PRODUCT_ROUTE_CHANGED`，沿既有 process advisory 與審核者確認流程，允許送審。無新 schema、無舊內容批次改寫。見[驗收](../../docs/acceptance/AB_C_DOT_HANDOFF_20261030.md)。

## 2026-10-29 第二輪：單次 panel dirty 計算重用

保留 metadata/error/recovery/client 同步 reset 的原先位置；之後同一次同步 mount 與 updateSaved 共用 localUnsaved，下一次 render 仍重新檢查，不跨事件快取。實際 controller 的 15 個合成差分 case 保留 saved/dirty/input、pending Save/Submit、ACK、身份變化、late advisory、完整 recovery/session 原始值。重建 saved panel 的 workspace 序列化 6→4、dirty canvas 6→2；身份 reset 路徑 2→2。whole-flow 序列化與網路／storage 工作不變，不能宣稱 Sync/Save/Submit 總延遲已達標或 browser 實測。

## 2026-10-15 非同步編輯器與工作區保全

process-equipment照片與Save／Delete捕獲原target／actor／working／draft，await後不得覆新編輯器；同視窗較新輸入保留，confirmed base供再次套用。process-editor commit以原workspace key及optimistic reference限制失敗回滾，避免覆另一線別／分類或較新資料；remove重核確認前後context且只關原modal。拒絕entry／exit轉型還原實際select。這些client修正不改資料派送、BOM interlock或核准版內容。[驗收分層與剩餘項](../../docs/local-integration/20261015-button-coverage.json)。

# 2026-10-14 整合候選選線與舊匯入入口

播放器實際renderer在version-workflow.js，首次依有效派送初始化線別，保留後續手選及固定設備。app.js舊流程主資料入口等待begin確認；V3非BOM匯入仍禁用。定向驗證及未驗界線見[整合紀錄](../../docs/local-integration/20261014-github-upload.md)。未修改發送資料或伺服器權限。

## 2026-10-14 派送V3相容與儲存確認

version-workflow的派送檢查保留V3進站／出站作圖形節點，避免因端點未分配產品而誤判完整連線不存在；作業產品、BOM、路線、核准版及legacy檢核仍保留。Send按鈕同步中禁用，等待ProcessSync.flush伺服器確認才顯示成功／重繪；失敗保留選擇與待送資料並顯示原儲存失敗提示。新VM4＋3項PASS。六合成3035實際metadata案件核准、Send、實體rev5/B線產品讀回、正常重開player核准V1/BOM32/32通過。fixture單工段目錄修正與產品問題分別紀錄；單一B線初始預設A仍需手動選B，此預設不列PASS。[唯一進度與未驗界線](../../docs/local-integration/20261010-permissions-admin.md)。無schema／日常資料變更。

## 2026-10-13 製程實際隔離審核證據

3036全合成實體隔離資料已從production UI完成BOM選取Apply/取消、儲存重開、staff送審、manager發回、修正再送、撤回與核准，正式產品狀態投影作唯讀檢查。C01/C02舊10筆缓存有／無controller兩冷載分支都先占位，正常開製程分頁fresh GET後顯示實際單一待審；同步已同步且非busy時Save/Submit隱藏、編輯表單唯讀及Apply禁用。此3036當時未實際Send/playback；後續新3035的限定驗證見上段，不能宣稱全製程實機驗收；保留原conflict報告与後續分類addendum，沿用PASS不重跑。[完整範圍](../../docs/local-integration/20261010-permissions-admin.md)。

## 2026-10-10 製程固定案件審核候選

review頁主要操作為查看送審案件／撤回；固定案件檢視內才顯示依權限的核准／發回。保留自審确认、待補ack、理由、pending鎖、withdraw清待審／留歷史，製程送審不混主資料清單。BOM選取強調品名與用量而不改occurrence ID／值。共享state每次新平台身分建立都開新epoch並quarantine舊輸入；same actor前世代保留previous，不自動重送或混另一人in-flight。2026-10-12 待審數改用 fresh ProcessAuthoringV3 flow，未載入／帳號或權限不符顯示占位，不先顯示 legacy approvalVersions 的過期數量。最新 UI 唯一操作人為本 Codex 任務；3032 原複製案件保留，3035 獨立合成 BOM 案件完成實際審核流程。[收據與限制](../../docs/local-integration/20261010-permissions-admin.md)。

## 2026-10-09 共用／產品專用項目

共用編輯三欄name/text/standard以既有instructionSteps保存，所有六型含進出站在卡片顯示完整共用項目；產品專用三欄仍用productInstructionSteps[product]，只補充產品作業，不在畫布顯示內容、照片或補充數。產品選擇明確標題，空清單首次輸入才建立資料；舊instructions收合保留，進出站歷史關聯以可讀數量與明細替代JSON。Apply仍用共享位置／連線，不混本機預覽，手動Save另行處理。實測與限制見[七項標註報告](../../docs/ipqc-reference/20261009-work-items.md)；欄位模型未改。

## 2026-10-08 編輯台首屏載入

主資料到達立即呈現，待補檢查及舊版本清單移至背景；bootstrap 等待最後畫布模組註冊及主資料就緒才揭開。保留手勢／本機變更、帳號及revision檢查，失敗保留重試。細節、測試與保全見[首屏載入報告](../../docs/ipqc-reference/20261008-editor-startup.md)。

## 2026-10-08 本機畫布與整批同步（最新）

同日再次優化：`editor-graph.js` 將進站／出站納入 rank，不再於進站後額外平移500px。雙向順序掃描、等序壓縮維持64px上下間距；水平基本96px並依跨欄線數加寬。端點依對端中心排序，方向性獨立走線通道減少交叉，短連線先行。僅純幾何與資源版本變更，journal／同步／Save不变。[比對與UI證據](../../docs/ipqc-reference/20261008-canvas-routing-compact.md)。

`canvas-local.js`管理獨立位置／連線journal，投影只供畫布；共享state與內容Apply不含本機預覽。欄位guard整批apply、operationId收據恢復、同步中後續編輯保留、scope undo/redo、帳號/generation隔離。Save先確認同步固定batch，再帶expectedRevision儲存整份；仍以成功Save送審。`editor-graph.autoLayout`依實測尺寸分層，`process-editor`處理吸附、端點及本機操作。詳見[規格](../../docs/specs/current/PROCESS_EDITOR.md)與[實測界線](../../docs/ipqc-reference/20261008-canvas-local.md)。

## 2026-10-08 回饋修復

實測卡片尺寸經 ResizeObserver 更新；原顯示避讓與整理寫座標已由上方最新手動定位要求取代。路由先選直線／少轉彎通道，再正交搜尋，部分疊線也排除；簽名相同重用結果。V3 sync 僅diff當前workspace，保留operation guard，套用成功後待補另查；panel更新canvas按鈕disabled，避免save refresh時busy狀態殘留。機器照片取核准設備mediaItems，獨立相簿按鈕。[回饋驗證](../../docs/ipqc-reference/20261008-editor-feedback.md)。

## 2026-10-08 V3 單工段編輯台

`process-editor.js/css` 透過 V3 workspace hook 直接產生 `.editor-workspace`，不再先完整渲染舊畫布再取代；上方模板及儲存／送審 handler 保留。`editor-graph.js` 提供穩定類型、連線檢查、實測卡片尺寸與正交避障。新畫布不用旧 canvas gesture selector，避免雙重事件。視角、搜尋僅記憶體；拖曳與方向鍵先留本機；同步畫布只送變動x/y/nextIds，內容Apply維持V3 patch/CAS，手動Save才形成固定快照。

2／6／7 分頁維持獨立 modal draft，整個 operation guard 防同方塊覆蓋；多方塊使用既有細粒度 patch。BOM 以零件碼合併、產品逐格驗證，跨全部 workspace/隱藏工段查占用。`synchronizeOperationBomSelections` 不再在渲染時補分配；取消產品＋Apply 才釋放該產品本節點 BOM。C IPQC 只查詢開關，舊關聯唯讀；AB 重用 ProcessIPQC.mountChoices。機器從核准 PROCESS 同工段 equipment 讀取，可重複選用。語系切換重畫 UI，保留 modal draft。

後端 `process-editor-integrity.ts` 檢查最終 graph、BOM 與機器來源，既有不合法資料做影響清單，不自動清理；新增違規拒絕，待補不增加送審阻擋。詳見 [規格](../../docs/specs/current/PROCESS_EDITOR.md)、[實測與限制](../../docs/ipqc-reference/20261008-process-editor.md)。以下日期段落是既有功能歷史；舊 Basic/IPQC 雙頁不是目前 V3 彈窗。

## 核准最大路線與畫布保留（2026-10-08）

categoryStageCodes 使用 MasterAdminUI.maximumRoute 計算核准產品聯集；產品/BOM 同步與選取僅作用可見工段。完整 workspace 仍保存隱藏流程與引用，路線恢復即重新顯示。legacy reconciliation 不刪隱藏工段或失去類別的 workspace。見 [提交驗證](../../docs/ipqc-reference/20261008-local-commit.md)。

# 製程實作現況

## 2026-10-07 群組工段順序

2026-10-08：categoryStageCodes 以核准產品 routeFor 投影呼叫共用 MasterAdminUI.maximumRoute（先於 app 載入）；與資料頁使用同一最大路線排序，空群組回傳空清單。產品選取只處理可見工段；新版 BOM 使用上方明確分配方式，完整 workspace 照常保存。legacy cleanEditorSet 只補缺少的可見工段，不再清除隱藏工段或失去類別的 workspace；舊引用保留，新非法引用仍由 API 拒絕。[保全驗證](../../docs/ipqc-reference/20261008-group-route-canvas.md)。IPQC-AB工段選項按群組有效路線，路線外舊標準另行查閱。IPQC-C及產品狀態沿用各產品stages。流程彈窗重新開啟預設基本資料。[規格](../../docs/specs/current/GROUP_ROUTES.md)、[3020驗收](../../docs/ipqc-reference/20261007-group-routes.md)。

狀態：Current source notes；整理自本 checkout 既有現況文件。2026-10-05只定向核對來源，不重跑功能測試；歷史數量／版本與PASS僅屬原日期證據。確認需求見[現行規格](../../docs/specs/current/README.md)。

## Equipment and navigation

### IPQC assignment (2026-10-06)

`process-ipqc.js/css` mount Basic/IPQC tabs inside the existing modal. Assignment uses operation JSON, the existing cancel snapshot and V3 Apply/Save/Submit lifecycle. `lib/process-ipqc.ts` selects approved AB/C items through current master routes and retains stable IDs plus applicable products. The authoring adapter and legacy shared-state route validate unique ownership on the final content; incomplete coverage and stale retained links are advisories. Read-only `/api/process-ipqc` projects candidates and persisted working/pending/approved/history references with authenticated view and line permissions. Unapplied browser state never creates references. See [requirements](../../docs/specs/current/PROCESS_WORKFLOW.md), [fields](../models/CORE.md), and [acceptance](../../docs/ipqc-reference/20261006-acceptance.md).

Preset template thumbnails and the modal template-media block are hidden in the process editor, including the dropdown's photo hint. Source classification helpers and media values remain intact; machine/work/product/IPQC photos retain their existing flows.

Review iteration 2: everyday references include working/pending/active only. Auth and current access are checked before an unchanged-revision response; compact records are read directly so unadopted legacy versions cannot eagerly expand through the general decoder. History requires an explicit item-scoped `mode=history` page (default 10, maximum 20 versions, revision-bound offset) plus existing private/history permissions. Only that page's bodies are loaded; historical metadata still resides in the unchanged aggregate. The frontend scopes its revision cache and request ownership to the current identity object, rejects both stale success and failure responses, and separately guards source/context reloads. Read-only quality viewers retain the keyboard-accessible history read action. See [review evidence](../../docs/ipqc-reference/20261006-review2.md).

Review 5: IPQC assignment uses state-coloured cards, counts and group progress; interface labels follow `document.documentElement.lang`, while authored standards remain unchanged. New V3 workspaces initialize only stages belonging to the selected line: categories such as INOX can exist in A and C. Sync omits only newly introduced empty foreign-line placeholders; it preserves existing data and retains server stage/route validation. Apply failures also display an inline alert. See [review5](../../docs/ipqc-reference/20261006-review5.md).

### Process equipment catalog

- `public/process/process-equipment.js` adds one grouped Equipment Master below the unified Machine Setting card. It groups equipment by line and stage, provides search/filtering and thumbnail rows, and opens add/edit/photo controls in a dialog. The existing PROCESS save/submit/approve/history permissions apply; only approved equipment is offered to the editor.
- The supplied 2026-09-10 workbook was read without modification: LINE A, LINE B + LINE C + C-TIEN produce 165 assembly records; C-PREP produces 25 setting records. Multi-number cells become separate machine choices with shared source photos. A-ASSY 1 maps to A-ASSY; C-TIỆN maps to C-TIEN. Eight unlabeled fixtures retain blank numbers and their source names/photos. The unrequested multi-stage sheet is not imported. The source-load action appends by stable ID without overwriting existing records, into the current draft only.
- Equipment choices are filtered by the operation's line, stage and preset kind. Thumbnails and physical machine numbers identify each choice; the selector simultaneously marks the current block and lists every other operation using the same machine. Reuse is allowed, unlike exclusive BOM assignments. Legacy selections remain visible/removable; saved `machineDetails` preserve their historical display.
- Equipment photo thumbnails open a common image viewer. The operation selector uses a dense responsive grid, labels a saved or draft selection as the current block, and lists only the other operation numbers that reuse the same machine. Approved-usage summaries in the catalog likewise show concise operation numbers.
- The existing Process-master Excel v3 codec remains available to maintenance tooling with its six-sheet media-aware format and backward compatibility. Daily Process, AB/C and line/stage pages no longer expose non-BOM import/export controls. BOM exchange and image editing remain unchanged.

The Process Control left navigation exposes seven views, subject to role permissions:

1. **總覽 / Dashboard** - overall counts, current A/B/C dispatch state, line load indicators, and shortcuts.
2. **產線播放台 / Line player** - displays the approved process for products dispatched to the selected line and stage.
3. **發送介面 / Dispatch** - up to three products per line; category-first product selection; readiness validation before publishing.
4. **產品製程狀態 / Product status** - approved route, process nodes, BOM, equipment, instructions, IPQC content, and media for a selected product.
5. **版本確認平台 / Approval** - master-data and process-version review, validation, comparison, history, approval, rejection, withdrawal, and revision flows.
6. **製程編輯台 / Process builder** - category/line/stage workspaces containing connected process nodes and modal editors.
7. **資料後台 / Master data** - AB/C product catalogs, BOM, line/stage management, process templates, users/roles, and users/permissions. Backup/restore remains maintenance-only, without daily navigation.

### Process presentation

- Process-builder cards use a 360 x 270 base size and remain readable at the 50% minimum zoom. Strong borders, tinted headers, and type badges distinguish Entry, Manual, Inspection, Machine, Exit, and custom processes. The template thumbnail is hidden; machine, work, and product photos retain their labelled classified previews. One or two categories use stable full-height slots, while a third category uses the compact second row; adding more photos to a category changes only its total-count badge and never repositions or overflows its preview. Each classification shows its first photo and a total-count badge such as `+2` or `+3`; opening it provides previous/next navigation through every photo in that classification. Duplicate operation/type labels are suppressed, while product-specific content remains available from a separate bottom action. Each card shows assigned/root BOM counts.
- The inspector uses wide step text areas without the former empty column. Product-specific media is added from the media header, and applying an operation waits for shared synchronization before closing; a failed sync retains the open form.
- Product Status, Dispatch monitoring, and Line Player render the same selected-product presentation from its approved process version. All three use auto-arranged connected graphs with distinct curved routes, flow counts, 50% minimum auto-fit, zoom controls and left-button blank-canvas panning. Their compact production headers show only the operation number, non-duplicate name, equipment/media counts, and process-type badge; process-template photos are intentionally omitted. Node content is ordered BOM, machine photos, common guidance with its media, then product-specific guidance with its media. Media areas without photos are omitted, so normal short nodes fit without an inner scrollbar; exceptional long content retains contained scrolling. Short nodes shrink to their content, long strings wrap inside the card, and guidance media has a larger viewing area; machine names display only the active Chinese or Vietnamese value.
- Product chips show assigned/root BOM counts and open a focused BOM dialog. This presentation is derived at render time from existing operation, product, equipment, and media fields. Build 6200 adds no database table, shared-state key, or schema migration.


## Authentication and downstream flow

### Authentication and session

- The platform login posts an ID/password to `/api/platform-login`; the server verifies against the current `platformUsers` stored in shared state.
- Protected writes use signed demo cookies or the existing formal identity headers and are rechecked server-side. Public data removes password fields.
- A remembered browser user is accepted on hosted pages only when the server also confirms the signed session. An expired or absent session returns to the login/public-viewer path instead of opening an editor that later receives HTTP 403 on save.
- Sites authenticated-user headers can identify the configured site owner; `manage=1` grants preview ADMIN behavior only on `localhost` or `127.0.0.1`.
- ADMIN/RD/STAFF quick login uses fixed passwordless demo identities. A single backend `demoEnabled` function reads `DEMO_LOGIN_ENABLED`: unset/true allows, false rejects login and all existing demo Sessions. Frontend visibility cannot override enforcement. 測試階段快捷入口預設開放；正式營運前必須由Frank明確確認關閉。




### Process-version lifecycle

1. An editor selects a category and line, then creates or modifies nodes for only the stages used by products in that category/line.
2. On adopted V3 authoring, the entire platform shares one working draft. Apply synchronizes fields without saving; manual Save takes a shared cutoff, and Submit validates only that successful save, creating a fixed case and locking the scope. Legacy unadopted authoring retains its existing version lifecycle.
3. Reviewers compare fixed cases and approve or return with a reason; permitted users may withdraw. Authorized self-review requires confirmation and audit, regardless of role name. Withdraw/return retain immutable cases and reopen the submitted snapshot in a new generation.
4. Approval supersedes the previous approved version. Adopted playback/status uses the whole-platform effective version; unadopted views use legacy approved versions. Historical restore changes only unsaved working content after permission/revision checks.

Save, submission, review and withdrawal wait for verified server persistence. Unknown V3 responses retain the owning account's operation ID and require receipt verification before replay; confirmed failure and unknown outcome are distinct. Revision conflicts remain blocked; no other account's update is overwritten. Login refreshes shared data before opening the workspace. Logout uses bounded synchronization and explicit recovery warnings; it never silently clears failed inputs or replays another actor's queued writes.

### Dispatch and playback

- Each A/B/C line accepts at most three unique products. Every slot selects a product category first, then a product from that line/category.
- Dispatch reads effective process content and approved master routes/BOM. Adopted process:platform retains approved-case advisories; individual unexecutable paths stay guarded. Legacy paths retain older readiness checks. Do not extend legacy completeness blockers to adopted submission.
- Products already selected in another slot on the same line are removed from the remaining choices.
- Line playback and dispatch monitoring show only the stages relevant to currently dispatched products. For a selected stage not belonging to a product, the UI explicitly marks that stage as not applicable.


## Process Builder

- A **process group** is the editor workspace for one product category and production line (`category:line`).
- Stage groups are derived from approved product routes; a newly approved stage is added to matching workspaces and receives default process templates when no template exists.
- A **process node/operation** contains a stable ID, stage code, display number, template reference, name, product assignments, BOM selections, human/machine mode, people count, machine IDs, outgoing node IDs, canvas coordinates, media, common instructions, product-specific instructions, and IPQC text.
- Nodes are positioned on a canvas, can be auto-arranged, and connect through `nextIds`; cycle creation is rejected.
- The number picker offers at most four unused process numbers. Existing numbers are not offered again.
- Nodes use one 360×270 layout with a small template cue, large work/machine photo areas, and a separate product-media action; density controls and the fixed inspector are removed. Canvas zoom reaches 50%. Editing uses a native wide dialog, near full screen on phones. Cancel restores the operation snapshot; revision conflicts retain input.
- Desktop uses the established one-button gesture: drag a node body onto another node to connect it, or release on blank canvas to keep the new position. Circular endpoints also drag to connect; touch uses icon-only move/link handles. Shared Pointer Events provide arrow preview/highlighting and reject self/duplicate/cycle targets. The existing one-successor rule is retained: replacing an outgoing link requires confirmation. Creating a connection immediately applies the graph layout so connected nodes follow arrows from left to right and route lines through reserved gaps. Ordinary position moves are silent. Overlapping drops are rejected; legacy coordinates with overlaps or insufficient connector clearance are repaired in memory when rendered. Submitted, approved, and historical versions are normalized on first display so review cannot reintroduce touching blocks or merged routes. Blank canvas pans. Mouse movement/body-drop linking, endpoint linking and CDP-emulated touch were tested; physical phones remain unverified.
- A category/line workspace has one participating-product set derived from products selected on any node. Adding or removing a product in one operation synchronizes that choice to every existing operation on the product's formal route; new nodes inherit the same route-filtered set. For each affected operation, a newly participating product also inherits already assigned BOM item codes when its own root BOM contains the same normalized codes. Existing and product-unique selections are preserved, and BOM selections are removed only when a product leaves the workspace set. After creation the stage is arranged and the new node is brought into the visible canvas without moving the page scrollbar.
- Process master data for every valid stage retains an ordered set of five photo-first choices: Entry, Manual, Manual Inspection, Machine Setting, and Exit, and may also contain user-created custom templates. The former Machine Assembly key is retained internally as the unified machine template for compatibility; the separate legacy Machine Setting template is retired and its equipment is migrated into the unified template. The master-data page presents one global catalog without a stage selector and applies name/photo/custom-flow changes to every stage. Template media is rendered from the selected template in a dedicated area and is not copied into operation-instruction media. Existing legacy copies are recognized and hidden from the work-media area without rewriting saved history.
- Process-master changes now use the same controlled lifecycle as AB/C master data: create a draft, save, submit to the approval platform, optionally withdraw, and apply only after a user with approval permission confirms it. Approved, superseded, pending, and draft versions remain selectable for read-only history; the process editor reads only `active.PROCESS` projected to `processMasterData`.
- Legacy portable Excel codecs retain template/equipment fields and photos for controlled maintenance compatibility; non-BOM import/export buttons are removed. Codec existence does not authorize importing through ordinary user pages.
- Submission issues start collapsed, grouped by type and product. Only participating products are checked across their required route stages; unselected catalog products do not create missing-stage or BOM errors. Every product group exposes a direct correction action even while its details remain collapsed. Content and BOM actions open the exact operation editor; missing-stage actions show a temporary non-persisted node, while connection actions highlight source/target nodes and draw a non-persisted example drag line. BOM validation normalizes unique item codes, accepts legacy single-product fields, and unions selections only from operations on the product's formal route. For C-line semi-finished products without their own root BOM (for example `3100101`), the direct child requirements from their occurrence in a parent BOM are treated as the selectable root requirements. A root item may be assigned in any applicable stage/block and only needs to appear once in that union; missing-item details list the exact code and name. Selecting all BOM immediately recalculates the visible issue list. Each selected product group in every operation always lists its complete root BOM. The same product/item combination can be assigned to only one operation: rows assigned elsewhere stay visible, identify the owning operation, and are locked until the editor first clears the item in that original operation. The current operation's assignment remains editable and is marked as the current block. Within one operation, selecting or clearing an available BOM item mirrors that state only to enabled rows of other selected products that expose the same normalized item code; different, unavailable, or externally assigned rows remain untouched. Legacy duplicate assignments are not deleted automatically and remain removable from their owning operations. BOM issue product rows show the real number of missing root item codes rather than the number of error records. Full renders preserve page and canvas scrollbar positions during add-menu, creation, connection and movement actions.
- Master-data tab state is shared by content/active styling and URL history. User creation has a standalone heading, responsive fields and inline API errors; successful creation clears its password and updates the list.
- Approved, superseded, and rejected versions are read-only in the editor; RD review access is also locked against editing.


## SOP / Work Instruction

- Implemented instructions are stored inside process operations, not as a separate SOP database table.
- Each operation supports ordered common instruction steps with a required operation description and completion standard.
- Product-specific supplemental steps and `productMediaItems` can be stored separately for each assigned product.
- Common work media remains operation-level. Process-template media is a separate read-only source area in the editor and a compact type cue in builder cards, but is omitted from production-card headers. Product-specific media appears only for that product in product status, dispatch monitoring, and line playback; editor nodes show a compact product-supplement entry point instead of embedding those photos.
- New photos from operation or process-template media entry points are resized to a maximum 1600-pixel edge and encoded as WebP before entering the existing media arrays. Videos, animated GIFs, SVG files, static preset assets, and existing saved media remain unchanged.
- Legacy free-text instruction fields remain compatible, while the current UI edits structured steps.



## Source audit limits

UI cycle prevention is present; backend direction/cycle completeness and all IPQC advisory cases remain unverified. See PROCESS_WORKFLOW. Older submission validation paragraphs describe issue detection/BOM ownership, not permission to restore content-completeness blockers.
