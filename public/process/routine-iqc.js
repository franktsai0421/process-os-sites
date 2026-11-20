/* Routine IQC uses the authenticated workspace and separate review documents. */
(() => {
  const endpoint = '/api/routine-iqc', key = 'routine-iqc-receipt:';
  const t = (zh, vi) => document.documentElement.lang === 'vi' ? vi : zh;
  const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const startToken = 'START IQC';
  const labels = {
    sources:['檢查項目','Hạng mục kiểm tra'],plan:['檢查計畫','Kế hoạch kiểm tra'],report:['檢查報告','Báo cáo kiểm tra'],
    fail:['不合格','Không đạt'],abnormal:['異常處理','Xử lý bất thường'],pass:['合格','Đạt'],closed:['已結案','Đã đóng'],
    disposed:['處置核准 · 已結案','Đã duyệt xử lý · Đã đóng'],retest:['復測中','Đang thử lại'],
    'retest-plan':['復測申請','Đề nghị thử lại'],'retest-report':['復測報告','Báo cáo thử lại'],
    disposal:['申請處置','Đề nghị xử lý'],waiver:['免測／跳過申請','Đề nghị miễn kiểm tra / bỏ qua'],history:['流程歷史','Lịch sử quy trình'],
    draft:['草稿','Bản nháp'],pending:['待審核','Chờ duyệt'],approved:['已核准','Đã duyệt'],cancelled:['已捨棄','Đã bỏ'],
    returned:['已發回','Đã trả lại'],withdrawn:['已撤回','Đã rút'],open:['待改善','Chờ cải thiện'],
    weekly:['每週','Hàng tuần'],monthly:['每月','Hàng tháng'],quarterly:['每季','Hàng quý'],
    semiannual:['每半年','Nửa năm'],yearly:['每年','Hàng năm'],
  }, label = v => labels[v] ? t(...labels[v]) : v;
  const errors = {
    IQC_WRITE_RESULT_NOT_RECOGNIZED:['無法辨認寫入結果，請查原操作回執。','Không nhận dạng được kết quả ghi; hãy tra biên nhận thao tác gốc.'],
    IQC_WORK_NOT_AVAILABLE:['有勾選項目已更新或不能安排。請重新整理檢查項目。','Một số hạng mục đã thay đổi hoặc không còn lập được. Hãy tải lại danh sách.'],
    IQC_APPROVED_PLAN_REQUIRED:['檢查計畫核准後才能填報告。','Chỉ nhập báo cáo sau khi duyệt kế hoạch.'],
    IQC_DOCUMENT_FIXED:['這份文件已核准，內容已鎖定。','Hồ sơ đã duyệt và nội dung đã khóa.'],
    IQC_CASE_NOT_AVAILABLE:['這批的後續作業已更新，請查看目前狀態。','Công việc của lô này đã thay đổi. Hãy xem trạng thái hiện tại.'],
    IQC_LOTS_INVALID:['測試數量必須為正整數，單位 pcs。','Số lượng thử phải là số nguyên dương, đơn vị pcs.'],
    IQC_BATCH_FIELDS_REQUIRED:['每個零件至少要有一個 ERP 批號及正整數測試數量。','Mỗi linh kiện cần ít nhất một mã lô ERP và số lượng thử nguyên dương.'],
    IQC_DUPLICATE_LOT:['同一零件的 ERP 批號重複。','Mã lô ERP bị trùng trong cùng linh kiện.'],
    IQC_ALL_BATCHES_REQUIRED:['全部批次的檢查結果填妥後才可送審。','Điền kết quả kiểm tra cho tất cả lô trước khi gửi duyệt.'],
    IQC_VALUE_REQUIRED:['請填寫合格的實測值。','Điền kết quả thực thử cho mục đạt.'],
    IQC_EXPLANATION_REQUIRED:['請填寫不合格或異常說明。','Mô tả hạng mục không đạt hoặc bất thường.'],
    IQC_DEFECT_PHOTO_REQUIRED:['不合格須上傳照片。','Tải ảnh cho hạng mục không đạt.'],
    IQC_OVERDUE_REASON_REQUIRED:['報告逾期須填原因。','Điền lý do gửi báo cáo quá hạn.'],
    EXPIRED_PLAN_READ_ONLY:['已逾期的檢查計畫只能查看原紀錄。','Kế hoạch quá hạn chỉ được xem hồ sơ gốc.'],
    IQC_REASON_REQUIRED:['請填寫原因。','Điền lý do.'],
    IQC_DISPOSITION_REQUIRED:['請填寫處置內容。','Điền nội dung xử lý.'],
    IQC_PLAN_DATES_REQUIRED:['檢查期間不完整。','Điền thời hạn kiểm tra hợp lệ.'],
    REVISION_CONFLICT:['資料已更新。請重新整理後核對，輸入仍保留。','Dữ liệu đã thay đổi. Hãy tải lại để đối chiếu. Dữ liệu nhập được giữ.'],
    FORBIDDEN:['沒有此操作權限。','Không có quyền thực hiện.'],
    PHOTO_NOT_UPLOADED:['照片尚未保存。','Ảnh chưa được lưu.'],
    START_DATE_LOCKED:['已有計畫、報告或處理紀錄，不能重算開始日期。','Đã có kế hoạch, báo cáo hoặc hồ sơ xử lý, không thể tính lại ngày bắt đầu.'],
    IQC_TITLE_REQUIRED:['請填寫文件名稱。','Điền tên hồ sơ.'],
    IQC_DATE_REQUIRED:['請選擇有效的開始日期。','Chọn ngày bắt đầu hợp lệ.'],
    IQC_START_CONFIRMATION_REQUIRED:['請核對範圍、勾選確認，並輸入 START IQC。','Kiểm tra phạm vi, đánh dấu xác nhận và nhập START IQC.'],
    IQC_START_REASON_REQUIRED:['請填寫啟動原因，最多 2,000 字。','Điền lý do khởi động, tối đa 2.000 ký tự.'],
  }, errorText = value => errors[value] ? t(...errors[value]) : value;
  let view = null, workspace = null, approvalBadge = null;
  const button = (action, text, disabled = false, primary = false) =>
    `<button type="button" class="rf-btn ${primary?'primary':''}" data-ri-action="${h(action)}" ${disabled?'disabled':''}>${h(text)}</button>`;
  const owner = () => {
    const sync=window.ProcessSync;
    return {actor:sync?.identity?.id,epoch:sync?.identityGeneration?.(),delivery:sync?.captureDelivery?.()};
  };
  const sameOwner = pin => {
    const sync=window.ProcessSync;
    return !sync?.requiresReload&&pin.actor===sync?.identity?.id&&pin.epoch===sync?.identityGeneration?.()&&
      (!pin.delivery||sync.isCurrentDelivery?.(pin.delivery)===true);
  };
  const current = v => view===v&&v.root.isConnected&&sameOwner(v.owner);
  const route = (iqc,review) => {
    const u = new URL(location.href);
    for(const k of ['rfTab','rfDocument','rfCase','dataTab','riDocument'])u.searchParams.delete(k);
    u.searchParams.set('view',review?'approval':'quality-inspections');
    u.searchParams.set('system','quality');
    if(review)u.searchParams.set('approvalTab','routine');else u.searchParams.delete('approvalTab');
    if(iqc)u.searchParams.set('rfModule','iqc');else u.searchParams.delete('rfModule');
    return u;
  };
  const selected = () => {
    const q=new URL(location.href).searchParams;
    return q.get('rfModule')==='iqc'&&(q.get('view')==='quality-inspections'||
      q.get('view')==='approval'&&q.get('approvalTab')==='routine');
  };
  const edited = v => v.draft && JSON.stringify(v.draft)!==JSON.stringify(v.base);
  const docOf = v => v.data?.documents.find(doc=>doc.id===v.doc);
  const content = doc => doc.flow.pendingId ? doc.flow.cases.find(review=>review.id===doc.flow.pendingId).content :
    doc.flow.active.id ? doc.flow.active.content : doc.flow.working;
  const batchKey = batch => JSON.stringify([batch.partId,batch.batchNo]);
  const batches = rows => {
    const groups=new Map();
    for(const row of rows){const id=batchKey(row.batch);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);}
    return [...groups.values()];
  };
  const batchLabel = batch => `<strong>ERP ${h(batch.batchNo)}</strong> · ${h(batch.quantity)} pcs`;
  const photo = id => `<a class="rf-photo" href="${endpoint}/photo?id=${h(id)}" target="_blank" rel="noopener"><img loading="lazy" src="${endpoint}/photo?id=${h(id)}" alt="${t('檢查照片','Ảnh kiểm tra')}"></a>`;
  const permissions = v => v.data.permissions;
  const tag = name => `<span class="rf-tag ${h(name)}">${h(label(name))}</span>`;
  const input = (name,title,value,edit,type='text') => `<label>${h(title)}${type==='textarea'?
    `<textarea data-ri-field="${name}" ${edit?'':'readonly'}>${h(value)}</textarea>`:
    `<input data-ri-field="${name}" type="${type}" value="${h(value)}" ${edit?'':'readonly'}>`}</label>`;

  async function call(v, url=endpoint, options={}) {
    const res=await fetch(url,{cache:'no-store',...options});
    const data=await res.json();
    if(!current(v))throw Error('DELIVERY_SUPERSEDED');
    if(!res.ok)throw Object.assign(Error(data.error||'IQC_UNAVAILABLE'),{status:res.status,details:data.details});
    return data;
  }
  async function load(v) {
    const next=await call(v);
    if(window.ProcessSync?.identity?.id && next.identity.id!==window.ProcessSync.identity.id)throw Error('ACCOUNT_CHANGED');
    v.data=next;
    approvalBadge?.recordIqc(v.owner,next.revision,next.documents.filter(doc=>doc.status==='pending').length);
    v.reloadNeeded=false;
    v.pending=sessionStorage.getItem(key+next.identity.id);
    const kept=new Set([...v.checked].filter(id=>available(next.jobs.find(job=>job.id===id),v)));
    v.removedPicks+=v.checked.size-kept.size;
    v.checked=kept;
    render(v);
  }
  const holdsPlan=(job,v)=>job.planId&&
    !v.data.documents.some(doc=>doc.id===job.planId&&doc.kind==='waiver'&&doc.status==='draft');
  const available=(job,v)=>job&&job.start<=v.data.today&&job.end>=v.data.today&&!holdsPlan(job,v)&&
    !job.completion&&!job.calendar?.stopped&&!job.calendar?.requestId&&!job.calendar?.retestCaseId;
  const canExempt=(job,v)=>available(job,v)&&!v.data.cases.some(item=>openCase(item)&&item.jobIds.includes(job.id));
  const exemptLabel=()=>t('申請當期免測','Xin miễn kiểm tra kỳ này');
  function rememberIqcList(v, control) {
    const list=control?.closest?.('[data-ri-period],.rf-calendar-document-list,.rf-calendar-toolbar,.rf-review-history');
    if(!list)return;
    const key=list.dataset.riPeriod,action=control.dataset.riAction,tag=control.tagName;
    const inHistory=!!key&&!!control.closest('.rf-period-history');
    if(inHistory)v.openHistories.add(key);
    const findControl=scope=>[...(scope?.querySelectorAll('[data-ri-action]')||[])].find(el=>
      el.dataset.riAction===action&&el.tagName===tag&&!el.disabled);
    const keepAnchor=window.RoutineFQCUI.keepListAnchor;
    // The original-report shortcut and the history button can open the same document.
    // Restore the period's position independently of which control receives focus.
    const restore=key?keepAnchor?.(list,
      ()=>[...v.root.querySelectorAll('[data-ri-period]')].find(el=>el.dataset.riPeriod===key),
      row=>{
        const history=row.querySelector('.rf-period-history');
        const target=findControl(inHistory?history:row);
        return target||(inHistory?history?.querySelector('summary'):
          row.querySelector('[data-ri-pick]:not([disabled])')||history?.querySelector('summary'));
      }):keepAnchor?.(control,()=>findControl(v.root));
    if(restore)v.listReturn={tab:v.tab,workState:v.workState,restore};
  }
  function leaveIqcDetail(v) {
    if(edited(v)&&!window.confirm(t('捨棄這份尚未儲存的修改？','Bỏ thay đổi chưa lưu?')))return false;
    v.doc=v.target=null;v.readOnly=false;v.draft=v.base=null;v.error='';
    return true;
  }
  function show(v,id,readOnly=false,control) {
    if(!leaveIqcDetail(v))return;
    if(id)rememberIqcList(v,control);
    v.doc=id;v.readOnly=readOnly;render(v);
    if(id)window.RoutineFQCUI.revealRoutineDetail?.(v.root);
  }
  function acceptResult(v,result) {
    if(result.documentId){v.doc=result.documentId;v.target=null;v.readOnly=false;}
  }
  async function write(v,action,fields={},draftAction=null) {
    const id=crypto.randomUUID(), doc=docOf(v), actor=v.data.identity.id;
    if(v.pending)throw Error(t('請先查上一筆操作結果。','Kiểm tra biên nhận trước.'));
    const draft=draftAction ? {action:draftAction,operationId:id,clientId:v.client,sequence:++v.sequence,
      generation:doc.flow.generation,expectedRevision:doc.flow.revision,...(draftAction==='submit'?{savedId:doc.flow.saved.id}:
        ['approve','withdraw','return'].includes(draftAction)?{caseId:doc.flow.pendingId}:{}),...fields.draft} : null;
    const payload={...fields,action,operationId:id,expectedRevision:v.data.revision,...(draft?{draft,documentId:doc.id}:{})};
    sessionStorage.setItem(key+actor,id);v.pending=id;v.busy=true;
    try{
      const result=await call(v,endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      confirmWrite(v,result.result);
      if(action==='create-plan'||action==='create-waiver'){
        v.tab=action==='create-plan'?'plan':'sources';v.workState='';v.checked.clear();v.showHidden=false;v.removedPicks=0;
      }
      if(action==='create-report'){v.tab='report';v.workState='';}
      v.draft=v.base=null;
      await load(v);
    }catch(error){
      if(!v.reloadNeeded&&error.status>=400&&error.status<500){sessionStorage.removeItem(key+actor);v.pending=null;}
      throw error;
    }finally{v.busy=false;if(current(v))render(v);}
  }
  function confirmWrite(v,result) {
    if(!result||typeof result!=='object'||Array.isArray(result))throw Error('IQC_WRITE_RESULT_NOT_RECOGNIZED');
    sessionStorage.removeItem(key+v.data.identity.id);
    v.pending=null;
    v.reloadNeeded=true;
    acceptResult(v,result);
  }
  const canArrange=v=>permissions(v).create&&permissions(v).edit&&!v.pending;
  const emptyList=(title,detail,action='')=>`<section class="rf-empty ri-empty"><h3>${h(title)}</h3><p>${h(detail)}</p>${action}</section>`;
  const jobsFor = (v,job) => v.data.documents.filter(doc=>!doc.cancelledAt&&doc.jobs.some(line=>line.id===job.id));
  const docButton = (doc, text = doc?.number) => doc?button('doc:'+doc.id,text):'';
  const reportKind = doc => doc.kind==='report'||doc.kind==='retest-report';
  const activeDoc = doc => !doc.cancelledAt&&['draft','pending'].includes(doc.status);
  const openCase = item => !['closed','disposed'].includes(item.status);
  const caseDocuments = (v,item) => v.data.documents.filter(doc=>doc.caseId===item.id&&!doc.cancelledAt);
  const docState = doc => {
    if(doc.cancelledAt)return label('cancelled');
    const last=doc.flow.cases.at(-1)?.status;
    return doc.status==='draft'&&['returned','withdrawn'].includes(last)?label(last)+' · '+label('draft'):label(doc.status);
  };
  const docStatusTag = doc => `<span class="rf-tag ${h(doc.cancelledAt?'cancelled':doc.status)}">${h(docState(doc))}</span>`;
  const initialReport = (v,job) => jobsFor(v,job).find(doc=>doc.kind==='report'&&doc.status==='approved');
  const caseForRow = (v,original,row) => row.outcome!=='pass'&&v.data.cases.find(item=>
    item.originReportId===original.id&&batchKey(item.batch)===batchKey(row.batch));
  const approvedAttempts = (v,item,row) => [row,...item.reports.map(id=>v.data.documents.find(doc=>
    doc.id===id&&doc.kind==='retest-report'&&doc.status==='approved')).filter(Boolean)
    .flatMap(doc=>content(doc).inspections.filter(attempt=>attempt.jobId===row.jobId&&batchKey(attempt.batch)===batchKey(row.batch)))];
  function periodResults(v,job,report) {
    return report?content(report).inspections.filter(row=>row.jobId===job.id).map(row=>{
      const item=caseForRow(v,report,row),attempts=item?approvedAttempts(v,item,row):[row];
      return {row,item,attempts,passed:attempts.at(-1).outcome==='pass'};
    }):[];
  }
  function caseStage(v,item) {
    const active=caseDocuments(v,item).find(activeDoc);
    return active?label(active.kind)+' · '+docState(active):label(item.status);
  }
  function inspectionResults(v,results) {
    return results.map(({row,item,attempts,passed})=>{
      if(!item)return `<p>${batchLabel(row.batch)} · ${h(label(row.outcome))} · ${label('closed')}</p>`;
      const outcome=attempts.map((attempt,index)=>(attempts.length>1?t('第 '+(index+1)+' 次：','Lần '+(index+1)+': '):'')+label(attempt.outcome)).join(' · ');
      const closure=passed?(attempts.some(attempt=>attempt.outcome==='fail')?t('曾未合格 · 最終合格結案','Từng không đạt · Cuối cùng đạt và đã đóng'):
        t('復測合格 · 已結案','Thử lại đạt · Đã đóng')):caseStage(v,item);
      const active=caseDocuments(v,item).find(activeDoc);
      const next=!passed&&item.status==='retest'?(active?docButton(active,label(active.kind)):
        button('tab:report',label('report'))):button('case:'+item.id,openCase(item)&&!passed?label(item.result):label('history'));
      return `<p>${batchLabel(row.batch)} · ${h(outcome)} · ${h(closure)} ${next}</p>`;
    }).join('');
  }
  function closedPeriodState(results) {
    if(results.length&&results.every(({item,passed})=>!passed&&item?.status==='disposed'))return label('disposed');
    if(results.length&&results.every(result=>result.passed)){
      if(results.some(({attempts})=>attempts.length>1&&attempts.some(attempt=>attempt.outcome==='fail')))
        return t('曾經不合格 · 最終合格結案','Từng không đạt · Cuối cùng đạt và đã đóng');
      if(results.some(({attempts})=>attempts.length>1))return t('復測合格 · 已結案','Thử lại đạt · Đã đóng');
    }
    return label('closed');
  }
  const periodLink=(action,text)=>`<a href="#routine-document" class="rf-location-link" data-ri-action="${h(action)}">${h(text)}</a>`;
  function transitionNotes(v,jobs){
    const scopes=new Set(jobs.map(job=>job.calendar?.scope).filter(Boolean));
    const pending=new Set(),overlap=jobs.some(job=>{
      const policy=v.data.periodRules?.[job.calendar?.scope];
      return job.planId&&policy&&job.source.frequency!==policy.frequency;
    });
    for(const scope of scopes){
      const policy=v.data.periodRules?.[scope];
      if(policy&&policy.from>v.data.today&&!policy.until)pending.add(policy.from);
    }
    return [...pending].sort((a,b)=>a.localeCompare(b)).map(date=>`<p class="rf-notice">${t('頻率轉換期間，無須另排，新週期開始：','Giai đoạn đổi tần suất, không cần lập thêm. Kỳ mới bắt đầu: ')}${h(date)}</p>`).join('')+
      (overlap?`<p class="rf-notice">${t('既有計畫保留原標準，新頻率任務另行安排，不能互相抵扣。','Giữ tiêu chuẩn cũ cho kế hoạch đã lập. Lập riêng công việc tần suất mới, không thay thế lẫn nhau.')}</p>`:'');
  }
  function periodState(v,job) {
    const history=v.data.documents.filter(doc=>doc.jobs.some(line=>line.id===job.id));
    const plan=history.find(doc=>doc.id===job.planId&&!doc.cancelledAt),report=initialReport(v,job);
    const currentDocs=history.filter(doc=>activeDoc(doc)&&!doc.caseId);
    const active=currentDocs.find(doc=>doc.kind!=='waiver')||currentDocs.find(doc=>doc.status==='pending')||currentDocs.at(-1);
    const results=periodResults(v,job,report);
    const followups=[...new Map(results.filter(({item,passed})=>item&&!passed&&openCase(item)).map(({item})=>[item.id,item])).values()];
    const unresolved=followups.length>0;
    const overdue=job.end<v.data.today&&!job.completion&&!job.calendar?.stopped&&(!plan||plan.status==='draft');
    const stopped=job.calendar?.stopped;
    const tone=stopped||job.start>v.data.today?'neutral':overdue?'alert':active?.status==='pending'?'pending':
      active||unresolved||plan?.status==='approved'&&!job.completion?'progress':job.completion?'done':'ready';
    const state=stopped?t('已停止安排','Ngừng lập lịch'):overdue?t('已逾期','Quá hạn'):
      active?(active.kind==='report'?t('初測報告','Báo cáo lần đầu'):label(active.kind))+' · '+docState(active)+(active.expired?t(' · 唯讀',' · Chỉ đọc'):''):report?
        (unresolved?t('批次處理中','Đang xử lý lô'):closedPeriodState(results)):
        job.completion?.kind==='skip'?t('當期已核准免測 · 已結案','Đã duyệt miễn kỳ này · Đã đóng'):
        plan?.status==='approved'?t('檢查報告 · 待填寫','Báo cáo kiểm tra · Chờ nhập'):
        job.start>v.data.today?t('下一期尚未開始','Kỳ tiếp theo chưa bắt đầu'):t('尚未建立計畫','Chưa lập kế hoạch');
    const reason=!permissions(v).edit||!permissions(v).create?t('沒有建立計畫權限','Không có quyền lập kế hoạch'):
      v.pending?t('上一筆操作待確認','Chưa xác định thao tác trước đó'):
      stopped?t('工作已停止','Công việc đã dừng'):overdue?t('本期不能新建、修改或重新送審','Không thể lập, sửa hoặc gửi duyệt lại kỳ này'):
      job.start>v.data.today?t('未到開始日','Chưa đến ngày bắt đầu'):
      plan?.expired?t('既有計畫含逾期項目，只能查看','Kế hoạch có hạng mục quá hạn, chỉ được xem'):
      active?.kind==='waiver'&&active.status==='pending'?t('免測申請待審','Đề nghị miễn đang chờ duyệt'):
      job.completion?t('此期已有處理紀錄','Kỳ này đã được xử lý'):holdsPlan(job,v)?t('已加入既有計畫','Đã có trong kế hoạch'):'';
    const destinations=followups.map(item=>{
      const stage=item.status==='retest'?'report':item.result;
      const action=item.status==='retest'?'tab:report':'case:'+item.id;
      return periodLink(action,label(stage)+' · ERP '+item.batch.batchNo);
    }).join(' · ');
    const next=active?periodLink('doc:'+active.id,label(active.kind)):destinations||
      (plan?.status==='approved'&&!report&&!job.completion?periodLink('tab:report',label('report')):
        report?periodLink('history-doc:'+report.id,t('原始報告','Báo cáo gốc')):
        plan?periodLink('doc:'+plan.id,label(plan.kind)):'');
    return {history,results,state,reason,next,tone,waived:job.completion?.kind==='skip',terminal:!!(stopped||overdue||job.completion&&!unresolved)};
  }
  const periodKey = job => job.start+':'+job.end;
  function groupPeriods(v,jobs,states) {
    const visible=new Set(),streams=new Map();
    for(const job of jobs){
      if(!streams.has(job.itemId))streams.set(job.itemId,[]);
      streams.get(job.itemId).push(job);
    }
    for(const stream of streams.values()){
      const begun=stream.filter(job=>job.start<=v.data.today);
      const current=begun.find(job=>job.end>=v.data.today&&!job.calendar?.stopped);
      const main=current||begun[0]||stream[0];
      const previous=current&&begun.find(job=>{
        if(job.end>=v.data.today)return false;
        const day=new Date(job.end+'T00:00:00Z');
        day.setUTCDate(day.getUTCDate()+1);
        return day.toISOString().slice(0,10)===current.start;
      });
      for(const job of stream)if(periodKey(job)===periodKey(main)||previous&&periodKey(job)===periodKey(previous)||!states.get(job.id).terminal)visible.add(job.id);
    }
    return {current:jobs.filter(job=>visible.has(job.id)),older:jobs.filter(job=>!visible.has(job.id))};
  }

  // The approved job snapshot carries supplier IDs from its source part.
  const inPartScope=(job,v)=>(!v.category||job.source.iqc.categoryId===v.category)&&
    (!v.supplier||job.source.iqc.supplierIds?.includes(v.supplier));
  const normalized = value => String(value??'').normalize('NFKC').toLocaleLowerCase();
  const matchesQuery=(value,query)=>normalized(query).trim().split(/\s+/).every(term=>normalized(value).includes(term));
  const periodFiltersActive=v=>!!(v.periodFrom||v.periodTo||v.outcome);
  function matchesOutcome(v,job) {
    if(!v.outcome)return true;
    return periodResults(v,job,initialReport(v,job)).some(({item,attempts,passed})=>
      (v.outcome==='ever-fail'&&attempts.some(attempt=>attempt.outcome==='fail'))||
      (v.outcome==='retest-pass'&&passed&&attempts.some(attempt=>attempt.outcome==='fail'))||
      (v.outcome==='disposed-after-fail'&&item?.status==='disposed'&&!passed&&attempts.some(attempt=>attempt.outcome==='fail')));
  }
  const matchesFilters=(job,v)=>inPartScope(job,v)&&(!v.part||job.source.iqc.partId===v.part)&&
    (!v.periodFrom||job.end>=v.periodFrom)&&(!v.periodTo||job.start<=v.periodTo)&&matchesOutcome(v,job)&&
    matchesQuery([job.source.name,job.source.code,job.source.category,...job.source.products.flatMap(part=>[part.code,part.name])].join(' '),v.search);
  function periodFilters(v) {
    const outcomes=[['',t('全部結果','Tất cả kết quả')],['ever-fail',t('曾有不合格','Từng không đạt')],
      ['retest-pass',t('不合格後復測合格','Thử lại đạt sau khi không đạt')],
      ['disposed-after-fail',t('不合格後處置結案','Đã xử lý và đóng sau khi không đạt')]];
    return `<form class="rf-period-search" data-ri-period-search>
      <label class="rf-period-query">${t('搜尋檢查項目','Tìm hạng mục kiểm tra')}
      <input name="search" type="search" value="${h(v.search)}" placeholder="${t('項目名稱、項目或零件編號','Tên hạng mục, mã hạng mục hoặc linh kiện')}"></label>
      <label>${t('檢查期別自','Kỳ kiểm tra từ')}<input type="date" name="periodFrom" value="${h(v.periodFrom)}"></label>
      <label>${t('檢查期別至','Kỳ kiểm tra đến')}<input type="date" name="periodTo" value="${h(v.periodTo)}"></label>
      <label class="rf-period-outcome">${t('歷史結果','Kết quả lịch sử')}<select name="outcome">${outcomes.map(([value,title])=>
        `<option value="${value}" ${value===v.outcome?'selected':''}>${title}</option>`).join('')}</select></label>
      <div class="rf-period-filter-actions"><button type="submit" class="rf-btn">${t('搜尋','Tìm')}</button>
      ${v.search||periodFiltersActive(v)||v.category||v.supplier||v.part?button('clear-period-filters',t('清除篩選','Xóa bộ lọc')):''}</div>
      <p role="alert" data-ri-period-error hidden></p></form>`;
  }
  const selections=v=>v.data.jobs.filter(job=>v.checked.has(job.id));
  const hiddenSelections=v=>selections(v).filter(job=>!matchesFilters(job,v));
  const periodOf=job=>`${h(label(job.source.frequency))} · ${h(job.start)} — ${h(job.end)}`;
  function periodCaption(job){
    const year=job.start.slice(0,4),month=Number(job.start.slice(5,7)),frequency=job.calendar?.frequency||job.source.frequency;
    const quarter=Math.ceil(month/3),first=(quarter-1)*3+1;
    switch(frequency){
      case 'yearly':return year+t(' 年',' năm');
      case 'quarterly':return year+' · '+t('第 '+quarter+' 季（'+first+'–'+(first+2)+' 月）','Quý '+quarter);
      case 'semiannual':return year+' · '+(month<=6?t('上半年度','Nửa đầu năm'):t('下半年度','Nửa cuối năm'));
      case 'monthly':return year+' · '+t(month+' 月','Tháng '+month);
      default:return job.start+' — '+job.end;
    }
  }
  function jobIdentity(job) {
    return `<span class="ri-job-identity"><strong>${h(job.source.name)}</strong>
      <small>${t('料號','Mã linh kiện')} ${h(job.source.products[0].code)} · ${t('檢查代碼','Mã kiểm tra')} ${h(job.source.code)}</small></span>`;
  }
  function pickSummary(v,hidden) {
    if(!hidden.length&&!v.removedPicks)return '';
    return `<section class="ri-picks" aria-label="${t('選取確認','Xác nhận hạng mục đã chọn')}">
      ${hidden.length?`<p role="status">${t('其中','Trong đó có')} ${hidden.length} ${t('項不在目前結果','hạng mục ngoài kết quả hiện tại')}</p>`:''}
      ${v.removedPicks?`<p role="status">${t('資料更新後有','Sau khi cập nhật, có')} ${v.removedPicks} ${t('項已不能安排，系統已取消其勾選。','hạng mục không còn lập được và đã bỏ chọn.')}</p>`:''}
      ${hidden.length?`<div class="rf-actions">
        <button type="button" class="rf-btn" data-ri-action="toggle-hidden-picks" aria-expanded="${v.showHidden}" aria-controls="ri-hidden-picks">
          ${v.showHidden?t('收合未顯示的勾選','Thu gọn hạng mục ngoài kết quả'):t('查看未顯示的勾選','Xem hạng mục ngoài kết quả')}</button>
        ${button('clear-hidden-picks',t('取消未顯示的勾選','Bỏ chọn các hạng mục ngoài kết quả'))}</div>
        <ul id="ri-hidden-picks" class="ri-pick-list" ${v.showHidden?'':'hidden'}>${hidden.map(job=>`<li>${jobIdentity(job)}
          <span>${periodOf(job)}</span>${button('remove-pick:'+job.id,t('取消此項勾選','Bỏ chọn hạng mục này'))}</li>`).join('')}</ul>`:''}
    </section>`;
  }
  function jobList(v) {
    const cats=v.data.catalog.categories;
    const filtered=v.data.jobs.filter(job=>matchesFilters(job,v));
    const suppliers=v.data.catalog.suppliers||[];
    const parts=new Map(v.data.jobs.filter(job=>inPartScope(job,v)).map(job=>[job.source.iqc.partId,job.source.products[0]]));
    const hidden=hiddenSelections(v);
    const states=new Map(filtered.map(job=>[job.id,periodState(v,job)]));
    const row=job=>{
      const {history,results,state,reason,next,tone,waived}=states.get(job.id);
      const canPick=available(job,v)&&canArrange(v);
      const reasonId='ri-period-lock-'+job.id;
      const shownReason=reason||t('此期不可安排','Kỳ này không thể lập lịch');
      return `<article class="rf-calendar-period rf-period-single" data-ri-period="${h(job.id)}">
        <label class="rf-period-choice ${canPick?'':'is-locked'}"><input type="checkbox" data-ri-pick="${h(job.id)}"
          ${v.checked.has(job.id)?'checked':''} ${canPick?'':`disabled aria-describedby="${h(reasonId)}"`}>
          <span class="rf-period-overview"><b title="${periodOf(job)}">${h(periodCaption(job))}</b>
          <span class="rf-period-lock" id="${h(reasonId)}">${canPick?t('可勾選','Có thể chọn'):t('不可勾選','Không thể chọn')+' · '+h(shownReason)}</span></span>
        </label>
        <div class="rf-period-location"><small>${t('目前狀態','Trạng thái hiện tại')}</small>
          <span class="rf-period-chip ${tone}">${h(state)}</span><span>${t('接續頁面','Trang tiếp tục')}：${next||h(canPick?
          t('檢查項目勾選後建立檢查計畫','Chọn hạng mục rồi tạo kế hoạch kiểm tra'):t('流程歷史（唯讀）','Lịch sử (chỉ đọc)'))}</span></div>
        <div class="rf-period-results"><small>${t('核准結果與結案','Kết quả đã duyệt và đóng hồ sơ')}</small>
          <div>${waived?h(t('當期已核准免測 · 已結案','Đã duyệt miễn kỳ này · Đã đóng')):inspectionResults(v,results)||
            h(t('尚無已核准正式結果','Chưa có kết quả chính thức được duyệt'))}</div></div>
        ${canExempt(job,v)?`<div class="rf-period-exemption">${button('waive-period:'+job.id,exemptLabel(),!canArrange(v))}</div>`:''}
        ${permissions(v).history?`<details class="rf-period-history" data-ri-period-history="${h(job.id)}" ${v.openHistories.has(job.id)?'open':''}><summary>${t('流程歷史與結果（唯讀）','Lịch sử và kết quả (chỉ đọc)')}</summary>
         <div class="rf-period-history-body">${history.slice().reverse().map(doc=>button('history-doc:'+doc.id,doc.number+' · '+label(doc.kind))).join('')||h(t('尚無歷史紀錄','Chưa có lịch sử'))}</div></details>`:''}</article>`;
    };
    const standard=v.data.catalog.items.length, startDate=v.data.startDate;
    if(!v.data.jobs.length){
      if(!standard)return emptyList(t('沒有可排程的 IQC 檢查項目','Chưa có hạng mục IQC để lập lịch'),
        t('請到資料後台 IQC 核對已核准的零件分類和檢查項目。例行檢查會抓取已核准的標準時間頻率。','Kiểm tra nhóm linh kiện và hạng mục đã duyệt trong Quản lý dữ liệu IQC. Lịch dùng tần suất định kỳ chuẩn đã duyệt.'),
        window.hasPermission?.('iqc.view')?button('open-master',t('前往資料後台 IQC','Mở Quản lý dữ liệu IQC')):'');
      if(!startDate)return emptyList(t('IQC 排程尚未啟動','Lịch IQC chưa bắt đầu'),
        t('設定開始日期後，這裡會列出可勾選的當期檢查項目。','Sau khi đặt ngày bắt đầu, danh sách sẽ hiển thị hạng mục có thể chọn trong kỳ.'),
        canConfigure(v)?button('configure',t('設定開始日期','Đặt ngày bắt đầu'),false,true):'');
      return emptyList(t('目前沒有應檢工作','Hiện chưa có công việc kiểm tra'),
        startDate>v.data.today?t('排程開始日為 ','Lịch bắt đầu ngày ')+startDate:
          t('請核對頻率與期別，或重新整理以讀取最新工作。','Kiểm tra tần suất và kỳ hoặc tải lại công việc mới nhất.'));
    }
    const groups=new Map();
    for(const job of filtered.slice().sort((a,b)=>b.start.localeCompare(a.start)||b.end.localeCompare(a.end))){
      const id=job.source.iqc.itemId||job.itemId;
      if(!groups.has(id))groups.set(id,[]);
      groups.get(id).push(job);
    }
    const group=([id,jobs])=>{
      const latest=jobs.find(job=>job.start<=v.data.today&&!job.calendar?.stopped)||jobs[0];
      const {state,tone}=states.get(latest.id);
      const {current,older}=periodFiltersActive(v)?{current:jobs,older:[]}:groupPeriods(v,jobs,states);
      const picked=jobs.filter(job=>v.checked.has(job.id)).length,expanded=v.openGroups.has(id);
      const count=new Set((periodFiltersActive(v)?jobs:jobs.filter(job=>!states.get(job.id).terminal)).map(periodKey)).size;
      const product=latest.source.products[0],name=latest.source.name,meta=latest.source.code+' · '+latest.source.category;
      const olderOpen=v.openOlder.has(id),page=v.periodPages.get(id)||6;
      const pages=periodFiltersActive(v)?current:older;
      const pageKeys=new Set([...new Set(pages.map(periodKey))].slice(0,page));
      const pageRows=pages.filter(job=>pageKeys.has(periodKey(job)));
      const more=new Set(pages.map(periodKey)).size>page?button('more-periods:'+id,t('載入更多','Xem thêm')):'';
      const historyCount=new Set(older.map(periodKey)).size;
      return `<article class="rf-calendar-card rf-period-group" data-ri-group="${h(id)}">
        <button type="button" class="rf-period-group-toggle" data-ri-action="toggle-group:${h(id)}" aria-expanded="${expanded}">
          <span class="rf-period-group-title"><strong>${h(name.length>64?name.slice(0,64)+'…':name)}</strong>
            <small>${h(meta.length>100?meta.slice(0,100)+'…':meta)}</small></span>
          <span class="rf-period-group-summary"><span class="rf-period-product-code">${h(product.code)}</span>
            <span>${periodFiltersActive(v)?t('符合','Khớp'):t('待處理','Cần xử lý')} ${count} ${t('期','kỳ')}</span>
            <span class="rf-period-chip ${tone}">${t('最新狀態','Mới nhất')} · ${h(state)}</span>
            <span class="${picked?'rf-period-picked':''}">${t('已選','Đã chọn')} ${picked}</span></span>
          <span class="rf-period-chevron" aria-hidden="true">${expanded?'▴':'▾'}</span></button>
        ${name.length>64||meta.length>100?`<details class="rf-period-source-full"><summary>${t('完整項目名稱與標準','Tên hạng mục và tiêu chuẩn đầy đủ')}</summary><p>${h(name)}</p><p>${h(meta)}</p></details>`:''}
        <div ${expanded?'':'hidden'}>
          ${periodFiltersActive(v)?pageRows.map(row).join('')+more:transitionNotes(v,jobs)+current.map(row).join('')}
          ${older.length?`<section class="rf-period-older" data-ri-older="${h(id)}">
            <div class="rf-period-older-actions"><button type="button" class="rf-btn" data-ri-action="toggle-older:${h(id)}" aria-expanded="${olderOpen}">${olderOpen?
              t('收合更早期別','Thu gọn các kỳ trước'):t('顯示更多之前的列表','Hiển thị thêm danh sách trước đây')+' · '+historyCount}</button></div>
            <div ${olderOpen?'':'hidden'}>${pageRows.map(row).join('')}${olderOpen?`<div class="rf-period-older-actions">${more}${button('close-older:'+id,t('收合更早期別','Thu gọn các kỳ trước'))}</div>`:''}</div></section>`:''}</div></article>`;
    };
    return `<section class="ri-pick-work">
      ${!permissions(v).create||!permissions(v).edit?`<p class="rf-notice">${t('此帳號可查看項目。建立計畫需要編輯及新增權限。','Tài khoản có thể xem. Cần quyền sửa và tạo để lập kế hoạch.')}</p>`:''}
      <div class="rf-source-filters"><label>${t('零件類別','Nhóm linh kiện')}<select data-ri-filter="category"><option value="">${t('全部','Tất cả')}</option>${cats.map(c=>`<option value="${h(c.id)}" ${c.id===v.category?'selected':''}>${h(c.name)}</option>`).join('')}</select></label>
      <label>${t('供應商','Nhà cung cấp')}<select data-ri-filter="supplier"><option value="">${t('全部','Tất cả')}</option>
        ${suppliers.map(supplier=>`<option value="${h(supplier.id)}" ${supplier.id===v.supplier?'selected':''}>${h(supplier.name)}</option>`).join('')}</select></label>
      <label>${t('零件','Linh kiện')}<select data-ri-filter="part"><option value="">${t('全部','Tất cả')}</option>${[...parts].map(([id,p])=>`<option value="${h(id)}" ${id===v.part?'selected':''}>${h(p.code+' · '+p.name)}</option>`).join('')}</select></label></div>
      <div class="rf-calendar-toolbar"><b data-ri-pick-count role="status">${t('已選','Đã chọn')} ${v.checked.size} ${t('項','hạng mục')}</b>
        ${button('create-plan',t('建立檢查計畫','Tạo kế hoạch kiểm tra'),!v.checked.size||!canArrange(v),true)}
        ${button('create-waiver',exemptLabel(),!v.checked.size||!canArrange(v)||!selections(v).every(job=>canExempt(job,v)))}
        ${button('clear-picks',t('清除選取','Bỏ chọn'),!v.checked.size)}</div>
      ${canArrange(v)&&!filtered.some(job=>canExempt(job,v))?`<p class="rf-subtle ri-waiver-note">${t('目前清單沒有可申請免測的期別。只有當期、尚未建立計畫且未處理的項目可申請。','Danh sách hiện không có kỳ đủ điều kiện miễn. Chỉ hạng mục trong kỳ hiện tại, chưa lập kế hoạch và chưa xử lý mới được xin miễn.')}</p>`:''}
      ${pickSummary(v,hidden)}
      ${periodFilters(v)}
      ${periodFiltersActive(v)?`<p class="rf-period-match">${t('符合篩選','Khớp bộ lọc')} · ${groups.size} ${t('項','hạng mục')}</p>`:''}
      <div class="rf-calendar-work">${[...groups].map(group).join('')||
        emptyList(t('此範圍沒有項目','Không có hạng mục trong phạm vi này'),'')}</div></section>`;
  }
  function lotForm(doc,c,edit) {
    const parts=new Map(doc.jobs.map(job=>[job.source.iqc.partId,job.source.products[0]]));
    return `<section class="ri-lots"><h4>${t('各零件 ERP 批號與本次測試數量','Lô ERP và số lượng thử từng linh kiện')}</h4>
      ${edit?`<p>${t('每個已選零件至少填一個批號。同一零件可以新增多批，各批填寫測試數量，單位 pcs。','Nhập ít nhất một lô cho mỗi linh kiện đã chọn. Có thể thêm nhiều lô, mỗi lô có số lượng thử theo pcs.')}</p>`:
        `<p>${t('批號與測試數量使用計畫的保存版本。','Mã lô và số lượng lấy từ bản kế hoạch đã lưu.')}</p>`}
      ${[...parts].map(([id,part])=>`<fieldset><legend>${h(part.code+' · '+part.name)}</legend>
      ${c.lots.map((lot,i)=>lot.partId!==id?'':edit?`<div class="ri-lot">
        <label>${t('ERP 批號','Mã lô ERP')}<input data-ri-lot="${i}" data-ri-key="batchNo" value="${h(lot.batchNo)}" maxlength="120"></label>
        <label>${t('本次測試數量 (pcs)','Số lượng thử (pcs)')}<input data-ri-lot="${i}" data-ri-key="quantity" type="number" inputmode="numeric" min="1" step="1" value="${h(lot.quantity)}"></label>
        ${button('remove-lot:'+i,t('移除批號','Bỏ lô'))}</div>`:`<p>${batchLabel(lot)}</p>`).join('')}
      ${edit?button('add-lot:'+id,t('新增 ERP 批號','Thêm lô ERP')):''}</fieldset>`).join('')}</section>`;
  }
  function sourceDescription(v,line){
    const source=line.source, part=source.products[0], rules=source.iqc;
    const job=v.data.jobs.find(job=>job.id===line.id);
    const fact=(label,value)=>value?`<div><dt>${label}</dt><dd>${h(value)}</dd></div>`:'';
    const standard=rules.method||rules.inspectionSpecification
      ? fact(t('檢查方法','Phương pháp kiểm tra'),rules.method)+fact(t('檢查規格','Quy cách kiểm tra'),rules.inspectionSpecification)
      : fact(t('當次標準','Tiêu chuẩn tại thời điểm này'),source.description);
    return `<p class="rf-subtle">${h([source.category,source.errorCode,source.code].filter(Boolean).join(' / '))} · ${t('版本','Phiên bản')} ${h(source.version||source.versionId||'—')}</p>
      ${part?`<p>${t('零件','Linh kiện')} · ${h([part.code,part.name].filter(Boolean).join(' · '))}</p>`:''}
      ${job?`<p>${t('檢查期別','Kỳ kiểm tra')} · ${periodOf(job)}</p>`:''}
      <details class="rf-standard"><summary>${t('展開當次標準','Xem tiêu chuẩn tại thời điểm này')}</summary>
        <dl class="rf-plan-facts ri-source-standard">${standard}${fact(t('零件規格','Quy cách linh kiện'),rules.partSpecification)}${fact(t('檢具','Dụng cụ kiểm tra'),rules.tool)}</dl>
      </details>`;
  }
  function planItems(v,doc){
    return doc.jobs.map((line,index)=>`<section class="rf-item" data-ri-plan-item="${h(line.id)}"><div class="rf-item-head"><strong>${index+1}. ${h(line.source.name)}</strong></div>
      <div class="rf-item-body">${sourceDescription(v,line)}</div></section>`).join('');
  }
  function planDates(c){
    return `<dl class="rf-plan-facts"><div><dt>${t('計畫起日','Ngày bắt đầu')}</dt><dd>${h(c.start||'—')}</dd></div>
      <div><dt>${t('計畫迄日','Hạn kết thúc')}</dt><dd>${h(c.end||'—')}</dd></div></dl>`;
  }
  const inspectionOutcomes=['pass','fail','abnormal'];
  function inspectionChoices(row,job) {
    const title=t('檢查結果','Kết quả kiểm tra');
    const groupLabel=`${title} · ${job.source.name} · ERP ${row.batch.batchNo}`;
    return `<div class="ri-outcome-heading"><p class="rf-select-hint">${title}</p>
      ${button('inspection-outcome:'+h(row.id)+':clear',t('清除結果','Xóa kết quả'),!row.outcome)}</div>
    <div class="rf-choice ri-outcome-choices" role="group" aria-label="${h(groupLabel)}">
      ${inspectionOutcomes.map(outcome=>`<button type="button" data-outcome="${outcome}" data-ri-action="inspection-outcome:${h(row.id)}:${outcome}"
        aria-pressed="${row.outcome===outcome}">${label(outcome)}</button>`).join('')}</div>`;
  }
  function inspectionForm(v,doc,c,edit,showCurrentState=true) {
    return batches(c.inspections).map(rows=>{
      const batch=rows[0].batch, target=v.data.cases.find(item=>item.originReportId===doc.id&&batchKey(item.batch)===batchKey(batch));
      const groupState=!showCurrentState?'':target?.status==='closed'?label('closed'):target?.status==='disposed'?label('disposed'):
        target?label(target.result)+' · '+label(target.status):doc.status==='approved'&&rows.every(row=>row.outcome==='pass')?label('pass')+' · '+label('closed'):'';
      return `<section class="ri-batch"><header>${batchLabel(batch)} ${h(groupState)}</header>${rows.map(row=>{
        const job=doc.jobs.find(job=>job.id===row.jobId);
        return `<div class="rf-item ri-inspection" data-ri-inspection="${h(row.id)}"><h4>${h(job.source.name)}</h4>
          ${sourceDescription(v,job)}
          ${edit?inspectionChoices(row,job):(row.outcome?tag(row.outcome):'')}
          ${['value','notes'].map(key=>{
            const title=key==='value'?t('實測結果／數值','Kết quả / giá trị thực tế'):
              row.outcome==='pass'?t('備註（合格免填原因）','Ghi chú (đạt không cần lý do)'):t('問題說明／原因','Mô tả vấn đề / lý do');
            return `<label>${title}<textarea data-ri-result="${h(row.id)}" data-ri-key="${key}" ${edit?'':'readonly'}>${h(row[key])}</textarea></label>`;
          }).join('')}
          <div class="rf-photos">${row.photos.map(id=>`${photo(id)}${edit?button('remove-photo:'+row.id+':'+id,t('移除','Gỡ')):''}`).join('')}</div>
          ${edit?`<label>${t('上傳照片','Tải ảnh')}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-ri-photo="${row.id}"></label>`:''}</div>`;
      }).join('')}</section>`;
    }).join('');
  }
  const documentTimeFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',
    day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function documentTime(value){
    if(!value)return '';
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))return '';
    const parts=documentTimeFormatter.formatToParts(date);
    const fields=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    return `${fields.year}/${fields.month}/${fields.day} ${fields.hour}:${fields.minute}`;
  }
  function approvedRouting(v,doc,c) {
    if(!reportKind(doc)||doc.status!=='approved')return '';
    const rows=c.inspections;
    const follow=v.data.cases.find(item=>item.id===doc.caseId);
    const groups=[['pass',t('合格 · 已更新檢查項目','Đạt · Đã cập nhật hạng mục')],
      ['fail',label('fail')],['abnormal',label('abnormal')]];
    return `<div class="rf-approved-routing">${groups.map(([outcome,title])=>{
      const matching=rows.filter(row=>row.outcome===outcome);
      if(!matching.length)return '';
      return `<section data-approved-result="${outcome}"><h4>${title}</h4><ul>${matching.map(row=>{
        const source=doc.jobs.find(job=>job.id===row.jobId).source;
        const item=outcome==='pass'?null:follow||caseForRow(v,doc,row);
        return `<li><b>${h(source.name)}</b><small>${batchLabel(row.batch)}</small>
          ${item?button('case:'+item.id,openCase(item)?label(item.result):label('history')):''}</li>`;
      }).join('')}</ul></section>`;
    }).join('')}</div>`;
  }
  const pendingDoc = (v,doc) => doc.flow.cases.find(caseRow=>caseRow.id===doc.flow.pendingId);
  const reportNeedsLateReason=(c,today)=>!!(c.end&&(c.date>c.end||today>c.end||(c.reason||'').trim()));
  function documentDetail(v,doc) {
    const edit=doc.status==='draft'&&!doc.expired&&!v.readOnly&&permissions(v).edit&&!v.review, c=edit?(v.draft||content(doc)):content(doc), p=permissions(v);
    const follow=v.data.cases.find(item=>item.id===doc.caseId);
    const pending=pendingDoc(v,doc), self=pending?.actor.id===v.data.identity.id;
    const disable=v.busy||!!v.pending, plan=doc.kind==='plan'||doc.kind==='retest-plan', report=reportKind(doc);
    const sourcePlan=report?v.data.documents.find(row=>row.id===doc.planId&&row.status==='approved'):null;
    return `<article class="rf-document"><h3>${h(doc.number)} · ${h(label(doc.kind))} ${docStatusTag(doc)}</h3>
      ${follow?`<p>${batchLabel(follow.batch)} · ${docButton(v.data.documents.find(d=>d.id===follow.originReportId),t('原始報告','Báo cáo gốc'))}</p>`:''}
      ${doc.expired?`<p class="rf-notice">${t('已逾期，保留原紀錄。','Quá hạn, giữ lịch sử gốc.')}</p>`:''}
      ${plan||report?input('title',t('文件名稱','Tên hồ sơ'),c.title??doc.number,edit):''}
      ${plan?(doc.kind==='retest-plan'&&edit?
        input('start',t('檢查期間起日','Ngày bắt đầu kiểm tra'),c.start,true,'date')+input('end',t('檢查期間迄日','Ngày kết thúc kiểm tra'),c.end,true,'date'):planDates(c)):''}
      ${report?input('date',t('實際日期','Ngày thực tế'),c.date,edit,'date')+
        `<section class="rf-calendar-fields rf-integrated-plan"><h4>${t('本報告的核准計畫','Kế hoạch đã duyệt của báo cáo')}</h4>
          <strong>${h(sourcePlan?.number||doc.planId||'—')}</strong>${planDates(c)}</section>`:planItems(v,doc)}
      ${approvedRouting(v,doc,c)}${doc.kind==='plan'?lotForm(doc,c,edit):''}${report?`${edit?`<p>${t('各批結果分開填寫。全部批次完成並儲存後，才可整份送審。','Điền kết quả riêng cho mỗi lô. Hoàn tất và lưu toàn bộ các lô trước khi gửi cả báo cáo.')}</p>`:''}${inspectionForm(v,doc,c,edit)}`:''}
      ${input('notes',t('備註','Ghi chú'),c.notes,edit,'textarea')}
      ${report?`<div data-ri-overdue-reason ${reportNeedsLateReason(c,v.data.today)?'':'hidden'}>${input('reason',t('逾期送審原因','Lý do gửi quá hạn'),c.reason,edit,'textarea')}</div>`:
        doc.kind!=='plan'?input('reason',t('申請原因','Lý do đề nghị'),c.reason,edit,'textarea'):''}
      ${doc.kind==='disposal'?input('disposition',t('處置內容','Nội dung xử lý'),c.disposition,edit,'textarea')+c.photos.map(photo).join('')+(edit?`<label>${t('上傳照片','Tải ảnh')}<input data-ri-photo="document" type="file" accept="image/*"></label>`:''):''}
      ${doc.status==='draft'&&doc.issues.length?`<ul class="rf-notice">${doc.issues.map(issue=>`<li>${h(errorText(issue.code))}</li>`).join('')}</ul>`:''}
      <div class="rf-actions">${edit?button('save',t('儲存草稿','Lưu bản nháp'),disable||!p.save,true)+button('submit',t('送出審核','Gửi duyệt'),disable||!p.submit||!doc.flow.saved||doc.savedIssues.length>0)+button('dispose-draft',t('捨棄草稿','Bỏ bản nháp'),disable||!p.delete):''}
      ${!v.review&&!v.readOnly&&bookReport(v,doc)?button('create-report:'+doc.id,t('填寫檢查報告','Nhập báo cáo'),disable||!p.create,true):''}
      ${pending&&!v.review&&!v.readOnly?button('review:'+doc.id,t('查看送審案件 · 例行 IQC','Xem hồ sơ gửi duyệt · IQC định kỳ'))+button('withdraw',t('撤回送審','Rút hồ sơ'),disable||!p.withdraw):''}</div>
      ${v.review&&pending&&!v.readOnly?`<div class="rf-approval"><p>${t('核對送審時固定的整份資料。','Kiểm tra toàn bộ bản đã gửi.')}</p>
        ${self?`<label><input type="checkbox" data-ri-self ${v.data.identity.role==='admin'?'':'disabled'}> ${t('我確認自審並留下操作紀錄','Tôi xác nhận tự duyệt và lưu nhật ký')}</label>`:''}
        <div class="rf-actions">${button('approve',t('確認核准','Xác nhận duyệt'),disable||!p.approve||self,true)}</div>
        ${p.return?`<label>${t('發回修正意見（必填）','Ý kiến trả lại (bắt buộc)')}<textarea data-ri-return-reason required></textarea></label>
          ${button('return',t('發回修正','Trả lại sửa'),true)}`:''}</div>`:''}
      <details><summary>${label('history')}</summary>${doc.flow.cases.map(review=>`<details><summary>${h(label(review.status))} · ${h(review.actor.name)} · ${h(review.at)}</summary>
        <p>${h(review.reason)} · ${h(review.result?.actor?.name)} · ${h(review.result?.at)} · ${h(review.result?.reason)}</p>
        ${review.content.start||review.content.end?`<p>${h(review.content.start)} — ${h(review.content.end)}</p>`:''}
        ${review.content.title?`<p>${t('文件名稱','Tên hồ sơ')} · ${h(review.content.title)}</p>`:''}
        ${report&&review.content.date?`<p>${t('實際日期','Ngày thực tế')} · ${h(review.content.date)}</p>`:''}
        ${review.content.reason?`<p>${t('原因','Lý do')} · ${h(review.content.reason)}</p>`:''}
        ${review.content.notes?`<p>${t('備註','Ghi chú')} · ${h(review.content.notes)}</p>`:''}
        ${review.content.disposition?`<p>${t('處置內容','Nội dung xử lý')} · ${h(review.content.disposition)}</p>`:''}
        ${review.content.lots.map(lot=>`<p>${batchLabel(lot)}</p>`).join('')}
        ${plan?planItems(v,doc):inspectionForm(v,doc,review.content,false,false)}${review.content.photos.map(photo).join('')}</details>`).join('')||'—'}</details></article>`;
  }
  const bookReport=(v,doc)=>['plan','retest-plan'].includes(doc.kind)&&doc.status==='approved'&&!v.data.documents.some(child=>child.planId===doc.id&&child.kind.endsWith('report')&&!child.cancelledAt);
  function caseDetail(v,item) {
    const follow=caseDocuments(v,item), original=v.data.documents.find(doc=>doc.id===item.originReportId&&doc.status==='approved');
    const history=[...new Set([...item.reports,...follow.map(doc=>doc.id)])].filter(id=>id!==item.originReportId);
    const rows=original?content(original).inspections.filter(row=>row.outcome!=='pass'&&batchKey(row.batch)===batchKey(item.batch)):[];
    const ongoing=follow.find(activeDoc);
    const ready=item.status==='retest'?follow.find(doc=>doc.kind==='retest-plan'&&bookReport(v,doc)):null;
    const writable=!v.review&&!v.readOnly, unavailable=!permissions(v).create||v.busy||!!v.pending;
    return `<h3>${batchLabel(item.batch)} · ${h(caseStage(v,item))}</h3>
      <p>${t('最新已核准結果','Kết quả đã duyệt mới nhất')} · ${label(item.status==='closed'?'pass':item.result)}</p>
      <div class="rf-actions">${ongoing?docButton(ongoing,t('接續處理','Tiếp tục xử lý')+' · '+ongoing.number):''}
        ${writable&&ready?button('create-report:'+ready.id,t('填寫復測報告','Nhập báo cáo thử lại'),unavailable,true):''}
        ${writable&&item.status==='open'&&!ongoing?button('create-retest:'+item.id,t('開始復測','Bắt đầu thử lại'),unavailable)+
        (item.disposalAvailable===true||item.result==='abnormal'?button('create-disposal:'+item.id,label('disposal'),unavailable):''):''}</div>
      ${original?`<section class="ri-original-result"><h4>${t('原始報告','Báo cáo gốc')} · ${docButton(original)}</h4>
        ${inspectionForm(v,original,{inspections:rows},false,false)}</section>`:''}
      ${history.length?`<section><h4>${label('history')}</h4>${history.map(id=>{
        const doc=v.data.documents.find(row=>row.id===id);
        return doc?docButton(doc,doc.number+' · '+docState(doc)):'';
      }).join('')}</section>`:''}`;
  }
  function moduleNavigation() {
    const names=['FQC','IQC',t('模具檢查','Kiểm tra khuôn'),t('檢具與測試設備校準','Hiệu chuẩn thiết bị')];
    return `<nav class="rf-modules" aria-label="${t('例行檢查模組','Mô-đun kiểm tra định kỳ')}">${names.map((name,index)=>
      `<button type="button" class="${index===1?'active':''}" data-ri-action="module:${index}" aria-current="${index===1?'page':'false'}">${h(name)}</button>`).join('')}</nav>`;
  }
  function workflowNavigation(v) {
    const steps=['sources','plan','report'];
    const active=id=>v.tab===id?'active':'';
    const page=id=>v.tab===id?'page':'false';
    const outcome=(id,tone,icon)=>{
      const count=v.data.cases.filter(item=>item.result===id&&item.status==='open').length;
      return `<button type="button" class="rf-result-branch ${tone} ${active(id)}" data-ri-action="tab:${id}" aria-current="${page(id)}">
        <span class="rf-branch-icon" aria-hidden="true">${icon}</span><strong>${label(id)}</strong><span class="rf-flow-count">${count}</span><span aria-hidden="true">›</span></button>`;
    };
    return `<nav class="rf-calendar-flow" aria-label="${t('IQC 檢查流程','Quy trình kiểm tra IQC')}">
      <div class="rf-flow-diagram"><svg class="rf-flow-connectors" aria-hidden="true"><defs><marker id="ri-flow-return-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a55331"/></marker></defs><path class="rf-flow-return-path"/><path class="rf-flow-join-path"/></svg>
      <div class="rf-calendar-tabs">${steps.map((id,index)=>`${index?'<span class="rf-flow-arrow step" aria-hidden="true"><span>→</span><span>↓</span></span>':''}
        <button type="button" data-ri-action="tab:${id}" class="${active(id)}" aria-current="${page(id)}"><span class="rf-flow-number">${index+1}</span><span>${label(id)}</span></button>`).join('')}</div>
      <p class="rf-flow-gate"><span aria-hidden="true">↓</span> ${t('整份報告核准後，依各批結果分流','Sau khi duyệt toàn bộ báo cáo, phân nhánh theo kết quả từng lô')}</p>
      <section class="rf-calendar-results" aria-label="${t('核准結果與後續流程','Kết quả đã duyệt và bước tiếp theo')}"><div class="rf-calendar-branches">
        <article class="rf-flow-lane pass"><div class="rf-result-branch pass"><span class="rf-branch-icon" aria-hidden="true">✓</span><strong>${label('pass')}</strong></div><strong class="rf-flow-terminal">${t('該批已結案','Đã đóng lô')}</strong></article>
        <article class="rf-flow-lane fail">${outcome('fail','fail','!')}</article>
        <article class="rf-flow-lane unable">${outcome('abnormal','unable','+')}<strong class="rf-flow-terminal">${t('處置核准 → 該批結案','Duyệt xử lý → Đóng lô')}</strong></article>
      </div></section>
      <div class="rf-retest-return"><span>${t('該批復測申請核准後，回檢查報告','Sau khi duyệt thử lại lô, quay về Báo cáo kiểm tra')}</span></div></div>
      <div class="rf-actions ri-flow-actions"><details class="rf-flow-help"><summary>${t('復測與結案說明','Hướng dẫn thử lại và đóng hồ sơ')}</summary>
        <p>${t('從原批次開始復測。儲存並送審，核准後到檢查報告，沿用原 ERP 批號與數量。','Bắt đầu thử lại từ lô gốc. Lưu và gửi duyệt, sau đó nhập báo cáo theo mã ERP và số lượng gốc.')}</p>
        <p>${t('待審、退回或撤回仍留在原待辦。各批獨立結案，原結果與審核保存在流程歷史。','Hồ sơ chờ duyệt, trả lại hoặc rút vẫn ở danh sách gốc. Mỗi lô đóng riêng, kết quả gốc và lượt duyệt lưu trong lịch sử.')}</p></details>
        <button type="button" class="rf-btn ${active('history')}" data-ri-action="tab:history" aria-current="${page('history')}">${label('history')}</button></div>
    </nav>`;
  }
  function drawWorkflow(v) {
    const frame=v.root.querySelector('.rf-flow-diagram');
    if(!frame)return;
    const report=frame.querySelector('[data-ri-action="tab:report"]'), fail=frame.querySelector('.rf-flow-lane.fail');
    const abnormal=frame.querySelector('.rf-flow-lane.unable'), branches=frame.querySelector('.rf-calendar-branches'), svg=frame.querySelector('svg');
    const draw=()=>{
      if(!current(v)||!frame.isConnected)return;
      const box=frame.getBoundingClientRect();
      if(!box.width)return;
      const r=report.getBoundingClientRect(), f=fail.getBoundingClientRect(), a=abnormal.getBoundingClientRect();
      const rail=box.width-10, end=`V ${r.top-box.top+r.height/2} H ${r.right-box.left+2}`;
      let main,join;
      if(a.top>f.top+f.height/2){
        main=`M ${a.right-box.left} ${a.top-box.top+a.height/2} H ${rail} ${end}`;
        join=`M ${f.right-box.left} ${f.top-box.top+f.height/2} H ${rail}`;
      }else{
        const lower=branches.getBoundingClientRect().bottom-box.top+24;
        main=`M ${f.left-box.left+f.width/2} ${f.bottom-box.top} V ${lower} H ${rail} ${end}`;
        join=`M ${a.left-box.left+a.width/2} ${a.bottom-box.top} V ${lower}`;
      }
      svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
      svg.querySelector('.rf-flow-return-path').setAttribute('d',main);
      svg.querySelector('.rf-flow-join-path').setAttribute('d',join);
    };
    draw();
    if(window.ResizeObserver){v.flowObserver=new window.ResizeObserver(draw);v.flowObserver.observe(frame);}
  }
  function emptyStage(v) {
    if(v.review)return emptyList(t('目前沒有 IQC 待審案件','Hiện chưa có hồ sơ IQC chờ duyệt'),
      t('計畫、報告、免做、復測與處置送審後會出現在這裡。','Kế hoạch, báo cáo, miễn kỳ, thử lại và xử lý sẽ xuất hiện sau khi gửi duyệt.'));
    if(v.workState==='approved')return emptyList(t('目前沒有已核准紀錄','Hiện chưa có hồ sơ đã duyệt'),'');
    if(v.workState==='pending')return emptyList(t('目前沒有待審文件','Hiện chưa có hồ sơ chờ duyệt'),'');
    if(v.workState==='draft')return emptyList(t('目前沒有草稿','Hiện chưa có bản nháp'),'');
    if(v.tab==='plan')return emptyList(t('目前沒有待處理的檢查計畫','Hiện chưa có kế hoạch cần xử lý'),
      t('前往檢查項目勾選當期工作，再建立計畫並為各零件填寫 ERP 批號和測試數量。','Chọn công việc trong kỳ ở Hạng mục kiểm tra, sau đó lập kế hoạch và nhập lô ERP cùng số lượng thử cho mỗi linh kiện.'),
      button('tab:sources',t('前往檢查項目','Mở hạng mục kiểm tra'),false,true));
    if(v.tab==='report')return emptyList(t('目前沒有待填報告','Hiện chưa có báo cáo cần nhập'),
      t('初測計畫或復測申請核准後，就會出現可填寫的報告。','Báo cáo có thể nhập sau khi duyệt kế hoạch lần đầu hoặc đề nghị thử lại.'),
      button('tab:plan',t('查看檢查計畫','Xem kế hoạch kiểm tra')));
    if(['fail','abnormal'].includes(v.tab))return `<p class="rf-empty">${t('目前沒有待處理項目','Hiện không có hạng mục cần xử lý')}</p>`;
    return emptyList(t('目前沒有流程歷史','Hiện chưa có lịch sử quy trình'),
      t('已建立的文件、歷次結果與審核會保存在這裡。','Hồ sơ đã tạo, kết quả và các lượt duyệt được lưu ở đây.'));
  }
  function batchPart(v,item) {
    return v.data.documents.find(doc=>doc.id===item.originReportId)?.jobs
      .find(job=>job.source.iqc.partId===item.batch.partId)?.source.products[0]?.code || '';
  }
  function documentFilters(v,queue,waiting) {
    const filters=[['',v.tab==='plan'?t('全部','Tất cả'):t('全部待辦','Tất cả việc cần xử lý'),
      v.tab==='plan'?queue.length:queue.filter(activeDoc).length+waiting.length],
      ['draft',label('draft'),queue.filter(doc=>doc.status==='draft').length],
      ['pending',label('pending'),queue.filter(doc=>doc.status==='pending').length]];
    if(permissions(v).history)filters.push(['approved',v.tab==='report'?t('已核准報告歷史','Lịch sử báo cáo đã duyệt'):
      t('已核准歷史','Lịch sử đã duyệt'),queue.filter(doc=>doc.status==='approved').length]);
    return `<nav class="rf-calendar-tools rf-work-states" aria-label="${t('文件狀態','Trạng thái hồ sơ')}">${filters.map(([key,title,count])=>
      `<button type="button" class="rf-btn ${v.workState===key?'primary':''}" data-ri-action="work:${key}" aria-pressed="${v.workState===key}">${h(title)} · ${count}</button>`).join('')}</nav>`;
  }
  const canConfigure=v=>v.data.identity.role==='admin'&&permissions(v).settings&&permissions(v).edit;
  const startLocked=v=>v.data.startLocked??!!(v.data.documents.length||v.data.cases.length||
    v.data.jobs.some(job=>job.planId||job.completion||job.calendar?.stopped));
  const receiptNotice=()=>t('請先查上一筆操作結果。','Kiểm tra biên nhận trước.');
  function administration(v){
    if(!canConfigure(v))return '';
    const locked=startLocked(v),busy=!!v.pending||v.busy||edited(v);
    return `<details class="rf-fqc-administration" ${v.adminOpen?'open':''}><summary>${t('IQC 特殊功能','Chức năng đặc biệt IQC')}</summary>
      <p>${t('開始日期','Ngày bắt đầu')}：${h(v.data.startDate||t('尚未啟動','Chưa bắt đầu'))}</p>
      <p>${t('僅管理例行 IQC 流程，保留來源主檔、頻率、照片及其他模組。','Chỉ quản lý IQC định kỳ, giữ dữ liệu nguồn, tần suất, ảnh và mô-đun khác.')}</p>
      <div class="rf-actions"><button type="button" class="rf-btn" data-ri-action="configure" aria-haspopup="dialog" ${locked||busy?'disabled':''}>${locked?
        t('已啟動 · 日期鎖定','Đã khởi động · Khóa ngày'):t('設定開始日期並啟動','Đặt ngày bắt đầu và khởi động')}</button>
      </div>${locked?`<small>${errorText('START_DATE_LOCKED')}</small>`: ''}</details>`;
  }
  function checkAdministration(v) {
    if(v.review||!canConfigure(v))throw Error('FORBIDDEN');
    if(v.pending)throw Error(receiptNotice());
    if(edited(v))throw Error(t('請先儲存或取消目前修改。','Hãy lưu hoặc hủy thay đổi hiện tại.'));
    if(startLocked(v))throw Error('START_DATE_LOCKED');
  }
  async function administer(v) {
    checkAdministration(v);
    const {revision,stateRevision,today,startDate}=v.data;
    if(!Number.isSafeInteger(stateRevision))throw Error('REVISION_CONFLICT');
    const startScope=`<p>${t('依已核准且啟用的 IQC 主檔與標準時間頻率安排工作。起始日所在週期為第一期，不補建更早期別。','Lập lịch theo dữ liệu IQC đã duyệt, đang bật và có tần suất định kỳ chuẩn. Kỳ chứa ngày bắt đầu là kỳ đầu tiên; không lập bù kỳ trước.')}</p>
      <label>${t('開始日期','Ngày bắt đầu')}<input name="start" type="date" required value="${h(startDate||today)}"></label>`;
    const modal=document.createElement('dialog');
    modal.className='rf-modal ri-selection-dialog ri-admin-dialog';
    modal.setAttribute('aria-labelledby','ri-admin-title');
    modal.innerHTML=`<form method="dialog">
      <h2 id="ri-admin-title">${t('設定 IQC 開始日期','Đặt ngày bắt đầu IQC')}</h2>
      ${startScope}
      <label>${t('操作原因','Lý do thao tác')}<textarea name="reason" maxlength="2000" required></textarea></label>
      <label class="rf-confirm-ack"><input type="checkbox" name="ack" value="yes" required><span>${t('我已核對開始日期與適用來源，確認啟動 IQC 排程','Tôi đã kiểm tra ngày bắt đầu và nguồn áp dụng, xác nhận khởi động lịch IQC')}</span></label>
      <label>${t('確認文字（請完整輸入）','Chuỗi xác nhận (nhập chính xác)')} <strong>${startToken}</strong>
        <input name="confirm" required pattern="${startToken}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="ri-admin-help"></label>
      <p id="ri-admin-help" class="rf-confirm-help" role="status"></p>
      <div class="rf-actions"><button class="rf-btn" value="cancel" formnovalidate autofocus>${t('取消，不變更資料','Hủy, không thay đổi dữ liệu')}</button>
        <button class="rf-btn primary" value="confirm" disabled>${t('確認執行','Xác nhận thực hiện')}</button></div></form>`;
    const form=modal.querySelector('form'), fields=form.elements;
    const update=()=>{
      const missing=[];
      if(!fields.start.value)missing.push(t('選擇開始日期','Chọn ngày bắt đầu'));
      if(!fields.reason.value.trim())missing.push(t('填寫操作原因','Điền lý do thao tác'));
      if(!fields.ack.checked)missing.push(t('勾選確認開始日期與排程範圍','Đánh dấu xác nhận ngày bắt đầu và phạm vi lịch'));
      if(fields.confirm.value!==startToken)missing.push(t('完整輸入確認文字','Nhập chính xác chuỗi xác nhận'));
      form.querySelector('[value="confirm"]').disabled=missing.length>0;
      form.querySelector('#ri-admin-help').textContent=missing.join(' · ');
    };
    form.addEventListener('input',update);update();
    v.root.append(modal);modal.showModal();v.adminDialog=modal;
    const accepted=await new Promise(resolve=>modal.addEventListener('close',()=>resolve(modal.returnValue==='confirm'),{once:true}));
    v.adminDialog=null;
    const reason=fields.reason.value.trim(),confirm=fields.confirm.value,ack=fields.ack.checked,start=fields.start?.value;
    modal.remove();
    if(!accepted||!current(v))return;
    if(v.data.revision!==revision||v.data.stateRevision!==stateRevision)throw Error('REVISION_CONFLICT');
    checkAdministration(v);
    if(!reason||confirm!==startToken||!ack||!start)throw Error('IQC_START_CONFIRMATION_REQUIRED');
    await write(v,'configure',{scope:'routine-iqc-only',expectedStateRevision:stateRevision,reason,confirm,startAck:ack,start});
  }
  function render(v) {
    if(!current(v))return;
    v.flowObserver?.disconnect();
    const moduleNav=moduleNavigation();
    if(!v.data){
      v.root.innerHTML=`${moduleNav}<p class="rf-empty" role="${v.error?'alert':'status'}">${h(v.error||t('載入 IQC…','Đang tải IQC…'))}</p>`;
      return;
    }
    if(v.reloadNeeded){
      v.root.innerHTML=`${moduleNav}<p role="status">${t('操作已確認。請更新清單以查看結果。','Đã xác nhận thao tác. Hãy tải lại danh sách để xem kết quả.')}</p>
        ${v.error?`<p class="rf-notice error" role="alert">${h(v.error)}</p>`:''}
        ${button('refresh',t('重新整理','Tải lại'),v.busy)}`;
      return;
    }
    const data=v.data,doc=docOf(v), cached=data.documents, p=permissions(v), pending=cached.filter(doc=>doc.status==='pending');
    const planDocs=cached.filter(doc=>!doc.cancelledAt&&
      (doc.kind==='plan'||doc.kind==='retest-plan'&&doc.status==='approved'));
    const reports=cached.filter(doc=>!doc.cancelledAt&&reportKind(doc));
    const cases=data.cases.filter(item=>item.result===v.tab&&item.status==='open');
    const scoped=v.tab==='plan'||v.tab==='report';
    const queue=v.tab==='plan'?planDocs:reports;
    const waiting=v.tab==='report'&&!v.review?planDocs.filter(doc=>bookReport(v,doc)):[];
    const ready=!v.workState?waiting:[];
    const retainsKind=doc=>!v.reviewKind||doc.kind===v.reviewKind;
    const reviewRows=pending.filter(retainsKind);
    const rows=scoped?queue.filter(doc=>v.workState?doc.status===v.workState:activeDoc(doc)):cached;
    const searchApproved=v.tab==='report'&&v.workState==='approved'&&!v.review;
    const approvalTime=doc=>doc.flow.cases.find(review=>review.id===doc.flow.active.id)?.result?.at||'';
    const list=searchApproved?rows.filter(row=>matchesQuery([row.number,cached.find(plan=>plan.id===row.planId)?.number,
      ...row.jobs.flatMap(job=>[job.source.name,job.source.code,...job.source.products.flatMap(part=>[part.code,part.name])])].join(' '),v.reportQuery)).sort((a,b)=>approvalTime(b).localeCompare(approvalTime(a))||b.number.localeCompare(a.number)):rows;
    const approvedSearch=searchApproved?`<form class="rf-approved-list" data-ri-report-search><label>${t('搜尋報告、計畫、檢查項目或零件','Tìm báo cáo, kế hoạch, hạng mục hoặc linh kiện')}
      <input type="search" name="query" value="${h(v.reportQuery)}"></label><button class="rf-btn" type="submit">${t('搜尋','Tìm')}</button>
      <p role="status">${t('符合報告','Báo cáo phù hợp')} · ${list.length}</p></form>`:'';
    const reviewKinds=['','plan','report','retest-plan','retest-report','waiver','disposal'];
    const filters=v.review?`<nav class="rf-kind-tabs ri-work-filters" aria-label="${t('文件類型','Loại hồ sơ')}">${reviewKinds.map(kind=>
      `<button type="button" class="rf-btn ${v.reviewKind===kind?'primary':''}" data-ri-action="review-kind:${kind}" aria-pressed="${v.reviewKind===kind}">
        ${kind?label(kind):t('全部','Tất cả')} · ${pending.filter(doc=>!kind||doc.kind===kind).length}</button>`).join('')}</nav>`:
      (scoped?documentFilters(v,queue,waiting):'')+approvedSearch;
    const docCard=row=>{
      const snapshot=content(row),sourcePlan=reportKind(row)&&cached.find(plan=>plan.id===row.planId);
      const partCodes=[...new Set(row.jobs.flatMap(job=>job.source.products.map(part=>part.code)))];
      const action=searchApproved||v.tab==='history'&&!v.review?'history-doc':'doc';
      return `<section class="rf-family-entry"><button type="button" class="rf-calendar-document ${doc?.id===row.id?'selected':''}" data-ri-action="${action}:${h(row.id)}">
        <span class="rf-calendar-doc-top"><strong>${h(row.number)}</strong>${docStatusTag(row)}</span>
        ${sourcePlan?`<small>${t('來源計畫','Kế hoạch nguồn')} · ${h(sourcePlan.number)}</small>`:''}
        <span>${h(label(row.kind))} · ${row.jobs.length} ${t('項','hạng mục')}</span>
        ${snapshot.title&&snapshot.title!==row.number?`<span>${h(snapshot.title)}</span>`:''}
        ${snapshot.start?`<small class="rf-card-date">${h(snapshot.start)} — ${h(snapshot.end)}</small>`:''}
        <small>${h(partCodes.join(' / '))}</small></button>
        ${row.createdAt||reportKind(row)&&snapshot.date?`<div class="rf-card-meta">
          ${row.createdAt?`<small>${t('建立','Tạo')} · ${h(documentTime(row.createdAt))}</small>`:''}
          ${reportKind(row)&&snapshot.date?`<small>${t('檢查日期','Ngày kiểm tra')} · ${h(snapshot.date)}</small>`:''}</div>`:''}
        ${searchApproved&&approvalTime(row)?`<small>${t('核准時間','Duyệt lúc')} · ${h(approvalTime(row))}</small>`:''}</section>`;
    };
    const documentGroups=()=>{
      if(!scoped||searchApproved)return list.map(docCard).join('');
      const groups=new Map();
      for(const row of list){
        const origin=data.cases.find(item=>item.id===row.caseId)?.originReportId||row.id;
        if(!groups.has(origin))groups.set(origin,[]);
        groups.get(origin).push(row);
      }
      return [...groups].reverse().map(([id,rows])=>{
        const original=cached.find(row=>row.id===id&&row.kind==='report');
        const initial=rows.filter(row=>!row.caseId),retests=rows.filter(row=>row.caseId);
        return `<article class="rf-document-family">${retests.length?`<header><b>${t('初測與再測','Lần đầu và thử lại')}</b>
          ${original?button('history-doc:'+id,t('初測來源（查看）','Nguồn lần đầu (xem)')+' · '+original.number):''}</header>`:''}
          ${initial.map(docCard).join('')}${retests.length?`<details open><summary>${t('再測及後續文件','Thử lại và hồ sơ tiếp theo')} · ${retests.length}</summary>
          ${retests.map(docCard).join('')}</details>`:''}</article>`;
      }).join('');
    };
    const caseCard=item=>{
      const source=cached.find(row=>row.id===item.originReportId);
      const job=data.jobs.find(job=>item.jobIds.includes(job.id));
      return `<button type="button" class="rf-calendar-document ${v.target===item.id||doc?.caseId===item.id?'selected':''}" data-ri-action="case:${h(item.id)}">
        <strong>${source?h(source.number):batchLabel(item.batch)}</strong>
        ${job?`<span>${h(job.source.name)}</span>`:''}
        <small>${h([batchPart(v,item),job&&periodCaption(job)].filter(Boolean).join(' · '))}</small>
        <span>${h(label(item.result)+' · '+caseStage(v,item))}</span>
        ${source?`<small>${batchLabel(item.batch)}</small>`:''}</button>`;
    };
    const cards=v.review?((reviewRows.map(docCard).join('')||emptyStage(v))+
      (p.history?`<details class="rf-review-history" data-ri-panel="review" ${v.reviewHistory?'open':''}>
        <summary>${t('已處理與歷史','Đã xử lý và lịch sử')}</summary>${cached.filter(row=>row.status!=='pending'&&retainsKind(row)).slice().reverse().map(docCard).join('')||
          `<p>${t('目前沒有審核歷史','Chưa có lịch sử duyệt')}</p>`}</details>`:'')):
      ['fail','abnormal'].includes(v.tab)?cases.map(caseCard).join('')||emptyStage(v):
      v.tab==='sources'?'':ready.map(plan=>`<button type="button" class="rf-calendar-document rf-report-ready" data-ri-action="create-report:${h(plan.id)}" ${canArrange(v)?'':'disabled'}>
        <strong>${t('待填寫報告','Chờ nhập báo cáo')}</strong><span>${h(plan.number)} · ${h(label(plan.kind))}</span></button>`).join('')+documentGroups();
    v.root.innerHTML=`<header class="rf-calendar-hero"><div><span>IQC · ${t('例行品質管理','Quản lý chất lượng định kỳ')}</span><h2>${v.review?t('例行 IQC 送審','Duyệt IQC định kỳ'):t('例行 IQC 檢查','Kiểm tra IQC định kỳ')}</h2></div>
      ${!v.review?administration(v):''}</header>
      ${moduleNav}
      <div class="rf-main rf-calendar">
      ${!v.review?workflowNavigation(v):''}
      ${v.error?`<p class="rf-notice error" role="alert">${h(v.error)}</p>`:''}
      ${v.pending&&!v.busy?`<p class="rf-notice" role="status">${t('操作結果待確認。','Chưa xác định kết quả thao tác.')} ${button('receipt',t('查原操作回執','Kiểm tra biên nhận'))}</p>`:''}
      <div class="ri-work-context"><p class="rf-subtle">${v.review?`${t('IQC 待審案件','Hồ sơ IQC chờ duyệt')} · ${pending.length}`:
        `${t('有效 IQC 主檔','Nguồn IQC hiện hành')} · V${h(data.catalog.version||'—')} · ${data.catalog.items.length} ${t('個時間檢查規則','quy tắc theo thời gian')}`}</p>
        ${button('refresh',t('重新整理','Tải lại'))}</div>
      ${!v.review&&v.tab==='sources'&&!doc&&!v.target?jobList(v):filters+(!cards&&!doc&&!v.target?emptyStage(v):
        `<div class="rf-layout ${doc||v.target?'has-selection':''}"><section class="rf-panel rf-list-panel"><div class="rf-calendar-document-list">${cards}</div></section>
        <section class="rf-panel rf-detail-panel"><div class="rf-detail">${doc||v.target?button('back',v.listReturn?.tab==='sources'||doc?.kind==='waiver'&&!v.review?t('返回檢查項目','Về hạng mục kiểm tra'):t('返回清單','Về danh sách')):''}
          ${doc?documentDetail(v,doc):v.target?caseDetail(v,data.cases.find(item=>item.id===v.target)):
            `<div class="rf-empty"><span class="rf-icon">▤</span><b>${t('選擇一筆工作開始','Chọn một hồ sơ')}</b>${t('明細、照片與歷史會顯示在這裡','Chi tiết, hình ảnh và lịch sử hiển thị tại đây')}</div>`}</div></section></div>`)}</div>`;
    if(!v.review)drawWorkflow(v);
    if(v.busy)v.root.querySelectorAll('button:not([data-ri-action^="module:"]),input,select,textarea').forEach(el=>el.disabled=true);
  }
  function draftFor(v) {
    const doc=docOf(v);if(!doc||doc.status!=='draft'||doc.expired||v.review||v.readOnly||!permissions(v).edit)return null;
    if(!v.draft){v.base=structuredClone(content(doc));v.draft=structuredClone(v.base);}
    return v.draft;
  }
  function draftValid(doc,c) {
    if(doc.kind==='plan'){
      const seen=new Set();
      for(const lot of c.lots){
        const id=batchKey({...lot,batchNo:lot.batchNo.trim()});
        if(lot.batchNo.trim()&&seen.has(id))throw Error('IQC_DUPLICATE_LOT');
        if(lot.quantity!==null&&(!Number.isSafeInteger(lot.quantity)||lot.quantity<1))throw Error('IQC_LOTS_INVALID');
        seen.add(id);
      }
    }
  }
  async function confirmSubmission(v,doc,opener) {
    const {saved,revision,generation}=doc.flow;
    const modal=document.createElement('dialog');
    modal.className='rf-modal ri-submit-dialog';
    modal.setAttribute('aria-labelledby','ri-submit-title');
    modal.setAttribute('aria-describedby','ri-submit-note');
    modal.setAttribute('data-i18n-skip','true');
    modal.innerHTML=`<form method="dialog">
      <div class="ri-submit-content"><h2 id="ri-submit-title">${t('確認送審','Xác nhận gửi duyệt')}</h2>
        <p id="ri-submit-note">${t('將送出已儲存的版本供審核。','Bản đã lưu sẽ được gửi để duyệt.')}</p>
        <dl>
          <div><dt>${t('文件編號','Số hồ sơ')}</dt><dd>${h(doc.number)}</dd></div>
          <div><dt>${t('儲存者','Người lưu')}</dt><dd>${h(saved.actor?.name||'—')}</dd></div>
          <div><dt>${t('儲存時間','Giờ lưu')}</dt><dd>${h(documentTime(saved.at)||'—')}</dd></div>
        </dl>
      </div>
      <div class="rf-actions"><button type="submit" class="rf-btn" value="cancel" autofocus>${t('取消','Hủy')}</button>
        <button type="submit" class="rf-btn primary" value="confirm">${t('確認送審','Xác nhận gửi duyệt')}</button></div></form>`;
    v.adminDialog=modal;
    let accepted;
    try{
      accepted=await new Promise(resolve=>{
        modal.addEventListener('close',()=>resolve(modal.returnValue==='confirm'),{once:true});
        v.root.append(modal);
        modal.showModal();
      });
    }finally{
      if(v.adminDialog===modal)v.adminDialog=null;
      modal.remove();
      if(opener?.isConnected)opener.focus({preventScroll:true});
    }
    if(!accepted||!current(v))return false;
    const latest=docOf(v);
    if(latest?.id!==doc.id||latest.status!=='draft'||!permissions(v).submit||latest.flow.saved?.id!==saved.id||
      latest.flow.revision!==revision||latest.flow.generation!==generation||edited(v))throw Error('REVISION_CONFLICT');
    return true;
  }
  function updateDecisionControls(v){
    const doc=docOf(v),review=doc&&pendingDoc(v,doc);
    if(!v.review||!review)return;
    const self=review.actor.id===v.data.identity.id;
    const ready=!v.busy&&!v.pending&&(!self||v.data.identity.role==='admin'&&v.root.querySelector('[data-ri-self]')?.checked);
    const approve=v.root.querySelector('[data-ri-action="approve"]'),sendBack=v.root.querySelector('[data-ri-action="return"]');
    if(approve)approve.disabled=!ready||!permissions(v).approve;
    if(sendBack)sendBack.disabled=!ready||!permissions(v).return||!v.root.querySelector('[data-ri-return-reason]')?.value.trim();
  }
  async function act(v,action,control) {
    const [kind,...tail]=action.split(':'), id=tail.join(':'), doc=docOf(v);
    if(kind==='open-master'){
      if(window.hasPermission?.('iqc.view'))await window.ProcessDeliveryNavigation?.navigate?.('data','quality-iqc','quality');
      return;
    }
    if(kind==='clear-period-filters'){
      v.search=v.periodFrom=v.periodTo=v.outcome=v.category=v.supplier=v.part='';v.periodPages.clear();render(v);return;
    }
    if(['toggle-group','toggle-older','more-periods','close-older'].includes(kind)){
      const target=kind==='close-older'?'toggle-older:'+id:kind==='more-periods'?(periodFiltersActive(v)?'toggle-group:':'toggle-older:')+id:action;
      const find=()=>[...v.root.querySelectorAll?.('[data-ri-action]')||[]].find(el=>el.dataset.riAction===target);
      const restore=window.RoutineFQCUI.keepListAnchor?.(kind==='more-periods'?find():control,find);
      if(kind==='more-periods')v.periodPages.set(id,(v.periodPages.get(id)||6)+6);
      else{
        const set=kind==='toggle-group'?v.openGroups:v.openOlder;
        if(kind==='close-older'||set.has(id))set.delete(id);else set.add(id);
      }
      render(v);
      restore?.();
      return;
    }
    if(kind==='waive-period'){
      const job=v.data.jobs.find(job=>job.id===id);
      if(!canArrange(v)||!canExempt(job,v))throw Error('IQC_WORK_NOT_AVAILABLE');
      rememberIqcList(v,control);
      await write(v,'create-waiver',{jobIds:[job.id]});
      if(docOf(v))window.RoutineFQCUI.revealRoutineDetail?.(v.root);
      return;
    }
    if(kind==='review-kind'){show(v,null);v.reviewKind=id;render(v);return;}
    if(kind==='toggle-hidden-picks'){
      v.showHidden=!v.showHidden;render(v);v.root.querySelector('[data-ri-action="toggle-hidden-picks"]')?.focus();return;
    }
    if(['clear-picks','clear-hidden-picks','remove-pick'].includes(kind)){
      const count=()=>v.root.querySelector('[data-ri-pick-count]');
      const focus=()=>v.root.querySelector('[data-ri-action="toggle-hidden-picks"]')||v.root.querySelector('[data-ri-filter="part"]');
      const restore=window.RoutineFQCUI.keepListAnchor?.(count(),count,focus);
      if(kind==='clear-picks')v.checked.clear();
      else if(kind==='clear-hidden-picks')for(const job of hiddenSelections(v))v.checked.delete(job.id);
      else v.checked.delete(id);
      if(!hiddenSelections(v).length)v.showHidden=false;
      render(v);
      if(restore)restore();else focus()?.focus({preventScroll:true});
      return;
    }
    if(kind==='doc'||kind==='history-doc')return show(v,id,kind==='history-doc',control);
    if(kind==='back'){
      if(!leaveIqcDetail(v))return;
      const origin=v.listReturn;v.listReturn=null;
      if(origin){v.tab=origin.tab;v.workState=origin.workState;}
      render(v);origin?.restore();return;
    }
    if(kind==='tab'||kind==='work'){
      if(kind==='work'&&id==='approved'&&!permissions(v).history||!leaveIqcDetail(v))return;
      v.listReturn=null;
      if(kind==='tab'){v.tab=id;v.workState='';}else v.workState=id;
      render(v);return;
    }
    if(kind==='case'){
      const target=v.data.cases.find(item=>item.id===id);
      if(!target)return;
      if(!leaveIqcDetail(v))return;
      rememberIqcList(v,control);
      v.target=id;
      if(!v.review&&target.status==='open'){v.tab=target.result;v.workState='';}
      render(v);
      window.RoutineFQCUI.revealRoutineDetail?.(v.root);
      return;
    }
    if(kind==='review'){
      if(!window.RoutineFQCUI.navigation.canLeave()||window.ProcessDeliveryNavigation?.pending?.())
        throw Error(t('先處理保留中的工作，再前往版本確認平台。','Hoàn tất công việc đang giữ trước khi mở nền tảng duyệt.'));
      const target=route(true,true);target.searchParams.set('riDocument',id);location.assign(target);return;
    }
    if(kind==='receipt'){
      v.busy=true;
      try{
        const result=await call(v,endpoint+'?operationId='+encodeURIComponent(v.pending));
        confirmWrite(v,result.result);v.draft=v.base=null;
        await load(v);
      }catch(error){
        v.error=v.pending&&error.status===404?t('目前尚無回執。重新整理可查看最新文件；請勿重送原操作。','Chưa có biên nhận. Tải lại để xem hồ sơ mới nhất; không gửi lại thao tác.'):errorText(error.message);
      }finally{v.busy=false;render(v);}
      return;
    }
    if(kind==='refresh'){await load(v);if(v.data.scheduleDue&&permissions(v).edit&&!edited(v)&&!v.pending)await write(v,'generate');return;}
    if(kind==='configure'){await administer(v);return;}
    if(kind==='create-plan'||kind==='create-waiver'){
      const eligible=kind==='create-waiver'?canExempt:available;
      const jobs=selections(v).filter(job=>eligible(job,v));
      if(!canArrange(v)||!jobs.length||jobs.length!==v.checked.size)throw Error('IQC_WORK_NOT_AVAILABLE');
      const hidden=jobs.filter(job=>!matchesFilters(job,v));
      if(kind==='create-waiver'&&!hidden.length){await write(v,kind,{jobIds:jobs.map(job=>job.id)});return;}
      const byDate=(a,b)=>a.localeCompare(b);
      const start=[v.data.today,...jobs.map(job=>job.start)].sort(byDate).at(-1),end=jobs.map(job=>job.end).sort(byDate)[0];
      const dates=`<label>${t('檢查起日','Ngày bắt đầu')}<input type="date" name="start" required value="${h(start)}" min="${h(start)}" max="${h(end)}"></label>
        <label>${t('檢查迄日','Ngày kết thúc')}<input type="date" name="end" required value="${h(end)}" min="${h(start)}" max="${h(end)}"></label>`;
      const form=document.createElement('dialog');
      form.className='rf-modal ri-selection-dialog';
      form.setAttribute('aria-labelledby','ri-selection-title');
      form.innerHTML=`<form method="dialog"><h3 id="ri-selection-title">${kind==='create-plan'?t('確認檢查計畫項目','Xác nhận hạng mục lập kế hoạch'):label('waiver')}</h3>
        <p>${t('以下全部','Toàn bộ')} <b>${jobs.length}</b> ${t('項都會送入本次作業。','hạng mục dưới đây sẽ được đưa vào thao tác này.')}
        ${hidden.length?` ${t('其中','Trong đó có')} <b>${hidden.length}</b> ${t('項不在目前篩選結果。','hạng mục ngoài kết quả lọc hiện tại.')}`:''}</p>
        <ul class="ri-pick-list">${jobs.map(job=>`<li>${jobIdentity(job)}<span>${periodOf(job)}</span>
          ${matchesFilters(job,v)?'':`<small class="ri-hidden-pick-tag">${t('不在目前結果','Ngoài kết quả hiện tại')}</small>`}</li>`).join('')}</ul>
        ${kind==='create-plan'?dates:''}
        <div class="rf-actions"><button class="rf-btn" value="cancel" formnovalidate autofocus>${t('返回調整','Quay lại điều chỉnh')}</button>
        <button class="rf-btn primary" value="confirm">${kind==='create-plan'?t('確認建立計畫','Xác nhận lập kế hoạch'):t('確認建立申請','Xác nhận tạo đề nghị')}</button></div></form>`;
      v.root.append(form);form.showModal();
      const chosen=await new Promise(resolve=>form.addEventListener('close',()=>{
        const values=new FormData(form.querySelector('form'));
        resolve(form.returnValue==='confirm'?Object.fromEntries(values):null);
      },{once:true}));
      form.remove();
      if(chosen&&current(v)){
        if(!canArrange(v)||jobs.length!==v.checked.size||jobs.some(job=>!v.checked.has(job.id)||
          !eligible(v.data.jobs.find(next=>job.id===next.id),v)))throw Error('IQC_WORK_NOT_AVAILABLE');
        await write(v,kind,{jobIds:jobs.map(job=>job.id),...chosen});
      }
      return;
    }
    if(kind==='create-report')return write(v,kind,{documentId:id});
    if(kind==='create-retest'||kind==='create-disposal')return write(v,kind,{caseId:id});
    if(kind==='dispose-draft'){if(confirm(t('確定捨棄這份草稿？','Bỏ bản nháp này?')))await write(v,kind,{documentId:doc.id});return;}
    if(kind==='add-lot'||kind==='remove-lot'||kind==='remove-photo'){
      const c=draftFor(v);if(!c)return;
      if(kind==='add-lot')c.lots.push({partId:id,batchNo:'',quantity:null});
      if(kind==='remove-lot')c.lots.splice(Number(id),1);
      if(kind==='remove-photo'){const row=c.inspections.find(row=>row.id===tail[0]);row.photos=row.photos.filter(photo=>photo!==tail[1]);}
      render(v);return;
    }
    if(kind==='inspection-outcome'){
      const choice=tail.at(-1), rowId=tail.slice(0,-1).join(':');
      const clearing=choice==='clear', outcome=clearing?'':choice;
      if(!clearing&&!inspectionOutcomes.includes(outcome))return;
      const row=draftFor(v)?.inspections.find(item=>item.id===rowId);
      if(!row||row.outcome===outcome)return;
      const find=(selector)=>[...v.root.querySelectorAll?.('[data-ri-inspection]')||[]].find(item=>item.dataset.riInspection===rowId)
        ?.querySelector(selector);
      const anchor=()=>find(clearing?'[data-ri-action$=":clear"]':`[data-outcome="${outcome}"]`);
      const focus=()=>clearing?find('[data-outcome]'):anchor();
      const restore=window.RoutineFQCUI.keepListAnchor?.(control,anchor,focus);
      row.outcome=outcome;render(v);
      if(restore)restore();else focus()?.focus({preventScroll:true});
      return;
    }
    if(kind==='save'){
      const c=draftFor(v)||content(doc);draftValid(doc,c);
      const keys={plan:['title','notes','lots'],report:['title','date','notes','reason','inspections'],'retest-plan':['title','notes','reason','start','end'],
        'retest-report':['title','date','notes','reason','inspections'],disposal:['reason','disposition','notes','photos'],waiver:['reason','notes']}[doc.kind];
      await write(v,'draft',{fields:Object.fromEntries(keys.map(key=>[key,c[key]]))},'save');return;
    }
    if(kind==='submit'){
      if(edited(v))throw Error(t('請先儲存修改。','Lưu thay đổi trước.'));
      if(!doc.flow.saved||doc.savedIssues.length)throw Error(doc.savedIssues[0]?.code||'SAVE_REQUIRED');
      if(await confirmSubmission(v,doc,control)){
        await write(v,'draft',{},'submit');
        if(current(v)&&docOf(v)?.id===doc.id)v.root.querySelector('[data-ri-action^="review:"]')?.focus({preventScroll:true});
      }
      return;
    }
    if(['approve','withdraw','return'].includes(kind)){
      const review=pendingDoc(v,doc), self=review?.actor.id===v.data.identity.id;
      if(kind!=='withdraw'&&self&&!v.root.querySelector('[data-ri-self]')?.checked)throw Error(t('請勾選確認自審。','Xác nhận tự duyệt.'));
      const reason=kind==='return'?v.root.querySelector('[data-ri-return-reason]')?.value.trim():'';
      if(kind==='return'&&!reason)throw Error(t('發回必須說明需修正內容','Trả lại cần mô tả nội dung cần sửa'));
      await write(v,'draft',{draft:{...(reason?{reason}:{}),...(self&&kind==='approve'?{selfReviewConfirmed:true}:{})}},kind);
    }
  }
  function bind(v) {
    v.root.addEventListener('click', event=>{
      const control=event.target.closest('[data-ri-action]');
      if(!control||control.disabled)return;
      if(control.tagName==='A')event.preventDefault();
      const action=control.dataset.riAction;
      if(action.startsWith('module:')){
        if(!workspace?.iqc.contains(v.root))return;
        const index=action.slice('module:'.length);
        if(index==='1')return;
        const pair=workspace;
        const ready=switchModule(pair,'fqc');
        if(index!=='0')void Promise.resolve(ready).then(()=>{
          if(!mountedCurrent(pair)||pair.active!=='fqc')return;
          const selector=pair.review?'data-review-module':'data-module';
          pair.fqc.querySelector(`[${selector}="${index}"]`)?.click();
        });
        return;
      }
      if(v.busy||v.adminDialog)return;
      v.error='';
      act(v,action,control).catch(error=>{if(current(v)){v.error=errorText(error.details?.issues?.[0]?.code||error.message);render(v);}});
    });
    v.root.addEventListener('toggle',event=>{
      if(event.target.dataset.riPanel==='review')v.reviewHistory=event.target.open;
      if(event.target.classList?.contains('rf-fqc-administration'))v.adminOpen=event.target.open;
      const period=event.target.dataset.riPeriodHistory;
      if(period&&event.target.isConnected){
        if(event.target.open)v.openHistories.add(period);else v.openHistories.delete(period);
      }
    },true);
    v.root.addEventListener('change',event=>{
      const el=event.target, data=el.dataset;
      if(data.riSelf!==undefined)updateDecisionControls(v);
      if(data.riFilter!==undefined){
        v[data.riFilter]=el.value;
        if(['category','supplier'].includes(data.riFilter)&&v.part&&
          !v.data.jobs.some(job=>inPartScope(job,v)&&job.source.iqc.partId===v.part))v.part='';
        render(v);
        v.root.querySelector(`[data-ri-filter="${data.riFilter}"]`)?.focus({preventScroll:true});
      }
      if(data.riPick!==undefined){
        const find=()=>[...v.root.querySelectorAll?.('[data-ri-pick]')||[]].find(input=>input.dataset.riPick===data.riPick);
        const restore=window.RoutineFQCUI.keepListAnchor?.(el,find);
        const job=v.data.jobs.find(row=>row.id===data.riPick);
        if(el.checked&&available(job,v)&&canArrange(v))v.checked.add(data.riPick);
        else if(!el.checked)v.checked.delete(data.riPick);
        v.removedPicks=0;render(v);
        if(restore)restore();else find()?.focus({preventScroll:true});
      }
      if(data.riPhoto!==undefined&&el.files?.[0]){
        const c=draftFor(v);if(!c)return;
        const file=el.files[0], target=data.riPhoto, owner=v.doc;
        v.busy=true;
        call(v,endpoint+'/photo',{method:'PUT',headers:{'Content-Type':file.type},body:file}).then(result=>{
          if(v.doc!==owner)return;
          const album=target==='document'?c.photos:c.inspections.find(row=>row.id===target).photos;
          if(!album.includes(result.id))album.push(result.id);
        }).catch(error=>{v.error=errorText(error.message);}).finally(()=>{v.busy=false;if(current(v))render(v);});
      }
    });
    v.root.addEventListener('submit',event=>{
      const form=event.target;
      if(form.matches('[data-ri-period-search]')){
        event.preventDefault();
        const {search,periodFrom,periodTo,outcome}=form.elements;
        if(periodFrom.value&&periodTo.value&&periodFrom.value>periodTo.value){
          const error=form.querySelector('[data-ri-period-error]');
          error.textContent=t('期別起日不得晚於迄日。','Ngày đầu kỳ không được sau ngày cuối kỳ.');error.hidden=false;return;
        }
        Object.assign(v,{search:search.value,periodFrom:periodFrom.value,periodTo:periodTo.value,outcome:outcome.value});
        v.periodPages.clear();render(v);
        v.root.querySelector('[data-ri-period-search] [name="search"]')?.focus({preventScroll:true});
        return;
      }
      if(!form.matches('[data-ri-report-search]'))return;
      event.preventDefault();
      v.reportQuery=event.target.elements.query.value;
      render(v);
      v.root.querySelector('[data-ri-report-search] input')?.focus({preventScroll:true});
    });
    v.root.addEventListener('input',event=>{
      const el=event.target, d=el.dataset;
      if(d.riReturnReason!==undefined){updateDecisionControls(v);return;}
      if(d.riField===undefined&&d.riLot===undefined&&d.riResult===undefined)return;
      const c=draftFor(v);if(!c)return;
      if(d.riField!==undefined)c[d.riField]=el.value;
      if(d.riField==='date'){
        const reason=v.root.querySelector('[data-ri-overdue-reason]');
        if(reason)reason.hidden=!reportNeedsLateReason(c,v.data.today);
      }
      if(d.riLot!==undefined)c.lots[d.riLot][d.riKey]=d.riKey==='quantity'?(el.value===''?null:el.valueAsNumber):el.value;
      if(d.riResult!==undefined)c.inspections.find(row=>row.id===d.riResult)[d.riKey]=el.value;
    });
  }
  async function mount(container,review) {
    const root=container.matches?.('.ri-app')?container:container.querySelector('.ri-app');
    if(!root)return;
    const v={root,review,owner:owner(),client:crypto.randomUUID(),sequence:0,
      data:null,tab:'sources',doc:review?new URL(location.href).searchParams.get('riDocument'):null,target:null,
      checked:new Set(),openGroups:new Set(),openOlder:new Set(),openHistories:new Set(),periodPages:new Map(),workState:'',category:'',supplier:'',part:'',search:'',periodFrom:'',periodTo:'',outcome:'',adminOpen:false,reviewHistory:false,reviewKind:'',reportQuery:'',showHidden:false,removedPicks:0,draft:null,base:null,error:'',pending:null,busy:false};
    view=v;bind(v);render(v);
    try{await load(v);if(!review&&v.data.scheduleDue&&permissions(v).edit&&!v.pending)await write(v,'generate');}
    catch(error){if(current(v)){v.error=errorText(error.message);render(v);}}
  }
  const html=()=>'<section class="ri-app rf-app" data-i18n-skip="true"></section>';
  const fqcModuleSwitch='[data-module="1"],[data-review-module="1"]';
  let fqcReceiptView;
  // This workspace only adapts the visible receipt feedback. FQC owns the actual
  // receipt lookup, recovery and write fence, including when this link is used.
  function watchFqcReceipt(container) {
    const selector='#routine-fqc-root,#review-routine-fqc';
    const root=container?.matches(selector)?container:container?.querySelector(selector);
    if(!root||fqcReceiptView?.root===root)return;
    fqcReceiptView?.observer.disconnect();
    const state={root,checking:false,observer:null};
    const update=()=>{
      // The whole-page FQC controller has its own protected editor and no module row.
      if(root.hasAttribute?.('data-routine-page')&&window.hasPermission?.('iqc.view')){
        const panel=root.querySelector('[data-routine-page-panel]');
        if(panel&&!panel.querySelector(fqcModuleSwitch)){
          const nav=document.createElement('nav');
          nav.className='rf-modules';
          nav.setAttribute('aria-label',t('例行檢查模組','Mô-đun kiểm tra định kỳ'));
          const entry=document.createElement('button');
          entry.type='button';
          entry.setAttribute(root.id==='review-routine-fqc'?'data-review-module':'data-module','1');
          entry.textContent='IQC';
          nav.append(entry);
          panel.prepend(nav);
        }
      }
      // The existing module button only switches views. Keep it available
      // during receipt lookup while FQC's write controls remain disabled.
      const moduleSwitch=root.querySelector(fqcModuleSwitch);
      if(moduleSwitch?.disabled&&mountedCurrent(workspace))moduleSwitch.disabled=false;
      if(root.querySelector('[data-rf-receipt-panel]')?.hasAttribute?.('data-rf-receipt-panel')){
        state.checking=false;
        return;
      }
      const error=root.querySelector('.rf-notice.error [data-action="retry"]')?.parentElement?.firstChild;
      if(error?.nodeType===3){
        const code=error.nodeValue.trim();
        if(code==='OPERATION_NOT_FOUND')
          error.nodeValue=t('目前查無原操作回執，寫入結果仍待確認。','Chưa tìm thấy biên nhận gốc. Kết quả ghi vẫn chưa được xác nhận.');
        else if(['ROUTINE_REQUEST_TIMEOUT','FQC_READ_FAILED','Failed to fetch','Load failed','NetworkError when attempting to fetch resource.'].includes(code))
          error.nodeValue=t('暫時無法查詢回執，請稍後再查。原操作仍待確認。','Tạm thời chưa tra được biên nhận. Hãy thử tra lại sau. Thao tác gốc vẫn chưa được xác nhận.');
      }
      if(!state.checking)return;
      const status=root.querySelector('.rf-calendar > p[role="status"]');
      if(!status){state.checking=false;return;}
      const checking=t('正在查詢原操作回執…','Đang tra biên nhận gốc…');
      if(status.textContent!==checking)status.textContent=checking;
    };
    state.observer=new MutationObserver(update);
    state.observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
    fqcReceiptView=state;
    update();
  }
  const pairHtml = fqc => `<div class="ri-workspaces" data-ri-workspaces>
    <div data-ri-fqc hidden inert>${fqc}</div>
    <div data-ri-iqc hidden inert>${html()}</div></div>`;
  const visible = (panel, show) => {panel.hidden=!show;panel.inert=!show;};
  const mountedCurrent = pair => !!pair&&pair===workspace&&pair.root.isConnected&&sameOwner(pair.owner);
  function switchModule(pair, name, moveFocus=true) {
    if(!mountedCurrent(pair)||view?.adminDialog)return;
    if(pair.active===name)return pair.ready[name];
    if(pair.active)pair.scroll[pair.active]=window.scrollY;
    pair.active=name;
    visible(pair.fqc,name==='fqc');
    visible(pair.iqc,name==='iqc');
    if(moveFocus){
      const url=new URL(location.href);
      if(name==='iqc')url.searchParams.set('rfModule','iqc');
      else{url.searchParams.delete('rfModule');url.searchParams.delete('riDocument');}
      if(!window.ProcessDeliveryNavigation?.replaceDisplayURL?.(url))history.replaceState(history.state,'',url);
    }
    if(!pair.ready[name]){
      if(name==='fqc'){
        pair.ready.fqc=Promise.resolve(pair.mountFqc(pair.fqc));
        watchFqcReceipt(pair.fqc);
      }else pair.ready.iqc=Promise.resolve(mount(pair.iqc,pair.review));
    }
    if(moveFocus){
      window.scrollTo(0,pair.scroll[name]||0);
      const focus=name==='iqc'?'[data-ri-action="module:0"]':fqcModuleSwitch;
      pair[name].querySelector(focus)?.focus({preventScroll:true});
    }
    return pair.ready[name];
  }
  function mountPair(container, review, mountFqc) {
    const root=container?.querySelector('[data-ri-workspaces]');
    if(!root)return;
    if(workspace?.review===review&&sameOwner(workspace.owner)){
      if(root!==workspace.root)root.replaceWith(workspace.root);
      return workspace.ready[workspace.active];
    }
    fqcReceiptView?.observer.disconnect();
    fqcReceiptView=null;view?.adminDialog?.close();view?.flowObserver?.disconnect();view=null;
    workspace={root,review,mountFqc,owner:owner(),active:null,ready:{},scroll:{},
      fqc:root.querySelector('[data-ri-fqc]'),iqc:root.querySelector('[data-ri-iqc]')};
    return switchModule(workspace,selected()?'iqc':'fqc',false);
  }
  const iqcCanLeave = () => !view||!current(view)||!view.busy&&!view.pending&&!view.adminDialog&&!edited(view);
  function approvalCounts(original) {
    let iqc=null,fqc=null,badge=null,observer=null,read=null;
    const count=(value)=>value&&sameOwner(value.pin)?value.count:0;
    const total=()=>(fqc&&sameOwner(fqc.pin)?fqc.count:original.pendingCount?.()||0)+count(iqc);
    function paint() {
      const next=document.querySelector?.('#approval-tab-routine .approval-tab-count');
      if(next!==badge){
        observer?.disconnect();
        badge=next;
        if(badge){
          // The existing FQC controller still owns its count. Compose its
          // next badge refresh with the authorized IQC count.
          const pin=owner();
          observer=new MutationObserver(()=>{
            if(!sameOwner(pin))return;
            const text=badge.textContent.trim(),value=Number(text);
            if(text&&Number.isSafeInteger(value)&&value>=0)fqc={pin,count:value};
            paint();
          });
          observer.observe(badge,{childList:true,characterData:true,subtree:true});
        }
      }
      if(badge&&badge.textContent!==String(total())){
        badge.textContent=String(total());
        observer?.takeRecords();
      }
    }
    function recordIqc(pin,revision,value) {
      if(!sameOwner(pin)||!Number.isSafeInteger(value)||value<0)return;
      if(iqc&&sameOwner(iqc.pin)&&iqc.revision>revision)return;
      iqc={pin,revision,count:value};
      paint();
    }
    async function refresh() {
      paint();
      const pin=owner();
      if(!pin.actor)return;
      if(read&&sameOwner(read.pin))return read.promise;
      const request={pin};
      request.promise=(async()=>{
        try{
          const response=await fetch(endpoint+'?pending-count=1',{cache:'no-store'});
          if(!response.ok){
            if([401,403,404].includes(response.status)&&sameOwner(pin)){iqc=null;paint();}
            return;
          }
          const result=await response.json();
          if(result.identityId===pin.actor)recordIqc(pin,result.revision,result.pendingCount);
        }finally{if(read===request)read=null;}
      })().catch(()=>{});
      read=request;
      return request.promise;
    }
    return {paint,recordIqc,refresh,total,reset(){observer?.disconnect();iqc=fqc=badge=observer=read=null;}};
  }
  function attach(original) {
    approvalBadge=approvalCounts(original);
    const wrapped={...original,html:()=>pairHtml(original.html()),reviewHTML:()=>pairHtml(original.reviewHTML()),
      mount:(container,history)=>mountPair(container,false,area=>original.mount(area,history)),
      bindReview:container=>{
        approvalBadge.paint();
        if(selected())void original.refreshPending?.();else void approvalBadge.refresh();
        return mountPair(container,true,area=>original.bindReview(area));
      },
      opensRoutineApproval:()=>mountedCurrent(workspace)&&workspace.active==='iqc'&&!workspace.review,
      pendingCount:()=>approvalBadge.total(),
      refreshPending:()=>Promise.all([approvalBadge.refresh(),original.refreshPending?.()]),
      navigation:{
        get departure(){return workspace?.ready.fqc&&iqcCanLeave()?original.navigation.departure:null;},
        canLeave:()=>iqcCanLeave()&&(!workspace?.ready.fqc||original.navigation.canLeave()),
        reset(){approvalBadge.reset();view?.adminDialog?.close();view?.flowObserver?.disconnect();view=null;workspace=null;fqcReceiptView?.observer.disconnect();fqcReceiptView=null;original.navigation.reset();},
        error:()=>workspace?.active==='fqc'?original.navigation.error():null,
      },
    };
    document.addEventListener('click',event=>{
      if(!(event.target instanceof Element))return;
      const retry=event.target.closest('[data-action="retry"]');
      if(retry&&!retry.disabled&&fqcReceiptView?.root.contains(retry))fqcReceiptView.checking=true;
      const entry=event.target.closest(fqcModuleSwitch);
      if(!entry||entry.disabled||!fqcReceiptView?.root.contains(entry))return;
      event.preventDefault();event.stopImmediatePropagation();
      switchModule(workspace,'iqc');
    },true);
    return wrapped;
  }
  // The compiled shell renders on script execution. Wrap only the registration
  // before that first render, then restore a normal property for the workspace.
  if(window.RoutineFQCUI)window.RoutineFQCUI=attach(window.RoutineFQCUI);
  else Object.defineProperty(window,'RoutineFQCUI',{configurable:true,set(original){
    Object.defineProperty(window,'RoutineFQCUI',{configurable:true,writable:true,enumerable:true,value:attach(original)});
  }});
  window.addEventListener('process-language-change',()=>{if(view&&current(view))render(view);});
})();
