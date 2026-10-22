# 依賴發布檢查

## 目前結論與適用版本

2026-10-20 的 R20 graph1 是待驗安全修補候選，不是正式發布批准。候選 package 僅增加 `miniflare@4.20260515.0` 下的 `undici:7.30.1` 精確 override；既有 image-size override 保留。候選 lock 的 root Undici 由7.24.8升至7.30.1，shadcn 原有相同版本的 nested Undici 被去重，786→785個 package rows（含 root）。其餘版本、依賴邊、SRI及engines沒有非預期變更；另有83個 dev／peer旗標的 presence/value變動，不能當純格式略過。npm override是專案根設定的解析機制，見[npm官方說明](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides)；這不等於 Miniflare 上游已支持替換其原精確依賴7.24.8。

採用狀態與最終source／package／lock以當次凍結manifest為準。原9ea來源／既有程式與資料ZIP的結果不能直接貼到新graph。根代理須先保留原兩檔preimage、CAS核對後整合、重凍來源，再依適用批准執行後續容量與最後冷裝。未完成項目仍為HOLD／NOT_VERIFIED。

## 已完成的窄修補與回歸

source-map-js 1.2.1→1.2.2的單節點修補處理[索引offset DoS公告](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)。當時package.json及其餘785個lock節點、SDK/native/lifecycle保持原樣，官方tarball已核SRI/SHA1；受限舊新版對照分別10、12項完成。安裝精確鎖檔後，既有離線入口為：

```powershell
node --max-old-space-size=128 scripts/test-source-map-js-offset.cjs
```

此測試要求installed source-map-js恰為1.2.2，驗合法flat-map roundtrip、中越文字、indexed mapping、非法與超限offset在constructor即拒，以及生成文字已耗盡時保留原文。超大offset從不進入舊版展開／序列化路徑；外層執行器限制10秒。這不代替build、瀏覽器CSP或冷安裝。修補適用npm鎖；不能宣稱所有package manager都已對齊。

1.2.1與1.2.2仍有相同已知限制：indexed consumer在section起點col0查詢可能回null，但eachMapping回col0、col1查詢可取得來源；nested indexed consumer的sourceRoot為undefined，直接傳入SourceMapGenerator.fromSourceMap可能TypeError。不得聲稱這些既存問題已修或所有合法indexed roundtrip通過；flat roundtrip另行通過，專案實際nested轉換reachability尚未證明。

其後MCP SDK1.30.0→1.31.0及shadcn內層Undici7.29.1→7.30.1為精確雙節點修補，原其餘784個lock節點及package.json不變。官方tarball完整性、MCP抽出函式7項、Undici三類handler10項對照已有證據；已安裝CLI help、公開MockAgent及MCP in-memory protocol亦有獨立限定測試。[MCP上游issuer公告](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6qxp-vccf-f47h)所述舊憑證缺issuer及bundled provider限制仍須保留，這些結果不是完整OAuth、stdio或native TLS驗收。

三處borrowed-method修正已整合且全專案實跑為FAIL2，詳見[lint契約](LINT_CONTRACT_POLICY.md)。未改lint規則，不再把原FAIL5當現況，也不稱lint clean。

## R20 graph1 已證相容性與界線

正常 `npm ci --foreground-scripts` 已真exit0，原lifecycle與default audit保留。另一操作代理完整實讀1568個public source及41190個installed檔；foreign bodies一致，新root Undici完整body與SRI對上原nested7.30.1，hidden lock以installed coverage及identity4／flag4 presence/value核對。這不是hidden lock所有JSON欄位全等，也不證明omit／production-only安裝、其他OS或其他package manager相容。

13項公開離線consumer通過：Miniflare／dotenvx／shadcn實際解析與nested去重4項、Undici MockAgent回應／非2xx／不匹配拒外連3項、實際dotenvx helper成功／options與dispatcher轉送／錯誤保留3項、MCP公開in-memory initialize／listTools／callTool3項。無OAuth或native TLS接受聲明。

N3-02實際公開MF四項通過：ready至固定loopback61411、getWorker fetch的method/body、串流完整consume、root Undici原生loopback HTTP status/body。public dispose及專用Agent.close均fulfilled，無D1/R2/KV bindings或資料物件。原工具在initial call即exit0，沒有原session。owned Job19項閉合旗標全真、active0、沒有force或停止無關程序；Node／consoleHost exit0，workerd exit1如實保留，不能稱所有actor graceful0、SDK私有queues或持久化相容已證。先前失敗／HOLD不回算PASS。

這些證據足以支持候選進入已批准範圍的完整容量與最終實包驗證；不是storage、完整應用啟閉、最後ZIP冷裝或正式分發PASS。

## 真實 audit 與剩餘風險

R20 graph1的官方 `npm audit --package-lock-only --json` 已實跑，兩公開metadata檔前後不變；npm exit1，18個aggregate packages、14 high／4 moderate、19個受影響lock nodes、8個直接advisory URL。wrapper exit0只是成功收集報告，不能當audit PASS。該次setup的Set-Acl出現非終止拒絕，沒有取得privateACL證據；不得把此次公開metadata audit描述為已通過私有ACL檢查。

相對原9ea audit19（13 high／6 moderate、29 URLs），只移除Undici aggregate與其21個公告URL；8個保留公告物件完全相同，無新增公告。Cloudflare plugin與Wrangler aggregate severity由moderate變high，Miniflare去除via Undici，三個parent aggregate range也有變化。npm meta-vulnerability重算原因未獨立證明，不把high增加推成新exploit，也不把總數下降推成全安全。更早歷史依序為audit21（15 high／6 moderate、22個受影響lock nodes、31個直接advisory物件）、source-map修補後audit20（14 high／6 moderate）、MCP／CLI窄修後audit19（13 high／6 moderate）。這些是各次鎖檔／registry快照，不與目前18或其8個unique URLs混用。

| 保留風險 | 實際觸發／範圍 | 尚缺的修正與驗證 |
| --- | --- | --- |
| braces及glob／shadcn／vinext鏈 | 深層或不可信glob pattern進入展開；不能單靠dependency標籤推成遠端已可利用，也不能豁免build／CLI。 | 未有本案已核兼容parent方案；不盲採舊版shadcn/vinext降級。需確認實際輸入邊界與有界回歸。 |
| esbuild及Drizzle／Wrangler鏈 | 0.18.20與0.27.3的公告涉及各自serve模式；build/transform成功不等於serve安全。 | 需受支持的parent/native組合與實際serve／build／typegen驗證，不盲改nested native。 |
| sharp0.34.5 | 影像／媒體parser及MF共用native依賴，libvips／libheif／librsvg三項公告保留。 | 需sharp至少0.35.5及相容MF layout的具體版本證據、允許格式／損壞輸入／大小界線／history/blob與容量回歸。 |
| ws8.18.0及plugin／MF／Wrangler鏈 | WebSocket fragment/chunk耗盡與記憶體揭露公告；本機dev SDK是實際執行範圍。 | 需支持ws至少8.21.0的coherent parent組合與WS close/error及完整SDK適用性。不能宣稱plugin1.64即全修。 |

額外[Undici上游TLS1.2 renegotiation公告](https://github.com/nodejs/undici/security/advisories/GHSA-qrxm-fqhp-jwvm)在7.x的修補版為7.30.1；候選root版本已跨該修補界線，但原9ea root7.24.8尚未因文件而改變。公開loopback與handler測試不等於敵意TLS端點實測；npm lock也不會自動更新Node內建fetch所用的bundled實作。該公告不在上述registry audit19目錄，不能以registry未列代表無風險。

## 後續發布門

剩餘安全風險仍HOLD，沒有代owner接受。不得關閉audit／lint／TLS／lifecycle來取得PASS，也不因未完成整組SDK major升級而抹去已完成的窄修補。

後續須以真正採用並凍結的新source／graph，在剩餘批准額度與完整時窗內完成受影響的完整容量更新、repeat、conflicts、interruption及全量備份恢復／讀回；不得用零bindings或小fixture替代。最後程式ZIP須排除compiled build與私有檔，獨立核實際兩包，再從該版本ZIP以獨立fresh dependencies/cache完成適用冷裝與角色／媒體／history／正常入口驗證。尚未完成的結果維持NOT_VERIFIED，不借舊source/build/ZIP或已用bootstrap貼PASS。

IQC UNKNOWN、Master AB HOLD、GUI儲存恢復與整樹上傳清潔等分開列管。本文不表示已做Git stage／commit／push／merge或正式員工分發；候選branch審閱與正式部署批准分開。當次實際收據及最終版本由[HANDOFF](../../HANDOFF.md)所指唯一交接索引定位。
