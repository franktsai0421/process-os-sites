詳細權限展開時，原 display:contents/native details 組合把內容壓成單欄，桌面出現大量留白。改用 native details 區塊，展開占滿矩陣寬度，收合摘要保留；僅限使用者模組 CSS 和資源版號。

base：cloud/permissions-verified-29102026；head：cloud/users-permissions-layout-29102026。Draft only，未合併／未發布。API及其他模組邏輯未改。

驗證：33a1fd0 安全建置通過；17組模組UI、完整編譯頁登入／保存讀回／展開寬度／53人分頁4組通過；1440及390px展開不溢出。五次速度已更新於完整交接，開啟使用者中位116.6ms仍未達100ms，不標完整整合放行。截圖與逐筆證據見 docs/acceptance/USERS_CLOUD_CLEAR_RIGHTS_29102026.md。外部預覽與Draft PR建立管道尚受限制。
