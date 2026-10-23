// Display only; never an authorization, storage or activation decision.
export function importPreflightMessage(boundedAttempt){
 return boundedAttempt
  ?'本機預檢與固定嘗試預算已通過；平台剩餘容量仍未知，尚未上傳。 / Đã kiểm tra trước dữ liệu cục bộ và ngân sách thử cố định; dung lượng còn lại chưa rõ, chưa tải lên.'
  :'本機預檢與容量證據已核對，尚未上傳。 / Đã kiểm tra trước dữ liệu cục bộ và bằng chứng dung lượng; chưa tải lên.';
}
export function importRestoreMessage(result){
 if(result.businessTrafficEnabled===true)return '資料已開放使用；請重新登入，原密碼維持不變。 / Dữ liệu đã được mở để sử dụng; vui lòng đăng nhập lại bằng mật khẩu hiện tại.';
 if(result.dataReady===true)return '資料已核對並還原，但仍未開放使用。 / Dữ liệu đã được kiểm tra và khôi phục nhưng chưa được mở để sử dụng.';
 return '匯入尚未完成，尚未開放使用。 / Chưa nhập xong dữ liệu; chưa được mở để sử dụng.';
}
