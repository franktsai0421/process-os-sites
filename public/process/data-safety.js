window.confirmMasterDeletion=function(message){
  if(!window.confirm('第一次確認：刪除影響範圍\n\n'+message+'\n\n核准後會影響總覽、BOM、製程編輯台、產品製程狀態、發送介面與產線播放。歷史版本仍保留。'))return false;
  return window.confirm('第二次確認：確定刪除？\n\n請確認已閱讀上一步的影響範圍。按取消可保留資料。');
};
