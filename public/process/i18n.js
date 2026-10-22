(() => {
  const STORAGE_KEY = "processUILanguage";
  const exact = new Map(Object.entries({
    "流程核准後可供製程編輯台使用。":"Quy trình đã duyệt được dùng trong trình soạn thảo.",
    "尚未發送產品":"Chưa gửi sản phẩm",
    "生產管理中心":"Trung tâm quản lý sản xuất",
    "今日工廠狀態":"Tình trạng nhà máy hôm nay",
    "製程中控入口":"Cổng điều hành quy trình",
    "製程中控平台":"Cổng điều hành quy trình",
    "請輸入由 ADMIN 建立的平台帳號與密碼。":"Đăng nhập bằng tài khoản do ADMIN tạo.",
    "請使用由 ADMIN 建立的平台帳號與密碼。":"Đăng nhập bằng tài khoản do ADMIN tạo.",
    "此網站未開啟公開示範登入":"Trang web này chưa bật đăng nhập dùng thử công khai",
    "配件組裝":"Lắp ráp phụ kiện",
    "工段選單與後台產線同步；所有已發送產品都會顯示，不適用此工段時會明確標示。":"Danh sách công đoạn đồng bộ với cấu hình chuyền trong phần quản trị; tất cả sản phẩm đã gửi đều được hiển thị và được ghi rõ khi công đoạn này không áp dụng.",
    "請從發送介面選擇最多三項產品。":"Vui lòng chọn tối đa ba sản phẩm trong giao diện điều phối.",
    "主要功能":"Chức năng chính",
    "目前身分：ADMIN｜可管理使用者與權限。":"Vai trò hiện tại: ADMIN | Có thể quản lý người dùng và quyền.",
    "個人資料與密碼請開啟「我的帳號」。":"Mở Tài khoản của tôi để xem thông tin và đổi mật khẩu.",
    "產品編號／名稱／規格":"Mã / tên / quy cách sản phẩm",
    "此線別沒有可查看的產品":"Chuyền này không có sản phẩm để xem",
    "版本尚未完成伺服器儲存，內容與原狀態已保留。請確認連線後重試；衝突或登入失效需先重新登入確認。":"Phiên bản chưa được lưu trên máy chủ. Nội dung và trạng thái trước đó được giữ lại. Kiểm tra kết nối rồi thử lại; nếu có xung đột hoặc phiên đăng nhập hết hạn, hãy đăng nhập lại để kiểm tra.",
    "缺少適用流程":"Thiếu quy trình áp dụng", "BOM 未分配":"BOM chưa phân bổ", "前往修正":"Đi đến sửa", "查看問題":"Xem vấn đề",
    "前往建立連線":"Đi đến tạo liên kết", "前往補寫作業說明":"Đi đến bổ sung hướng dẫn", "前往填寫基本資料":"Đi đến điền thông tin cơ bản", "前往分配 BOM":"Đi đến phân bổ BOM", "前往建立流程":"Đi đến tạo quy trình",
    "請建立連線":"Hãy tạo liên kết", "共用操作照片":"Ảnh thao tác dùng chung", "按住圓點拖到這裡":"Giữ điểm tròn và kéo đến đây",
    "可多選，每個產品各自保存":"Có thể chọn nhiều; lưu riêng cho từng sản phẩm", "可多選，每個產品各自保存；照片會自動壓縮":"Có thể chọn nhiều; lưu riêng cho từng sản phẩm; ảnh sẽ tự động nén", "＋ 增加此產品的照片／影片":"＋ Thêm ảnh/video cho sản phẩm này", "＋ 增加照片／影片":"＋ Thêm ảnh/video",
    "點擊查看":"Nhấn để xem", "作業與產品照片／影片":"Ảnh/video thao tác và sản phẩm", "尚未上傳作業或產品照片／影片":"Chưa tải ảnh/video thao tác hoặc sản phẩm", "產品 BOM":"BOM sản phẩm",
    "照片上傳時自動縮至最長邊 1600px 並壓縮；影片維持原檔。":"Ảnh sẽ tự thu nhỏ cạnh dài nhất xuống 1600px và nén khi tải lên; video giữ nguyên tệp gốc.",
    "照片已自動壓縮後加入":"Ảnh đã được tự động nén và thêm vào", "照片處理失敗，請改用 JPG、PNG 或 WebP":"Không thể xử lý ảnh; vui lòng dùng JPG, PNG hoặc WebP",
    "虛線只是操作示範，不會自動修改資料。":"Đường nét đứt chỉ minh họa thao tác và không tự thay đổi dữ liệu.",
    "查看送審檢查規則":"Xem quy tắc kiểm tra trước khi gửi duyệt",
    "查看全部報錯規範（9 項）":"Xem toàn bộ 9 quy tắc báo lỗi",
    "這些是系統送審時實際執行的全部檢查；尚未在任何流程方塊勾選的產品不列入送審檢查。":"Đây là toàn bộ kiểm tra thực tế khi gửi duyệt; sản phẩm chưa được chọn trong bất kỳ thẻ quy trình nào sẽ không bị kiểm tra.",
    "目前無法送審的原因":"Lý do hiện tại chưa thể gửi duyệt",
    "下列數字是實際尚未完成的資料，不是系統故障。":"Các con số dưới đây là dữ liệu thực tế chưa hoàn tất, không phải lỗi hệ thống.",
    "下列數字是實際尚未完成的資料，不是系統故障；BOM 數字代表有問題的產品數量。":"Các con số dưới đây là dữ liệu thực tế chưa hoàn tất, không phải lỗi hệ thống; số BOM là số sản phẩm đang có vấn đề.",
    "已在至少一個方塊勾選的產品，其正式路線必要工段沒有任何方塊套用該產品。":"Sản phẩm đã được chọn trong ít nhất một thẻ nhưng một công đoạn bắt buộc trên tuyến chính thức chưa có thẻ áp dụng sản phẩm đó.",
    "參與產品需要的根層 BOM 零件，尚未全部分配到適用流程。":"Linh kiện BOM cấp gốc của sản phẩm tham gia chưa được phân bổ hết vào quy trình áp dụng.",
    "參與產品的全部適用流程方塊合併後，仍有根層 BOM 料號尚未被勾選。":"Sau khi gộp tất cả thẻ quy trình áp dụng của sản phẩm tham gia, vẫn còn mã BOM cấp gốc chưa được chọn.",
    "尚未分配的 BOM 料號":"Mã BOM chưa được phân bổ", "未找到品名":"Không tìm thấy tên vật tư",
    "已使用於":"Đã dùng tại", "尚未使用":"Chưa sử dụng", "本方塊":"Thẻ này", "未命名流程":"Quy trình chưa đặt tên",
    "請先到原方塊取消勾選":"Hãy bỏ chọn tại thẻ ban đầu trước",
    "流程有孤立方塊、失效連線，或同時連到多個下一流程。":"Quy trình có thẻ tách rời, liên kết không còn hiệu lực hoặc nối đến nhiều bước kế tiếp.",
    "流程缺少操作步驟或完成標準。":"Quy trình thiếu bước thao tác hoặc tiêu chuẩn hoàn thành.",
    "流程缺少名稱，或機器流程尚未選擇設備。":"Quy trình thiếu tên hoặc bước dùng máy chưa chọn thiết bị.",
    "變更已保留於目前畫面，尚未完成儲存":"Thay đổi được giữ trên màn hình hiện tại nhưng chưa lưu xong",
    "產品只要在任一流程方塊被勾選，就會成為本工作區的參與產品；其正式路線每個必要工段都至少要有一個套用該產品的流程方塊。":"Khi được chọn trong bất kỳ thẻ quy trình nào, sản phẩm trở thành sản phẩm tham gia; mỗi công đoạn bắt buộc trên tuyến chính thức phải có ít nhất một thẻ áp dụng sản phẩm đó.",
    "有套用產品的流程方塊必須填寫流程名稱。":"Thẻ quy trình có áp dụng sản phẩm phải điền tên quy trình.",
    "機器流程必須選擇至少一台設備。":"Bước dùng máy phải chọn ít nhất một thiết bị.",
    "流程至少要有一個操作步驟。":"Quy trình phải có ít nhất một bước thao tác.",
    "每個已填寫的操作步驟都必須填寫完成標準。":"Mỗi bước thao tác đã nhập phải có tiêu chuẩn hoàn thành.",
    "每個流程最多只能連到一個下一流程。":"Mỗi quy trình chỉ được nối đến tối đa một quy trình kế tiếp.",
    "流程線只能連到同工段目前存在的方塊；刪除方塊後不可留下失效連線。":"Đường quy trình chỉ được nối đến thẻ đang tồn tại trong cùng công đoạn; không được để liên kết mất hiệu lực sau khi xóa thẻ.",
    "連線建立完成，畫面已依箭頭方向整理":"Đã tạo liên kết và sắp xếp màn hình theo hướng mũi tên",
    "同工段有兩個以上適用流程時，所有流程必須連成同一個流程群組，不可有孤立方塊。":"Khi một công đoạn có từ hai bước áp dụng trở lên, tất cả phải nằm trong cùng một nhóm liên kết, không được có thẻ tách rời.",
    "參與產品的根層 BOM 零件必須分配到套用該產品的流程。":"Linh kiện BOM cấp gốc của sản phẩm tham gia phải được phân bổ vào các bước áp dụng sản phẩm đó.",
    "參與產品的根層 BOM 零件可以分配在不同工段或方塊，但所有適用流程方塊合併後必須完整涵蓋全部料號；同一料號至少在一個方塊勾選即可。":"Có thể phân bổ linh kiện BOM cấp gốc của sản phẩm tham gia vào các công đoạn hoặc thẻ khác nhau, nhưng khi gộp tất cả thẻ áp dụng phải bao phủ đầy đủ mọi mã; mỗi mã chỉ cần được chọn trong ít nhất một thẻ.",
    "此工段缺少適用流程":"Công đoạn này thiếu quy trình áp dụng", "這是暫時提示，不會寫入正式資料；請從上方選擇流程建立。":"Đây là thẻ nhắc tạm thời, không ghi vào dữ liệu chính thức; hãy chọn quy trình ở phía trên để tạo.",
    "請填寫姓名":"Vui lòng nhập họ tên", "至少 6 個字元":"Ít nhất 6 ký tự", "密碼至少需要 6 個字元":"Mật khẩu cần ít nhất 6 ký tự",
    "此帳號已存在，請使用其他帳號（英文不分大小寫）":"Tài khoản đã tồn tại. Hãy chọn tên khác (không phân biệt hoa thường).",
    "請填寫英文字母或數字帳號，可使用點、底線及連字號":"Nhập tài khoản bằng chữ Latin hoặc số; có thể dùng dấu chấm, gạch dưới và gạch nối.",
    "角色管理":"Quản lý vai trò", "建立 User":"Tạo người dùng", "User 列表與個別設定":"Danh sách và thiết lập người dùng",
    "跟隨角色":"Theo vai trò", "自訂權限":"Quyền tùy chỉnh", "恢復跟隨角色":"Khôi phục quyền theo vai trò",
    "權限模式":"Chế độ phân quyền",  "角色名稱":"Tên vai trò", "儲存角色":"Lưu vai trò",
    "刪除角色":"Xóa vai trò", "＋ 建立角色":"＋ Tạo vai trò", "顯示示範身分":"Hiển thị tài khoản dùng thử",
    "可使用產線":"Dây chuyền được phép",  "可執行操作":"Thao tác được phép",
    "多數 User 使用「跟隨角色」；只有特殊需求才使用「自訂權限」。":"Nên dùng quyền theo vai trò; chỉ tùy chỉnh quyền cho trường hợp đặc biệt.",
    "自訂權限只影響此 User":"Quyền tùy chỉnh chỉ áp dụng cho người dùng này", "帳號、姓名或角色":"Tài khoản, tên hoặc vai trò",
    "刪除 User":"Xóa người dùng", "⠿ 移動":"⠿ Di chuyển", "↗ 連線":"↗ Kết nối",
    "流程設定":"Thiết lập quy trình",
    "作業說明、完成標準與媒體":"Hướng dẫn, tiêu chuẩn và nội dung đa phương tiện", "作業說明照片或影片 · 可多選":"Ảnh hoặc video hướng dẫn · Có thể chọn nhiều",
    "作業說明媒體":"Nội dung hướng dẫn", "產品補充媒體":"Nội dung bổ sung theo sản phẩm", "作業照片":"Ảnh thao tác", "機器照片":"Ảnh máy", "產品照片":"Ảnh sản phẩm", "產品照片設定":"Cài đặt ảnh sản phẩm", "產品內容":"Nội dung sản phẩm",  "查看產品專屬流程與照片":"Xem quy trình và ảnh riêng của sản phẩm",
    "本方塊被選取":"Đã chọn trong ô này", "其他方塊":"Ô khác",

    "製程標準播放系統":"Hệ thống hiển thị tiêu chuẩn quy trình","製":"SX","製程":"Quy trình",
    "製程中控":"Điều hành quy trình","製程中控系統":"Hệ thống điều hành quy trình","品質管理":"Quản lý chất lượng","品質管理系統":"Hệ thống quản lý chất lượng","品質系統":"Hệ thống chất lượng","中控系統":"Hệ thống điều hành","模具設備":"Thiết bị khuôn","檢具與測試設備":"Dưỡng kiểm và thiết bị thử","選擇系統":"Chọn hệ thống","總覽":"Tổng quan","生產總覽":"Tổng quan sản xuất","系統管理員":"Quản trị hệ thống",
    "產線播放台":"Màn hình chuyền","發送介面":"Điều phối","產品製程狀態":"Trạng thái quy trình",
    "版本確認平台":"Duyệt phiên bản","製程版本確認平台":"Nền tảng duyệt phiên bản quy trình",
    "製程編輯台":"Soạn quy trình","資料後台":"Quản lý dữ liệu","系統連線正常":"Hệ thống hoạt động bình thường",
    "尚未登入":"Chưa đăng nhập","登出／切換使用者":"Đổi tài khoản","切換使用者":"Đổi tài khoản","登出":"Đăng xuất","登入平台":"Đăng nhập","登入中控系統":"Đăng nhập hệ thống điều hành","登入品質系統":"Đăng nhập hệ thống chất lượng","切換至品質系統":"Sang hệ chất lượng","切換至中控系統":"Sang hệ điều hành","帳號":"Tài khoản","密碼":"Mật khẩu",
    "選擇示範身分":"Chọn vai trò dùng thử","全部功能與使用者管理":"Toàn bộ chức năng và quản lý người dùng",
    "版本確認與製程檢視":"Duyệt phiên bản và xem quy trình","製程編輯與送審":"Chỉnh sửa và gửi duyệt",
    "或輸入帳號密碼":"Hoặc nhập tài khoản và mật khẩu","產線設備直接播放":"Thiết bị chuyền phát trực tiếp",
    "進入工段播放":"Mở màn hình công đoạn","線別":"Chuyền","公段":"Công đoạn","標準搜尋":"Tìm tiêu chuẩn","品質報告":"Báo cáo chất lượng","例行檢查":"Kiểm tra định kỳ","例行報告資料庫":"Cơ sở dữ liệu báo cáo định kỳ","品質管理系統基本框架":"Khung cơ bản của hệ thống quản lý chất lượng","功能建置中":"Chức năng đang được xây dựng",
    "使用者與平台權限":"Người dùng và quyền hệ thống","建立使用者":"Tạo người dùng","姓名":"Họ tên","角色範本":"Mẫu vai trò",
    "完整使用者管理":"Quản lý người dùng đầy đủ","查看帳號狀態、角色繼承、個別設定與最終有效權限。":"Xem trạng thái tài khoản, quyền kế thừa, thiết lập riêng và quyền hiệu lực cuối cùng.","登入頁顯示示範身分":"Hiển thị vai trò mẫu tại trang đăng nhập","初始密碼":"Mật khẩu ban đầu","啟用中":"Đang hoạt động","已停用":"Đã vô hiệu hóa","帳號啟用":"Kích hoạt tài khoản","繼承角色設定":"Kế thừa thiết lập vai trò","最終有效權限":"Quyền hiệu lực cuối cùng","可用產線":"Chuyền được phép dùng","可進入頁面":"Trang được phép truy cập","個別設定":"Thiết lập riêng","儲存修改":"Lưu thay đổi","重設密碼":"Đặt lại mật khẩu","新密碼":"Mật khẩu mới","確認重設":"Xác nhận đặt lại",
    "製程人員":"Nhân viên quy trình","人員":"Nhân viên","主管":"Quản lý","RD 主管":"Quản lý RD",
    "左側功能入口":"Quyền truy cập chức năng","線別資料範圍":"Phạm vi dữ liệu chuyền","平台內操作":"Thao tác trong nền tảng",
    "主資料後台":"Dữ liệu chính","刪除類別／產品／線別／工段":"Xóa nhóm / sản phẩm / chuyền / công đoạn","匯入 Excel 資料":"Nhập dữ liệu Excel","匯出 Excel 資料":"Xuất dữ liệu Excel",
    "選擇角色":"Chọn vai trò","可使用功能":"Chức năng được dùng","操作權限":"Quyền thao tác","角色統一管理":"Quản lý thống nhất theo vai trò","僅可查看授權內容":"Chỉ được xem nội dung đã cấp quyền",
    "先設定可進入的介面，再依介面設定可執行的操作。":"Trước tiên chọn giao diện được vào, sau đó chọn thao tác trong từng giao diện.","① 線別資料範圍":"① Phạm vi dữ liệu chuyền","限制此角色可查看及編輯的產線資料":"Giới hạn dữ liệu chuyền mà vai trò được xem và sửa","② 可進入的介面":"② Giao diện được truy cập","未勾選的介面不會出現在左側選單":"Giao diện không chọn sẽ không hiện ở menu bên trái","③ 各介面的操作權限":"③ Quyền thao tác theo giao diện","每一組都標示作用介面；只有進入介面仍不代表能執行下列操作。":"Mỗi nhóm ghi rõ giao diện áp dụng; được vào giao diện chưa có nghĩa là được thực hiện các thao tác bên dưới.",
    "作用介面：版本確認平台":"Giao diện: Nền tảng duyệt phiên bản","作用介面：產品製程狀態":"Giao diện: Trạng thái quy trình","作用介面：主資料後台":"Giao diện: Dữ liệu chính","控制版本查看、送審與主管確認動作":"Kiểm soát xem phiên bản, gửi duyệt và thao tác xác nhận","控制可查看的線別及方塊內容":"Kiểm soát chuyền và nội dung khối được xem","刪除與 Excel 資料交換屬於主管權限":"Xóa và trao đổi dữ liệu Excel thuộc quyền quản lý",
    "建立角色範本":"Tạo mẫu vai trò","新角色名稱":"Tên vai trò mới","基礎權限":"Quyền nền","建立角色":"Tạo vai trò","目前角色":"Vai trò hiện tại","角色權限設定":"Thiết lập quyền vai trò","儲存角色權限":"Lưu quyền vai trò",
    "新增使用者時選擇角色；角色的共用權限在下方統一設定。":"Chọn vai trò khi tạo người dùng; quyền dùng chung của vai trò được thiết lập bên dưới.","選擇一個角色後，直接修改該角色的共用範圍。":"Chọn một vai trò rồi chỉnh trực tiếp phạm vi dùng chung.","勾選後儲存，所有使用此角色的人會套用相同範圍":"Chọn và lưu; mọi người dùng vai trò này sẽ dùng cùng phạm vi","儲存後，所有使用此角色的人會立即套用":"Sau khi lưu, tất cả người dùng vai trò này sẽ được áp dụng ngay",
    "只有主管可以匯入或匯出資料。":"Chỉ quản lý được nhập hoặc xuất dữ liệu.","只有主管可刪除主資料。":"Chỉ quản lý được xóa dữ liệu chính.","目前有主資料正在送審，為避免版本衝突，暫停刪除。":"Đang có dữ liệu chính chờ duyệt; tạm khóa xóa để tránh xung đột.",
    "查看全部版本":"Xem tất cả phiên bản","查看授權線版本":"Xem phiên bản của chuyền được cấp quyền","版本差異比對":"So sánh khác biệt phiên bản",
    "建立／重新送審":"Tạo / Gửi duyệt lại","由舊版建立修訂":"Tạo bản sửa đổi từ phiên bản cũ","查看全部線別":"Xem tất cả chuyền",
    "查看 BOM／設備／IPQC":"Xem BOM / thiết bị / IPQC","查看操作照片／影片":"Xem ảnh / video thao tác",
    "功能入口":"Lối vào chức năng","資料範圍":"Phạm vi dữ liệu","快速套用角色規則":"Áp dụng nhanh mẫu vai trò",
    "全選／清除":"Chọn tất cả / Bỏ chọn","清除":"Bỏ chọn","儲存權限":"Lưu quyền","儲存成功":"Đã lưu thành công",
    "版本紀錄":"Lịch sử phiên bản","目前工作內容":"Nội dung đang làm việc",
    "草稿 · 未送審":"Bản nháp · Chưa gửi","主管審核中":"Quản lý đang duyệt","已確認":"Đã duyệt","已核准":"Đã phê duyệt",
    "歷史核准":"Bản đã phê duyệt trước","歷史版本":"Phiên bản trước","待修改":"Cần chỉnh sửa","退回修改":"Trả lại để chỉnh sửa","要求修改":"Yêu cầu chỉnh sửa",
    "最新版":"Mới nhất","產線使用":"Đang dùng trên chuyền","目前核准":"Đang được phê duyệt","待確認":"Chờ duyệt",
    "全部版本":"Tất cả phiên bản","送審版本":"Phiên bản đã gửi","查看版本":"Xem phiên bản","不比對":"Không so sánh",
    "回編輯台查看":"Mở trong trình chỉnh sửa","確認前檢查通過":"Kiểm tra trước duyệt đạt","修正後才能核准":"Phải sửa trước khi duyệt",
    "BOM 與操作流程完整":"BOM và hướng dẫn thao tác đầy đủ","BOM 未使用完":"BOM chưa phân bổ hết","缺少操作流程":"Thiếu hướng dẫn thao tác",
    "確認歷史":"Lịch sử duyệt","確認版本":"Duyệt phiên bản","解除確認":"Hủy phê duyệt","返回確認":"Hoàn tác phê duyệt","主管返回確認":"Quản lý hoàn tác phê duyệt","解除送審，繼續修改":"Rút hồ sơ và tiếp tục sửa",
    "進入編輯台修改":"Mở để chỉnh sửa","要求建立修改版本":"Yêu cầu tạo phiên bản sửa đổi","以此版本建立修訂":"Tạo bản sửa đổi từ phiên bản này",
    "建立新版本草稿":"Tạo bản nháp phiên bản mới","儲存草稿":"Lưu bản nháp",
    "建立第一版草稿":"Tạo bản nháp đầu tiên","展開⌄":"Mở rộng⌄","收合⌃":"Thu gọn⌃","展開":"Mở rộng","收合":"Thu gọn",
    "產品類型（PDF）":"Loại sản phẩm (PDF)","選擇線別":"Chọn chuyền","工段流程":"Quy trình công đoạn","工段流程編輯":"Chỉnh sửa quy trình công đoạn","整理全部工段":"Sắp xếp mọi công đoạn",
    "比對版本（預設上一版）":"So sánh phiên bản (mặc định: bản trước)","兩個版本內容相同":"Hai phiên bản có nội dung giống nhau","範例版本確認完成":"Phiên bản mẫu đã được duyệt",
    "自動整理":"Tự động sắp xếp","新增流程":"Thêm bước","畫布縮放":"Thu phóng sơ đồ","重設":"Đặt lại","方塊密度":"Mật độ thẻ","精簡":"Gọn","標準":"Tiêu chuẩn","建立連線":"Tạo liên kết","復原位置":"Khôi phục vị trí","移動":"Di chuyển","基本資料":"Thông tin cơ bản","產品與 BOM":"Sản phẩm và BOM","人員與設備":"Nhân sự và thiết bị","作業說明與完成標準":"Hướng dẫn và tiêu chuẩn hoàn thành","照片與影片":"Ảnh và video",
    "單一流程內容":"Nội dung một bước","流程編號（自動產生）":"Mã bước (tự động)","流程編號（自訂；已使用的號碼不顯示）":"Mã bước (tùy chỉnh; số đã dùng sẽ không hiển thị)","後台流程資料":"Dữ liệu bước từ hệ thống",
    "自訂流程":"Bước tùy chỉnh","作業方式":"Phương thức thao tác","人工流程":"Thao tác thủ công",
    "機器流程":"Thao tác bằng máy","建議操作人數":"Số người đề xuất","人工組裝建議人數":"Số người lắp ráp đề xuất",
    "後台設備":"Thiết bị hệ thống","請選擇機器":"Chọn máy","適用產品":"Sản phẩm áp dụng","稍後設定產品":"Chọn sản phẩm sau",
    "BOM 零件分配":"Phân bổ linh kiện BOM","操作照片或影片":"Ảnh hoặc video thao tác","操作照片或影片 · 可多選":"Ảnh/video thao tác · Có thể chọn nhiều",
    "操作流程":"Hướng dẫn thao tác","IPQC 標準":"Tiêu chuẩn IPQC","刪除流程":"Xóa bước","套用流程內容":"Áp dụng nội dung bước","此流程需補資料":"Bước này cần bổ sung dữ liệu",
    "共用操作流程":"Hướng dẫn thao tác chung","操作內容":"Nội dung thao tác","需要達到的標準":"Tiêu chuẩn cần đạt",
    "完成並建立下一步":"Hoàn tất và tạo bước tiếp theo","完成一個步驟與標準後，才能建立下一個":"Hoàn tất nội dung và tiêu chuẩn của bước hiện tại để tạo bước tiếp theo","指定產品的補充操作流程":"Hướng dẫn bổ sung theo sản phẩm",
    "專用補充流程":"Hướng dẫn bổ sung riêng","專用備註":"Ghi chú riêng","搜尋產品編號或名稱":"Tìm mã hoặc tên sản phẩm",
    "拖曳方塊調整位置":"Kéo thẻ để đổi vị trí","箭頭依流程編號連接":"Mũi tên nối theo thứ tự bước",
    "產品編號／名稱":"Mã / tên sản phẩm","尚未上傳操作照片":"Chưa tải ảnh thao tác",
    "BOM 零件":"Linh kiện BOM","點擊展開":"Bấm để mở","放大":"Phóng to","案件狀態":"Trạng thái hồ sơ","確認前檢查":"Kiểm tra trước duyệt","產線目前使用":"Chuyền đang dùng","完整，可確認":"Đầy đủ, có thể duyệt","使用機器":"Máy sử dụng","設備":"Thiết bị","照片":"Ảnh","人工":"Thủ công","機器":"Máy",
    "操作照片":"Ảnh thao tác","共用操作":"Thao tác chung","尚未指定設備":"Chưa chỉ định thiết bị","尚未指定產品":"Chưa chỉ định sản phẩm",
    "產線播放內容監控":"Giám sát nội dung hiển thị trên chuyền","監控線別":"Chuyền giám sát","監控公段":"Công đoạn giám sát",
    "全螢幕":"Toàn màn hình","退出全螢幕":"Thoát toàn màn hình","正在此線發送":"đang được gửi trên chuyền này",
    "此線尚未發送產品":"Chưa có sản phẩm được gửi đến chuyền này","已核准版本":"Phiên bản đã phê duyệt",
    "發送產品":"Gửi sản phẩm","目前發送":"Đang phát","選擇產品":"Chọn sản phẩm","發送至產線":"Gửi đến chuyền",
    "產品資料":"Dữ liệu sản phẩm","設備資料":"Dữ liệu thiết bị","使用者管理":"Quản lý người dùng",
    "產品與產線":"Sản phẩm và chuyền","AB 產線與類別":"Chuyền và nhóm AB","C 產線與類別":"Chuyền và nhóm C","BOM 資料":"Dữ liệu BOM","產線與工段":"Chuyền và công đoạn","使用者與權限":"Người dùng và quyền",
    "備份與回復":"Sao lưu và khôi phục","備份與還原":"Sao lưu và khôi phục","整站備份與還原":"Sao lưu và khôi phục toàn bộ hệ thống","方式一":"Phương thức 1","方式二":"Phương thức 2","本機硬碟完整備份":"Sao lưu đầy đủ vào ổ cứng máy chủ","雲端資料備份":"Sao lưu dữ liệu đám mây","只有 ADMIN 可以查閱備份":"Chỉ ADMIN được xem bản sao lưu","重新載入":"Tải lại",
    "目前備份路徑":"Đường dẫn sao lưu hiện tại","最近成功備份":"Lần sao lưu thành công gần nhất","下次預定備份":"Lần sao lưu kế tiếp","本週自動備份":"Sao lưu tự động tuần này","磁碟剩餘空間":"Dung lượng đĩa còn trống","最近失敗原因":"Lỗi gần nhất","備份資料夾":"Thư mục sao lưu","伺服器自動備份路徑":"Đường dẫn sao lưu tự động trên máy chủ","選擇資料夾":"Chọn thư mục","保留天數":"Số ngày lưu giữ","自動備份":"Sao lưu tự động","啟用每週自動備份":"Bật sao lưu tự động hằng tuần","越南時間":"Giờ Việt Nam","儲存設定":"Lưu cài đặt","驗證並儲存設定":"Kiểm tra và lưu thiết lập","立即備份":"Sao lưu ngay","重新掃描":"Quét lại",
    "備份內容":"Nội dung sao lưu","備份時間":"Thời gian sao lưu","檔案":"Tệp","系統／資料庫版本":"Phiên bản hệ thống / cơ sở dữ liệu","狀態":"Trạng thái","完整":"Hoàn chỉnh","損壞／禁止還原":"Bị hỏng / Không thể khôi phục","檢查":"Kiểm tra","下載":"Tải xuống","還原":"Khôi phục","最高管理員操作紀錄":"Nhật ký thao tác quản trị cao nhất","待命":"Sẵn sàng","雲端待命":"Đám mây sẵn sàng",
    "雲端目前資料版本":"Phiên bản dữ liệu đám mây hiện tại","時區":"Múi giờ","備份範圍":"Phạm vi sao lưu","全站共用資料與所有選項":"Toàn bộ dữ liệu dùng chung và mọi tùy chọn","每週自動備份":"Sao lưu tự động hằng tuần","儲存雲端排程":"Lưu lịch sao lưu đám mây","立即建立雲端備份":"Tạo bản sao lưu đám mây ngay","重新整理":"Làm mới","雲端備份內容":"Nội dung sao lưu đám mây","備份 ID／原因":"ID sao lưu / Lý do","版本":"Phiên bản","建立者":"Người tạo","回復此版本":"Khôi phục phiên bản này",
    "先選類別":"Chọn nhóm trước","請先選產品類別":"Vui lòng chọn nhóm sản phẩm trước","未設定":"Chưa thiết lập","選擇產品後顯示完整名稱與規格":"Chọn sản phẩm để xem đầy đủ tên và quy cách","每個欄位先選產品類別，再選該類別的產品；每條線最多同時發送三項。":"Mỗi ô chọn nhóm sản phẩm trước, sau đó chọn sản phẩm thuộc nhóm; mỗi chuyền có thể gửi tối đa ba sản phẩm cùng lúc.","目前身分：ADMIN｜可管理使用者、權限、本機硬碟與雲端備份。":"Vai trò hiện tại: ADMIN | Có thể quản lý người dùng, quyền, sao lưu ổ cứng và sao lưu đám mây.",
    "目前位於公開網站，使用雲端資料備份；本機硬碟完整備份仍保留在管理電腦。":"Trang công khai sử dụng bản sao lưu dữ liệu đám mây; bản sao lưu đầy đủ trên ổ cứng vẫn được lưu tại máy quản trị.","儲存網站所有共用資料與選項版本，適合線上快速回復；由公開網站的 ADMIN 管理。":"Lưu mọi dữ liệu dùng chung và phiên bản tùy chọn của trang web để khôi phục nhanh trực tuyến; do ADMIN của trang công khai quản lý.","由 Windows 主機後端執行；瀏覽器關閉後排程仍由網站服務處理。":"Thực hiện bởi máy chủ Windows; lịch sao lưu vẫn do dịch vụ web xử lý khi trình duyệt đóng.","儲存至 .local-backups，包含網站程式、資料庫、資產與還原資訊。必須從本機管理網址執行。":"Lưu tại .local-backups, bao gồm mã nguồn trang web, cơ sở dữ liệu, tài nguyên và thông tin khôi phục. Chỉ thực hiện từ địa chỉ quản trị trên máy chủ.","正在載入本機硬碟或雲端備份資料…":"Đang tải dữ liệu sao lưu từ ổ cứng hoặc đám mây…","每週六":"Thứ Bảy hằng tuần","星期六":"Thứ Bảy","資料版本":"Phiên bản dữ liệu","整站資料異動前保護備份":"Bản sao lưu bảo vệ trước khi thay đổi dữ liệu toàn hệ thống",
    "總覽：全站統計與即時狀態所需來源":"Tổng quan: nguồn dữ liệu cho thống kê toàn hệ thống và trạng thái thời gian thực","產線播放台：已核准製程、工段內容、BOM、設備與照片":"Màn hình chuyền: quy trình đã duyệt, nội dung công đoạn, BOM, thiết bị và hình ảnh","發送介面：A／B／C 線發送設定與產品安排":"Điều phối: cấu hình gửi chuyền A/B/C và sắp xếp sản phẩm","產品製程狀態：產品、路線、BOM 與已核准版本":"Trạng thái quy trình: sản phẩm, tuyến, BOM và phiên bản đã duyệt","版本確認平台：主資料與製程版本、送審狀態及確認紀錄":"Nền tảng duyệt: dữ liệu chính, phiên bản quy trình, trạng thái gửi duyệt và lịch sử xác nhận","製程編輯台：所有類別工作區、流程方塊、連線、BOM 分配與草稿":"Trình chỉnh sửa: mọi vùng làm việc theo nhóm, bước quy trình, liên kết, phân bổ BOM và bản nháp","資料後台：AB／C 類別、產品、BOM、線別、工段、流程資料、使用者與角色權限":"Quản lý dữ liệu: nhóm AB/C, sản phẩm, BOM, chuyền, công đoạn, dữ liệu quy trình, người dùng và quyền vai trò",
    "產品分類與製程路線已合併":"Đã hợp nhất phân loại sản phẩm và tuyến quy trình","重新匯入 PDF / Excel":"Nhập lại PDF / Excel",
    "產品分類不採用 Excel":"Phân loại sản phẩm không dùng Excel","PDF 產品類別":"Loại sản phẩm PDF","產品編號":"Mã sản phẩm","產品名稱":"Tên sản phẩm",
    "規格":"Quy cách","製程路線":"Tuyến quy trình","成功對應":"đã đối chiếu thành công","待建立":"Chưa thiết lập",
    "早安，生產管理中心":"Chào buổi sáng, trung tâm quản lý sản xuất",
    "PDF 產品分類":"Phân loại sản phẩm PDF","產品分類":"Phân loại sản phẩm",
    "BOM 對應產品":"Sản phẩm có BOM","成品製程路線":"Tuyến quy trình thành phẩm","半成品製程":"Quy trình bán thành phẩm",
    "已完成":"Đã hoàn tất",
    "三條產線已建立，產品會依 Master SKU 自動帶出線別與製程。":"Đã thiết lập ba chuyền sản xuất; sản phẩm sẽ tự động nạp chuyền và quy trình theo Master SKU.",
    "產線即時狀態":"Trạng thái chuyền theo thời gian thực","成品組裝線":"Chuyền lắp ráp thành phẩm · ",
    "配件組裝線":"Chuyền lắp ráp phụ kiện · ","零件加工線":"Chuyền gia công linh kiện · ","等待下一張工單":"Chờ lệnh sản xuất tiếp theo",
    "快速操作":"Thao tác nhanh","發送新製程":"Gửi quy trình mới","編輯 BORUAXE 流程":"Chỉnh sửa quy trình BORUAXE",
    "查看匯入資料":"Xem dữ liệu đã nhập","開啟產線電視畫面":"Mở màn hình TV của chuyền",
    "匯入資料":"Nhập dữ liệu","匯入 Excel":"Nhập Excel","匯出 Excel":"Xuất Excel","搜尋產品":"Tìm sản phẩm","新增產品":"Thêm sản phẩm","新增後台流程":"Thêm quy trình hệ thống","儲存流程資料":"Lưu dữ liệu quy trình",
    "六個標準流程":"Sáu quy trình chuẩn","每個工段都使用相同六種流程；建立方塊時自動帶入照片，之後仍可在方塊內自由更換。":"Mỗi công đoạn dùng cùng sáu quy trình; ảnh được tự động đưa vào khi tạo thẻ và vẫn có thể thay đổi tự do trong thẻ.","流程與照片資料":"Dữ liệu quy trình và ảnh","六個標準流程會保留；也可新增自己的流程。這裡匯入或匯出會包含全部工段、全部流程與所有照片。":"Sáu quy trình chuẩn luôn được giữ lại; bạn cũng có thể thêm quy trình riêng. Nhập hoặc xuất tại đây bao gồm tất cả công đoạn, quy trình và ảnh.","完整備份格式":"Định dạng sao lưu đầy đủ","JSON 檔包含本頁全部工段、流程名稱與照片；匯入前會先請你確認。":"Tệp JSON chứa tất cả công đoạn, tên quy trình và ảnh trên trang này; hệ thống sẽ hỏi xác nhận trước khi nhập.","匯出全部流程資料":"Xuất toàn bộ dữ liệu quy trình","匯入全部流程資料":"Nhập toàn bộ dữ liệu quy trình","儲存全部流程資料":"Lưu toàn bộ dữ liệu quy trình","全部流程資料已儲存":"Đã lưu toàn bộ dữ liệu quy trình","全部流程資料與照片已匯出":"Đã xuất toàn bộ dữ liệu quy trình và ảnh","全部流程資料與照片已匯入":"Đã nhập toàn bộ dữ liệu quy trình và ảnh","匯入會取代目前所有工段的流程資料與照片，確定繼續？":"Nhập sẽ thay thế dữ liệu quy trình và ảnh hiện tại của tất cả công đoạn. Bạn có chắc muốn tiếp tục?","此匯入檔版本較新，請先更新系統後再匯入。":"Tệp nhập này dùng phiên bản mới hơn; vui lòng cập nhật hệ thống trước khi nhập.","這不是有效的流程資料匯出檔。":"Đây không phải tệp xuất dữ liệu quy trình hợp lệ.","自訂流程 · 自動帶入方塊":"Quy trình riêng · Tự động đưa vào thẻ","標準流程 · 自動帶入方塊":"Quy trình chuẩn · Tự động đưa vào thẻ","流程名稱":"Tên quy trình","此帳號沒有匯入或匯出權限。":"Tài khoản này không có quyền nhập hoặc xuất.","請先填寫流程名稱":"Vui lòng nhập tên quy trình","自動帶入方塊":"Tự động đưa vào thẻ","此流程尚未設定照片":"Quy trình này chưa có ảnh","上傳或加入更多照片":"Tải lên hoặc thêm ảnh","照片會自動壓縮；建立方塊時一起帶入。":"Ảnh sẽ tự động được nén và đưa vào khi tạo thẻ.","儲存六種流程照片":"Lưu ảnh của sáu quy trình","六種流程資料已儲存":"Đã lưu dữ liệu sáu quy trình","自動帶入流程照片，可在方塊內更換":"Tự động đưa ảnh quy trình vào; có thể thay đổi trong thẻ","含預設照片":"Có ảnh mặc định","進站":"Vào trạm","出站":"Ra trạm","人工檢查":"Kiểm tra thủ công","機器設定":"Cài đặt máy","移除照片":"Xóa ảnh",
    "製程編輯台可用流程":"Quy trình dùng trong trình chỉnh sửa","這裡建立的流程會在主管核准後，提供製程編輯台新增方塊使用。六個標準流程會保留，也可在草稿中增加自己的流程。":"Quy trình tạo tại đây chỉ được dùng để thêm thẻ trong trình chỉnh sửa sau khi quản lý phê duyệt. Sáu quy trình chuẩn được giữ lại và có thể thêm quy trình riêng trong bản nháp.","流程資料 Excel 格式":"Định dạng Excel dữ liệu quy trình","包含全部工段、流程與照片；匯入只能在草稿進行，送審並由主管核准後才套用到製程編輯台。":"Bao gồm toàn bộ công đoạn, quy trình và ảnh; chỉ nhập vào bản nháp và chỉ áp dụng cho trình chỉnh sửa sau khi gửi và được quản lý phê duyệt.","先儲存草稿，再送主管審核；核准前不會影響製程編輯台。":"Lưu bản nháp trước rồi gửi quản lý duyệt; trước khi phê duyệt sẽ không ảnh hưởng đến trình chỉnh sửa.","唯讀查閱；製程編輯台目前使用已核准版本。":"Chỉ xem; trình chỉnh sửa hiện dùng phiên bản đã phê duyệt.","目前生效":"Đang có hiệu lực","流程資料草稿已儲存":"Đã lưu bản nháp dữ liệu quy trình","流程資料已送主管確認":"Đã gửi dữ liệu quy trình cho quản lý xác nhận","已解除送審，可繼續修改流程資料":"Đã rút hồ sơ; có thể tiếp tục sửa dữ liệu quy trình","請先建立新版本草稿再匯入 Excel":"Hãy tạo bản nháp phiên bản mới trước khi nhập Excel","這不是流程資料 Excel 匯出檔。":"Đây không phải tệp Excel xuất dữ liệu quy trình.","此 Excel 版本較新，請先更新系統後再匯入。":"Phiên bản Excel này mới hơn; hãy cập nhật hệ thống trước khi nhập.","Excel 缺少「流程資料」工作表。":"Excel thiếu trang tính “Dữ liệu quy trình”.","Excel 匯入會取代目前流程資料草稿內所有工段、流程與照片，確定繼續？":"Nhập Excel sẽ thay thế toàn bộ công đoạn, quy trình và ảnh trong bản nháp hiện tại. Tiếp tục?","全部流程資料與照片已匯出為 Excel":"Đã xuất toàn bộ dữ liệu quy trình và ảnh sang Excel","全部流程資料與照片已匯入草稿":"Đã nhập toàn bộ dữ liệu quy trình và ảnh vào bản nháp","流程資料已有草稿或正在主管審核中":"Dữ liệu quy trình đã có bản nháp hoặc đang chờ quản lý duyệt","已建立可修改的流程資料草稿":"Đã tạo bản nháp dữ liệu quy trình có thể chỉnh sửa","送審前需修正":"Cần sửa trước khi gửi duyệt","項流程資料問題":"vấn đề dữ liệu quy trình","流程資料":"Dữ liệu quy trình",
    "產品類別管理":"Quản lý nhóm sản phẩm","線別與工段管理":"Quản lý chuyền và công đoạn","新增產品類別名稱":"Tên nhóm sản phẩm mới","加入類別":"Thêm nhóm","新增工段":"Thêm công đoạn","主資料版本確認":"Duyệt phiên bản dữ liệu chính","建立主資料草稿":"Tạo bản nháp dữ liệu chính","送出主資料確認":"Gửi duyệt dữ liệu chính","確認主資料版本":"Duyệt phiên bản dữ liệu chính","儲存主資料草稿":"Lưu bản nháp dữ liệu chính","刪除警告":"Cảnh báo xóa","產品類別":"Nhóm sản phẩm","操作":"Thao tác",
    "通知":"Thông báo","開啟選單":"Mở menu","目前配置":"Cấu hình hiện tại","名稱":"Tên","人數":"Số người","方式":"Phương thức",
    "產品":"Sản phẩm","產品補充":"Bổ sung sản phẩm","操作步驟":"Các bước thao tác","流程連線":"Liên kết quy trình",
    "新增":"Thêm","移除":"Xóa","變更":"Thay đổi","未變更":"Không đổi","無":"Không có",
    "新流程":"Bước mới","確認核准":"Phê duyệt","版本建立":"Tạo phiên bản","新版本草稿建立":"Tạo bản nháp phiên bản mới",
    "版本草稿建立":"Tạo bản nháp phiên bản","草稿已儲存":"Đã lưu bản nháp","編輯者解除送審":"Người chỉnh sửa đã rút hồ sơ",
    "進入":"Mở","關閉":"Đóng","儲存":"Lưu","取消":"Hủy","刪除":"Xóa","查看":"Xem","返回":"Quay lại",
    "裁切備料":"Chuẩn bị cắt","成品組裝":"Lắp ráp thành phẩm","接頭壓合":"Ép đầu nối","包裝作業":"Đóng gói",
    "最終檢驗":"Kiểm tra cuối","人工組裝":"Lắp ráp thủ công","人工組裝（核准版）":"Lắp ráp thủ công (bản đã duyệt)",
    "成品組裝準備":"Chuẩn bị lắp ráp thành phẩm","成品組裝確認":"Kiểm tra lắp ráp thành phẩm","接頭壓合準備":"Chuẩn bị ép đầu nối","接頭壓合確認":"Kiểm tra ép đầu nối",
    "包裝作業準備":"Chuẩn bị đóng gói","包裝作業確認":"Kiểm tra đóng gói","最終檢驗準備":"Chuẩn bị kiểm tra cuối","最終檢驗確認":"Xác nhận kiểm tra cuối",
    "裁切":"Cắt","機器組裝":"Lắp ráp bằng máy","封口":"Đóng kín","人工作業":"Thao tác thủ công","機器作業":"Thao tác bằng máy",
    "上午":"SA","下午":"CH","第一班":"Ca 1","切換版本":"Chuyển phiên bản","來自":"Từ","分類":"Phân loại","類型":"Loại","類別":"Loại","對應":"Tương ứng",
    "筆組成資料":"bản ghi cấu thành","筆已連結 PDF 類別":"bản ghi đã liên kết loại PDF","條線":"chuyền","個入口":"chức năng","項操作":"thao tác","個版本":"phiên bản","個流程":"bước",
    "生產":"Sản xuất","管理":"Quản lý","中心":"Trung tâm","產線":"Chuyền","自動":"Tự động","帶出":"Điền tự động","適用":"Áp dụng","可複選":"Có thể chọn nhiều",
    "成品":"Thành phẩm","半成品":"Bán thành phẩm","配件":"Phụ kiện","組裝":"Lắp ráp","零件":"Linh kiện","加工":"Gia công",
    "即時":"Thời gian thực","路線":"Tuyến","連結":"Liên kết","快速":"Nhanh","發送":"Gửi","編輯":"Chỉnh sửa","匯入":"Nhập","開啟":"Mở",
    "電視畫面":"Màn hình TV","資料":"Dữ liệu","筆":"bản ghi","個產品類別":"loại sản phẩm","個工段":"công đoạn","個":"mục","步":"bước","準備":"Chuẩn bị","工段":"Công đoạn","人":"người","已":"Đã","會依":"Theo","條":"dòng","與":" và ","員":"viên",
    "全部":"tất cả","授權線":"chuyền được cấp quyền","比對":"so sánh","重新":"lại","舊版":"phiên bản cũ","修訂":"bản sửa đổi","影片":"video",
    "人操作":"người vận hành","已選":"Đã chọn","可選":"có thể chọn","組產品":"nhóm sản phẩm","未分配":"chưa phân bổ",
    "固定資產":"Tài sản cố định","機器編號":"Mã máy","設備建議":"Đề xuất thiết bị","定額／用量":"Định mức / số lượng",
    "單位":"Đơn vị","損耗":"Hao hụt","照片預覽":"Xem trước ảnh","支援 JPG、PNG、MP4":"Hỗ trợ JPG, PNG, MP4",
    "錯誤代碼":"Mã lỗi","錯誤名稱":"Tên lỗi","檢查項目":"Hạng mục kiểm tra","檢查編號":"Mã kiểm tra","FQC 檢查編號":"Mã kiểm tra FQC","FQC 檢查編號／名稱":"Mã / tên kiểm tra FQC",
    "檢查編號／項目":"Mã / hạng mục kiểm tra","檢查方式敘述":"Mô tả phương pháp kiểm tra","檢查方式圖片":"Ảnh phương pháp kiểm tra","檢查工具":"Dụng cụ kiểm tra",
    "變更理由":"Lý do thay đổi","變更理由（有實質差異時必填）":"Lý do thay đổi (bắt buộc khi có thay đổi thực tế)","變更理由（有變動時必填）":"Lý do thay đổi (bắt buộc khi có thay đổi)",
    "請輸入錯誤名稱":"Vui lòng nhập tên lỗi","請輸入檢查項目名稱":"Vui lòng nhập tên hạng mục kiểm tra",
    "有實質變動時必須填寫變更理由":"Vui lòng nhập lý do thay đổi khi có thay đổi thực tế","新增錯誤代碼時必須填寫理由":"Vui lòng nhập lý do khi tạo mã lỗi mới","儲存失敗":"Lưu thất bại",
    "包含產品":"Sản phẩm bao gồm","是否啟用":"Kích hoạt / Đang kích hoạt","月檢查":"Kiểm tra tháng","季檢查":"Kiểm tra quý","年檢查":"Kiểm tra năm",
    "加入月檢查列表":"Thêm vào danh sách kiểm tra tháng","加入季檢查列表":"Thêm vào danh sách kiểm tra quý","加入年檢查列表":"Thêm vào danh sách kiểm tra năm",
    "自訂檢查週期":"Chu kỳ kiểm tra tùy chỉnh","自訂週期內容":"Nội dung chu kỳ tùy chỉnh","檢查週期":"Chu kỳ kiểm tra","啟用與檢查週期":"Kích hoạt và chu kỳ kiểm tra",
    "產品適用矩陣":"Ma trận sản phẩm áp dụng","未涵蓋產品":"Sản phẩm chưa bao gồm","尚無啟用標準":"Chưa có tiêu chuẩn kích hoạt",
    "照片備註":"Ghi chú ảnh","圖片檢視":"Xem hình ảnh","設為首圖":"Đặt làm ảnh đại diện","移至首圖":"Đặt làm ảnh đại diện",
    "上移":"Di chuyển lên","下移":"Di chuyển xuống","刪除照片":"Xóa ảnh","新增錯誤代碼":"Thêm mã lỗi","修改錯誤代碼":"Sửa mã lỗi",
    "刪除錯誤代碼":"Xóa mã lỗi","新增檢查項目":"Thêm hạng mục kiểm tra","修改檢查項目":"Sửa hạng mục kiểm tra","刪除檢查項目":"Xóa hạng mục kiểm tra",
    "加入既有項目":"Thêm vào hạng mục hiện có","開始修改／刪除資料":"Bắt đầu sửa / xóa dữ liệu","匯出全部 Excel":"Xuất toàn bộ Excel",
    "選擇既有檢查項目":"Chọn hạng mục kiểm tra hiện có","加入既有檢查項目":"Thêm vào hạng mục kiểm tra hiện có","目前產品":"Sản phẩm hiện tại",
    "開啟並預勾產品":"Mở và chọn sẵn sản phẩm","儲存至草稿":"Lưu vào bản nháp","確認加入並儲存草稿":"Xác nhận thêm và lưu bản nháp",
    "全選":"Chọn tất cả","取消全選":"Bỏ chọn tất cả","已選取":"Đã chọn","項":"mục","啟用狀態":"Trạng thái kích hoạt",
    "請至少勾選一個檢查項目":"Vui lòng chọn ít nhất một hạng mục kiểm tra","此類別尚無任何檢查項目":"Nhóm sản phẩm này chưa có hạng mục kiểm tra nào",
    "月 · 季":"Tháng · Quý","月":"Tháng","季":"Quý","年":"Năm","自訂":"Tùy chỉnh",
    "此類別尚無錯誤代碼":"Nhóm này chưa có mã lỗi","此錯誤代碼尚無檢查項目":"Mã lỗi này chưa có hạng mục kiểm tra","此類別尚無產品主資料":"Nhóm này chưa có dữ liệu sản phẩm",
    "此類別產品均已有啟用標準":"Tất cả sản phẩm trong nhóm đã có tiêu chuẩn kích hoạt","尚無檢查項目":"Chưa có hạng mục kiểm tra",
    "版本紀錄與操作歷程":"Lịch sử phiên bản và thao tác","選擇版本／草稿":"Chọn phiên bản / bản nháp","送出主管審核":"Gửi quản lý duyệt",
    "關閉 (Esc)":"Đóng (Esc)","上一張 (←)":"Ảnh trước (←)","下一張 (→)":"Ảnh sau (→)","▲ 上移":"▲ Di chuyển lên","▼ 下移":"▼ Di chuyển xuống",
    "首圖":"Ảnh đại diện","無備註":"Không có ghi chú","尚未上傳檢查方式照片":"Chưa tải ảnh phương pháp kiểm tra",
    "檢查方式圖片（可多選，追加不覆蓋）":"Ảnh phương pháp kiểm tra (có thể chọn nhiều, thêm tiếp không ghi đè)",
    "FQC 檢查編號（自動）":"Mã kiểm tra FQC (tự động)","錯誤代碼（自動接續）":"Mã lỗi (tự động tiếp nối)",
    "加入檢查項目":"Thêm vào hạng mục kiểm tra","自訂週期內容（如：每半年、每週、每批次）":"Nội dung chu kỳ tùy chỉnh (vd: nửa năm một lần, hằng tuần, theo lô)",
    "請輸入自訂週期（必填）":"Vui lòng nhập chu kỳ tùy chỉnh (bắt buộc)","未選擇錯誤代碼":"Chưa chọn mã lỗi","· 檢查項目":"· Hạng mục kiểm tra",
    "尚無紀錄":"Chưa có lịch sử","全部線別":"Tất cả chuyền","＋ 新增錯誤代碼":"＋ Thêm mã lỗi","＋ 新增檢查項目":"＋ Thêm hạng mục kiểm tra",
    "前往版本確認平台":"Đến nền tảng duyệt phiên bản","編號或名稱":"Mã hoặc tên"
  }));

  const phrases = [
    ["每位使用者只要選擇一個角色，權限會統一依照該角色範本套用。","Mỗi người dùng chỉ chọn một vai trò; quyền sẽ được áp dụng thống nhất theo mẫu vai trò đó."],
    ["儲存後會完整套用這個角色的權限範圍","Sau khi lưu, toàn bộ phạm vi quyền của vai trò này sẽ được áp dụng"],
    ["權限範圍","Phạm vi quyền"],
    ["查看完整歷史、比對任意兩版，核准前自動檢查 BOM 與操作步驟。","Xem toàn bộ lịch sử, so sánh hai phiên bản bất kỳ và tự động kiểm tra BOM cùng các bước thao tác trước khi duyệt."],
    ["依帳號權限進入管理、確認、編輯或產線播放功能。","Truy cập chức năng quản lý, duyệt, chỉnh sửa hoặc hiển thị chuyền theo quyền tài khoản."],
    ["先決定左側能進入哪些功能，再分配版本確認平台與產品製程狀態裡面的操作權限。","Chọn chức năng được phép truy cập, sau đó phân quyền thao tác trong nền tảng duyệt phiên bản và trạng thái quy trình."],
    ["沒有勾選的功能不會顯示","Chức năng không được chọn sẽ bị ẩn"],
    ["限制編輯與查看的生產線","Giới hạn chuyền được xem và chỉnh sửa"],
    ["控制版本查看、送審與主管確認動作","Quản lý quyền xem, gửi duyệt và phê duyệt phiên bản"],
    ["控制可查看的線別及方塊內容","Quản lý chuyền và nội dung thẻ được phép xem"],
    ["監控平台與實際產線設備使用相同的已核准版本。","Màn hình giám sát và thiết bị trên chuyền sử dụng cùng phiên bản đã phê duyệt."],
    ["此監控與實際產線設備畫面相同，並且只顯示已核准版本。","Màn hình giám sát giống màn hình thiết bị thực tế và chỉ hiển thị phiên bản đã phê duyệt."],
    ["完成後會更新同一版本並重新送審，不會建立重複版本。","Sau khi hoàn tất, cùng phiên bản sẽ được cập nhật và gửi lại, không tạo bản trùng lặp."],
    ["可重複儲存；確認內容無誤後，再按","Có thể lưu nhiều lần; sau khi kiểm tra nội dung, hãy nhấn"],
    ["尚未送審，可反覆儲存","Chưa gửi duyệt, có thể lưu nhiều lần"],
    ["送審前需修正","Cần sửa trước khi gửi duyệt"],["點選下列項目可前往問題流程","Chọn mục bên dưới để đến bước có lỗi"],
    ["先前問題皆已修正，可以重新送審","Các lỗi trước đã được sửa; có thể gửi duyệt lại"],
    ["請查看送審按鈕旁的原因","Xem nguyên nhân bên cạnh nút gửi duyệt"],
    ["尚未選擇適用產品","chưa chọn sản phẩm áp dụng"],["缺少流程名稱","thiếu tên bước"],
    ["是機器流程，但尚未選擇設備","là bước dùng máy nhưng chưa chọn thiết bị"],
    ["缺少「需要達到的標準」","thiếu “Tiêu chuẩn cần đạt”"],
    ["尚未建立操作流程","chưa thiết lập hướng dẫn thao tác"],["此流程需補","Bước này cần bổ sung"],["項資料","mục dữ liệu"],
    ["先儲存草稿，再送主管審核","Lưu bản nháp trước, sau đó gửi quản lý duyệt"],
    ["此版本已送審，現在不能修改","Phiên bản đã gửi duyệt và hiện không thể sửa"],
    ["解除送審後，此項目會從確認平台移除，並立即解鎖同一版本。","Sau khi rút hồ sơ, mục này sẽ biến mất khỏi nền tảng duyệt và phiên bản được mở khóa ngay."],
    ["確認後不能直接修改；要變更內容請按","Sau khi duyệt không thể sửa trực tiếp; để thay đổi hãy chọn"],
    ["正在建立新版本草稿","Đang tạo bản nháp phiên bản mới"],
    ["先儲存草稿，檢查完成後再送出確認。","Lưu bản nháp trước, kiểm tra xong rồi gửi duyệt."],
    ["尚未建立版本","Chưa tạo phiên bản"],["完成編輯後先建立第一版草稿。","Sau khi chỉnh sửa, hãy tạo bản nháp đầu tiên."],
    ["草稿尚未完成伺服器儲存，內容保留在目前頁面。請勿關閉；確認連線後再次儲存。修訂衝突或登入失效需先處理。","Bản nháp chưa được lưu trên máy chủ; nội dung vẫn ở trang hiện tại. Đừng đóng trang. Kiểm tra kết nối rồi lưu lại. Cần xử lý xung đột phiên bản hoặc phiên đăng nhập hết hạn trước."],
    ["流程內容已保留在目前頁面，伺服器儲存尚未完成","Nội dung quy trình vẫn ở trang hiện tại, chưa được lưu trên máy chủ"],
    ["流程內容已儲存","Đã lưu nội dung quy trình"],
    ["草稿已儲存，可檢查後再送審","Bản nháp đã được lưu; hãy kiểm tra trước khi gửi duyệt"],
    ["復原此瀏覽器的舊草稿","Khôi phục bản nháp cũ của trình duyệt này"],
    ["頁面資料載入失敗","Không thể tải dữ liệu trang"],
    ["請保留未儲存內容並確認連線，再重新載入。","Hãy giữ nội dung chưa lưu, kiểm tra kết nối rồi tải lại."],
    ["重新載入","Tải lại"],
    ["將舊草稿復原到目前工作區？伺服器內容及舊暫存會保留，直到您儲存並核對完整。","Khôi phục bản nháp cũ vào vùng làm việc hiện tại? Nội dung máy chủ và bản lưu cũ được giữ lại cho đến khi bạn lưu và kiểm tra đầy đủ."],
    ["舊草稿已復原到目前工作區；請儲存並核對完整後再關閉。","Đã khôi phục bản nháp cũ vào vùng làm việc hiện tại. Hãy lưu và kiểm tra đầy đủ trước khi đóng trang."],
    ["儲存失敗，內容已保留在目前頁面","Lưu thất bại; nội dung vẫn ở trang hiện tại"],
    ["目前沒有待確認或已確認版本","Hiện không có phiên bản chờ duyệt hoặc đã duyệt"],
    ["人員解除送審後，項目會暫時從這裡移除；重新送審後會再次出現。","Sau khi nhân viên rút hồ sơ, mục sẽ tạm ẩn và xuất hiện lại khi gửi duyệt."],
    ["點選流程後，右側會顯示產品、BOM、機器、照片與標準。","Chọn một bước để xem sản phẩm, BOM, máy, ảnh và tiêu chuẩn ở bên phải."],
    ["點選流程 1、2、3、4，再設定產品、設備與作業標準。","Chọn bước 1, 2, 3, 4 rồi thiết lập sản phẩm, thiết bị và tiêu chuẩn thao tác."],
    ["選擇工段內的流程","Chọn bước trong công đoạn"],
    ["逐步鍵入操作方式、注意事項與品質重點","Nhập từng bước thao tác, lưu ý và điểm kiểm soát chất lượng"],
    ["第 1 步要做什麼","Bước 1 cần làm gì"],["完成後要符合什麼標準","Tiêu chuẩn cần đạt sau khi hoàn tất"],
    ["一張最大顯示，多張自動縮小排列","Một ảnh hiển thị lớn; nhiều ảnh tự động thu nhỏ và sắp xếp"],
    ["上傳一張或多張照片／影片","Tải lên một hoặc nhiều ảnh/video"],
    ["只在產品製程狀態選到此產品時顯示","Chỉ hiển thị khi chọn sản phẩm này trong trạng thái quy trình"],
    ["先從上方勾選產品，這裡會依產品分組顯示 BOM。","Chọn sản phẩm phía trên; BOM sẽ được hiển thị theo từng nhóm sản phẩm."],
    ["沒有可用的 BOM 零件，或已全部分配至其他流程。","Không còn linh kiện BOM khả dụng hoặc tất cả đã được phân bổ cho bước khác."],
    ["選擇機器後自動帶出設備資訊","Thông tin thiết bị tự động hiển thị sau khi chọn máy"],
    ["此產品沒有第一層 BOM 資料。","Sản phẩm này không có dữ liệu BOM cấp 1."],
    ["產品選定後才會載入 BOM，不占用主要畫面。","BOM chỉ tải sau khi chọn sản phẩm để tiết kiệm không gian."],
    ["確定刪除這條流程連線？","Bạn có chắc muốn xóa liên kết quy trình này?"],
    ["刪除後可以重新拖曳方塊建立連線。","Sau khi xóa, có thể kéo thẻ để tạo lại liên kết."],
    ["確定要刪除此流程方塊？","Bạn có chắc muốn xóa thẻ quy trình này?"],
    ["刪除後相關連線也會一起移除。","Các liên kết liên quan cũng sẽ bị xóa."],
    ["帳號或密碼錯誤","Tài khoản hoặc mật khẩu không đúng"],
    ["目前帳號沒有此功能權限","Tài khoản hiện tại không có quyền dùng chức năng này"],
    ["示範帳號：","Tài khoản dùng thử: "],["最新版 · BUILD","Bản mới nhất · BUILD"],
    ["已儲存","đã được lưu"],["尚待確認，不能重複送審","đang chờ duyệt, không thể gửi trùng"],
    ["已解除送審，可以繼續修改","đã rút hồ sơ và có thể tiếp tục sửa"],
    ["無法建立反向循環；請依製程方向重新連接","Không thể tạo vòng lặp ngược; hãy nối lại theo hướng quy trình"],
    ["流程線未連接","Chưa nối đường quy trình"],["的流程線指向已不存在的方塊"," có đường nối đến một thẻ không còn tồn tại"],
    ["所在的流程群組尚未與本工段主要流程連接"," thuộc nhóm bước chưa nối với quy trình chính của công đoạn"],
    ["尚未連接任何流程線"," chưa nối với đường quy trình nào"],
    ["目前沒有","Hiện không có"],["尚無","Chưa có"],["已送主管審核","Đã gửi quản lý duyệt"],
    ["正在編輯","Đang chỉnh sửa"],["正在查看","Đang xem"],["已鎖定","Đã khóa"],
    ["與上一版差異","Khác biệt so với bản trước"],["版本差異","Khác biệt phiên bản"],
    ["建立於","Tạo lúc"],["條流程","bước"],["項產品","sản phẩm"],["樣產品","sản phẩm"],["台設備","thiết bị"],
    [" 線"," chuyền"],[" 台"," máy"],[" 步驟"," bước"],[" 項問題"," lỗi"],
    ["確認","Duyệt"],["送審","Gửi duyệt"],["版本","Phiên bản"],["草稿","Bản nháp"],["流程","Quy trình"],
    ["產品","Sản phẩm"],["設備","Thiết bị"],["機器","Máy"],["照片","Ảnh"],["操作","Thao tác"],["標準","Tiêu chuẩn"],
    ["選擇","Chọn"],["建立","Tạo"],["修改","Chỉnh sửa"],["權限","Quyền"],["狀態","Trạng thái"],
    ["顯示","Hiển thị"],["查看","Xem"],["儲存","Lưu"],["刪除","Xóa"],["新增","Thêm"],["輸入","Nhập"],
    ["已使用","Đã dùng"],["未使用","Chưa dùng"],["未送審","Chưa gửi"],["已送審","Đã gửi"],["待確認","Chờ duyệt"]
  ].sort((a,b) => b[0].length - a[0].length);

  const playerStageLabels = new Map([
    ["A-CUT","裁切備料","Chuẩn bị cắt"],
    ["A-ASSY","成品組裝","Lắp ráp thành phẩm"],
    ["A-CRIMP","接頭壓合","Ép đầu nối"],
    ["A-PACKING","包裝作業","Đóng gói"],
    ["A-FINAL","最終檢驗","Kiểm tra cuối"],
    ["B-ASSY","配件組裝","Lắp ráp phụ kiện"],
    ["B-PACKING","包裝作業","Đóng gói"],
    ["B-FINAL","最終檢驗","Kiểm tra cuối"],
    ["B-PHAO","浮球組裝","Lắp ráp phao"],
    ["B-HCT","HCT 作業","Thao tác HCT"],
    ["C-PREP","原料準備","Chuẩn bị nguyên liệu"],
    ["C-TIEN","車削加工","Gia công tiện"],
    ["C-RUA","清洗作業","Rửa"],
    ["C-GIACONG","二次加工","Gia công thứ cấp"],
    ["C-FINAL","最終檢驗","Kiểm tra cuối"],
    ["C-CHI","編線作業","Quấn chỉ"],
    ["C-INOX","不鏽鋼加工","Gia công INOX"],
    ["C-PVC","PVC 成型","Tạo hình PVC"],
    ["C-KHOAN","鑽孔作業","Khoan"],
    ["C-MAI","研磨作業","Mài"],
    ["C-DANHBONG","拋光作業","Đánh bóng"],
  ].flatMap(([code,name,vi]) => [[code+' · '+name,code+' · '+vi],[code[0]+' 線 · '+name,'Chuyền '+code[0]+' · '+vi]]));

  const translationRules = [...phrases, ...exact.entries()].sort((a,b) => b[0].length - a[0].length);
  let language = localStorage.getItem(STORAGE_KEY) === "zh" ? "zh" : "vi";
  let applying = false;

  const textMemory = new WeakMap();
  const attrMemory = new WeakMap();

  function translate(source) {
    const issueText=String(source).trim();
    let match;
    if((match=String(source).match(/^(\s*)(\d+)\/(\d+) 項產品包含此工段(\s*)$/)))return match[1]+match[2]+'/'+match[3]+' sản phẩm có công đoạn này'+match[4];
    if((match=issueText.match(/^(缺少適用流程|BOM 未分配)：(\d+)$/)))return (match[1]==='缺少適用流程'?'Thiếu quy trình áp dụng':'BOM chưa phân bổ')+': '+match[2];
    if((match=issueText.match(/^(前往建立連線|前往補寫作業說明|前往填寫基本資料|前往分配 BOM|前往建立流程)(?: · (.+))?$/))){const labels={'前往建立連線':'Đi đến tạo liên kết','前往補寫作業說明':'Đi đến bổ sung hướng dẫn','前往填寫基本資料':'Đi đến điền thông tin cơ bản','前往分配 BOM':'Đi đến phân bổ BOM','前往建立流程':'Đi đến tạo quy trình'};return labels[match[1]]+(match[2]?' · '+match[2]:'');}
    if(issueText.startsWith('前往修正 · '))return issueText.replace('前往修正','Đi đến sửa');
    if((match=issueText.match(/^送審前有 (\d+) 項問題 · 查看問題$/)))return 'Có '+match[1]+' vấn đề trước khi gửi duyệt · Xem vấn đề';
    if((match=issueText.match(/^(.+) · 缺 (\d+) 個料號$/)))return match[1]+' · thiếu '+match[2]+' mã vật tư';
    if((match=issueText.match(/^(\d+) 已選／(\d+) 個料號$/)))return match[1]+' đã chọn / '+match[2]+' mã vật tư';
    if((match=issueText.match(/^此產品需要經過 (.+) 等工段，但該工段目前沒有任何流程方塊套用此產品。$/)))return 'Sản phẩm cần qua '+match[1]+', nhưng chưa có bước nào áp dụng cho sản phẩm ở các công đoạn này.';
    if((match=issueText.match(/^此產品所使用的流程尚未完成 BOM 選擇，還有 (\d+) (?:項|個根層料號)未分配。$/)))return 'Quy trình của sản phẩm chưa chọn đủ BOM, còn '+match[1]+' mục chưa phân bổ.';
    if((match=issueText.match(/^此產品在所有適用流程方塊中，還有 (\d+) 個根層 BOM 料號未被勾選。$/)))return 'Trong tất cả thẻ quy trình áp dụng cho sản phẩm này, còn '+match[1]+' mã BOM cấp gốc chưa được chọn.';
    if((match=issueText.match(/^此料號已由 (.+) 使用；請先到原方塊取消勾選。$/)))return 'Mã này đang được dùng tại '+match[1]+'; hãy bỏ chọn tại thẻ ban đầu trước.';
    if((match=issueText.match(/^(.+) 專用照片與影片$/)))return 'Ảnh và video riêng của '+match[1];
    if((match=issueText.match(/^(.+) 專用照片$/)))return 'Ảnh riêng của '+match[1];
    if((match=issueText.match(/^產品補充 (\d+)$/)))return 'Bổ sung sản phẩm '+match[1];
    if((match=issueText.match(/^產品照片 (\d+)$/)))return 'Ảnh sản phẩm '+match[1];
    if(issueText==='已用暫時方塊標出缺少位置；請從上方選擇流程建立。暫時方塊不會寫入正式資料')return 'Đã dùng thẻ tạm để đánh dấu vị trí còn thiếu; hãy chọn quy trình ở phía trên để tạo. Thẻ tạm không được ghi vào dữ liệu chính thức.';
    if((match=issueText.match(/^版本紀錄與操作歷程 · (\d+) 筆操作$/)))return 'Lịch sử phiên bản và thao tác · '+match[1]+' thao tác';
    if((match=issueText.match(/^(\d+) 個錯誤代碼$/)))return match[1]+' mã lỗi';
    if((match=issueText.match(/^(\d+) 個檢查項目$/)))return match[1]+' hạng mục kiểm tra';
    if((match=issueText.match(/^(\d+) 個類別產品$/)))return match[1]+' sản phẩm trong nhóm';
    if((match=issueText.match(/^(\d+) 個未涵蓋$/)))return match[1]+' chưa bao gồm';
    if((match=issueText.match(/^(\d+) 個產品$/)))return match[1]+' sản phẩm';
    if((match=issueText.match(/^產品適用矩陣 · (\d+) 個產品尚無啟用標準$/)))return 'Ma trận sản phẩm áp dụng · '+match[1]+' sản phẩm chưa có tiêu chuẩn kích hoạt';
    if((match=issueText.match(/^未涵蓋產品 · (\d+)$/)))return 'Sản phẩm chưa bao gồm · '+match[1];
    if((match=issueText.match(/^(新增|修改)檢查項目 · (.+)$/)))return (match[1]==='新增'?'Thêm':'Sửa')+' hạng mục kiểm tra · '+match[2];
    if((match=issueText.match(/^(新增|修改)錯誤代碼 · (.+)$/)))return (match[1]==='新增'?'Thêm':'Sửa')+' mã lỗi · '+match[2];
    if((match=issueText.match(/^圖片檢視 · (.+)$/)))return 'Xem hình ảnh · '+match[1];
    if((match=issueText.match(/^修改者：(.+) · (.+)$/)))return 'Người sửa: '+match[1]+' · '+match[2];
    if((match=issueText.match(/^目前生效：(.+)$/)))return 'Đang có hiệu lực: '+match[1];
    if((match=issueText.match(/^版本 (.+) · 修改帳號 (.+) · 儲存時間由伺服器完成後記錄$/)))return 'Phiên bản '+match[1]+' · Tài khoản sửa '+match[2]+' · Thời gian lưu do máy chủ ghi nhận';

    if (!source || !/[\u3400-\u9fff]/.test(source)) return source;
    const leading = source.match(/^\s*/)?.[0] || "";
    const trailing = source.match(/\s*$/)?.[0] || "";
    const core = source.slice(leading.length, source.length - trailing.length || undefined);
    if (playerStageLabels.has(core)) return leading + playerStageLabels.get(core) + trailing;
    if (exact.has(core)) return leading + exact.get(core) + trailing;
    let result = core;
    translationRules.forEach(([from,to]) => { result = result.split(from).join(to); });
    return leading + result + trailing;
  }

  function skipped(node) {
    const parent = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return !parent || parent.closest("script,style,[data-i18n-skip]") || parent.matches("code") && !/[\u3400-\u9fff]/.test(parent.textContent || "");
  }

  function applyText(node) {
    if (skipped(node) || node.nodeType !== Node.TEXT_NODE || node.parentElement?.closest('textarea,[contenteditable="true"]')) return;
    const current = node.nodeValue;
    let memory = textMemory.get(node);
    if (language === "vi") {
      if (!memory || current !== memory.translated) memory = { source: current, translated: translate(current) };
      textMemory.set(node, memory);
      if (current !== memory.translated) node.nodeValue = memory.translated;
    } else if (memory && current === memory.translated) {
      node.nodeValue = memory.source;
    }
  }

  function applyAttributes(element) {
    if (skipped(element)) return;
    const attrs = ["placeholder","title","aria-label","alt"];
    const memory = attrMemory.get(element) || {};
    attrs.forEach(attr => {
      if (!element.hasAttribute?.(attr)) return;
      const current = element.getAttribute(attr);
      const previous = memory[attr];
      if (language === "vi") {
        const source = !previous || current !== previous.translated ? current : previous.source;
        const translated = translate(source);
        memory[attr] = { source, translated };
        if (current !== translated) element.setAttribute(attr, translated);
      } else if (previous && current === previous.translated) {
        element.setAttribute(attr, previous.source);
      }
    });
    attrMemory.set(element, memory);
    // Form values are business data, not interface labels. Translation must not
    // rewrite a name/instruction merely because a dialog opened or language changed.
  }

  function walk(root = document.body) {
    if (!root) return;
    applying = true;
    if (root.nodeType === Node.TEXT_NODE) applyText(root);
    else {
      applyAttributes(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {acceptNode:node=>node.nodeType===Node.ELEMENT_NODE&&node.matches('script,style,[data-i18n-skip],textarea,[contenteditable="true"]')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
      let node;
      while ((node = walker.nextNode())) if (node.nodeType === Node.TEXT_NODE) { applyText(node); } else { applyAttributes(node); }
    }
    const nextLanguage = language === "vi" ? "vi" : "zh-Hant";
    if (document.documentElement.lang !== nextLanguage) document.documentElement.lang = nextLanguage;
    document.body.classList.toggle("lang-vi", language === "vi");
    const nextTitle = language === "vi" ? "Hệ thống hiển thị tiêu chuẩn quy trình" : "製程標準播放系統";
    if (document.title !== nextTitle) document.title = nextTitle;
    updateSwitches();
    observer?.takeRecords();
    applying = false;
  }

  function makeSwitch(location) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `language-switch ${location}`;
    button.dataset.i18nSkip = "true";
    button.innerHTML = `<span aria-hidden="true">中↔Vi</span><b></b>`;
    button.onclick = () => {
      language = language === "vi" ? "zh" : "vi";
      localStorage.setItem(STORAGE_KEY, language);
      walk(document.body);
      window.dispatchEvent(new CustomEvent("process-language-change", { detail: { language } }));
    };
    return button;
  }

  function updateSwitches() {
    let top = document.querySelector(".top-actions .language-switch");
    if (!top && document.querySelector(".top-actions")) {
      top = makeSwitch("top-language-switch");
      document.querySelector(".top-actions").insertBefore(top, document.querySelector(".account-wrap"));
    }
    let login = document.querySelector("#login-root .language-switch");
    if (!login && document.querySelector("#login-root .login-screen")) {
      login = makeSwitch("login-language-switch");
      document.querySelector("#login-root .login-screen").append(login);
    }
    const nextLabel = language === "vi" ? "繁體中文" : "Tiếng Việt";
    document.querySelectorAll(".language-switch b").forEach(label => { if (label.textContent !== nextLabel) label.textContent = nextLabel; });
    const nextHint = language === "vi" ? "繁體中文" : "Tiếng Việt";
    document.querySelectorAll(".language-switch").forEach(button => { if (button.title !== nextHint) button.title = nextHint; button.setAttribute('aria-label', nextHint); });
  }

  const originalConfirm = window.confirm.bind(window);
  window.confirm = message => originalConfirm(language === "vi" ? translate(String(message)) : message);
  const originalAlert = window.alert.bind(window);
  window.alert = message => originalAlert(language === "vi" ? translate(String(message)) : message);

  const observer = new MutationObserver(mutations => {
    if (applying) return;
    const roots=new Set();
    for(const mutation of mutations){for(const node of mutation.addedNodes)if(node.isConnected&&!skipped(node))roots.add(node);if(mutation.type==='characterData'&&mutation.target.isConnected&&!skipped(mutation.target))roots.add(mutation.target);}
    for(const node of roots){let parent=node.parentNode,covered=false;while(parent){if(roots.has(parent)){covered=true;break;}parent=parent.parentNode;}if(!covered)walk(node);}
    updateSwitches();
  });
  observer.observe(document.documentElement, {subtree:true, childList:true, characterData:true});
  walk(document.body);
})();
