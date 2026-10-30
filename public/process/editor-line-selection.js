// Line-first editor selection. Session navigation never rewrites saved versions.
const editorRouteSelections = new Map();
function editorLines(){return lines.filter(line=>currentUser?.role==='admin'||(currentUser?.lines||[]).includes(line.code));}
function editorCategories(line=state.editorLine){return [...new Set(data.products.filter(p=>routeFor(p.code)?.line===line).map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
function editorSelectionReady(){return editorLines().some(line=>line.code===state.editorLine)&&editorCategories().includes(state.category);}
function normalizeEditorSelection(){
  const allowed=editorLines(),oldKey=editorKey();
  if(!allowed.some(line=>line.code===state.editorLine))state.editorLine=allowed[0]?.code||'';
  const categories=editorCategories();if(!categories.includes(state.category))state.category=categories[0]||'';
  if(editorKey()!==oldKey){state.editorVersionId=null;state.selectedOperation=null;state.addingStage=null;state.editorSubmissionVersionId=null;state.editorSubmissionErrors=[];}
  state.productCode=data.products.find(p=>p.category===state.category&&routeFor(p.code)?.line===state.editorLine)?.code||'';
  return allowed;
}
function changeEditorSelection(line,category){
  if(!editorLines().some(item=>item.code===line))return;
  const categories=editorCategories(line),nextCategory=categories.includes(category)?category:categories[0]||'';
  if(line===state.editorLine&&nextCategory===state.category)return;
  const run=()=>{
    const currentCategories=editorCategories(line);
    if(!editorLines().some(item=>item.code===line)||(nextCategory?!currentCategories.includes(nextCategory):currentCategories.length>0))throw Error('EDITOR_SELECTION_CHANGED');
    editorRouteSelections.set(editorKey(),{versionId:state.editorVersionId,operation:state.selectedOperation});
    state.editorLine=line;state.category=nextCategory;
    const previous=editorRouteSelections.get(editorKey());
    state.editorVersionId=previous?.versionId||null;state.selectedOperation=previous?.operation||null;
    state.addingStage=null;state.editorSubmissionVersionId=null;state.editorSubmissionErrors=[];
    state.productCode=data.products.find(p=>p.category===state.category&&routeFor(p.code)?.line===line)?.code||'';
    if(state.productCode)syncProductRoute();
    if(editorSelectionReady())ensureCategoryEditor();
    render();
  };
  if(window.ProcessDeliveryNavigation?.guardAction){
    // Native select already changed its visible value. Keep the current source
    // selected until the one guarded intent actually runs; Stay does not redraw.
    const lineSelect=document.querySelector('#editor-line-select'),categorySelect=document.querySelector('#category-select');
    if(lineSelect)lineSelect.value=state.editorLine;if(categorySelect)categorySelect.value=state.category;
    return window.ProcessDeliveryNavigation.guardAction({key:'editor-selection:'+JSON.stringify([line,nextCategory]),label:line+' / '+nextCategory,run});
  }
  return run();
}
function editorSelectionPath(stageCount=0,operationCount=0){
  const allowed=editorLines(),categories=editorCategories(),vi=document.documentElement.lang==='vi',h=escapeHtml;
  return `<div class="editor-path editor-line-first" data-i18n-skip="true"><div class="field"><label for="editor-line-select">1　${vi?'Chọn chuyền sản phẩm':'選擇產品線別'}</label><select id="editor-line-select" ${allowed.length?'':'disabled'}>${allowed.length?allowed.map(line=>`<option value="${h(line.code)}" ${line.code===state.editorLine?'selected':''}>${h(line.code)} · ${h(line.name)}</option>`).join(''):`<option value="">${vi?'Không có chuyền được phép':'沒有可用線別'}</option>`}</select></div><span aria-hidden="true">→</span><div class="field"><label for="category-select">2　${vi?'Chọn nhóm sản phẩm':'選擇產品類型'}</label><select id="category-select" ${categories.length?'':'disabled'}>${categories.length?categories.map(category=>`<option value="${h(category)}" ${category===state.category?'selected':''}>${h(category)}</option>`).join(''):`<option value="">${vi?'Chuyền này chưa có nhóm sản phẩm':'此線別尚無產品類型'}</option>`}</select></div><span aria-hidden="true">→</span><div class="path-result"><small>3　${vi?'Quy trình công đoạn':'工段流程'}</small><b>${stageCount} ${vi?'công đoạn':'個工段'} · ${operationCount} ${vi?'bước':'個流程'}</b></div></div>`;
}
function editorEmptyMessage(){return document.documentElement.lang==='vi'?'Chuyền này chưa có nhóm sản phẩm để chỉnh sửa. Hãy tạo và phê duyệt dữ liệu sản phẩm trong phần quản lý dữ liệu.':'此線別尚無可編輯的產品類型，請先在資料後台建立並核准產品資料。';}
// Update labels without rebuilding the inspector or discarding an in-progress input.
new MutationObserver(()=>{
  const path=document.querySelector('.editor-line-first');if(!path)return;
  const setText=(element,value)=>{if(element&&element.textContent!==value)element.textContent=value;};
  const vi=document.documentElement.lang==='vi';
  setText(path.querySelector('[for="editor-line-select"]'),vi?'1　Chọn chuyền sản phẩm':'1　選擇產品線別');
  setText(path.querySelector('[for="category-select"]'),vi?'2　Chọn nhóm sản phẩm':'2　選擇產品類型');
  setText(path.querySelector('.path-result small'),vi?'3　Quy trình công đoạn':'3　工段流程');
  const counts=path.querySelector('.path-result b'),numbers=counts.textContent.match(/\d+/g)||['0','0'];
  setText(counts,vi?`${numbers[0]} công đoạn · ${numbers[1]} bước`:`${numbers[0]} 個工段 · ${numbers[1]} 個流程`);
  const emptyLine=path.querySelector('#editor-line-select option[value=""]'),emptyCategory=path.querySelector('#category-select option[value=""]');
  setText(emptyLine,vi?'Không có chuyền được phép':'沒有可用線別');
  setText(emptyCategory,vi?'Chuyền này chưa có nhóm sản phẩm':'此線別尚無產品類型');
  setText(document.querySelector('.editor-no-category'),editorEmptyMessage());
}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});

// These classic-script functions are consumed by app.js.
Object.assign(globalThis,{normalizeEditorSelection,changeEditorSelection,editorSelectionPath});
