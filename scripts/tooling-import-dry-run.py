"""Read-only XLSX extraction. Emits deterministic staging records and original media, never writes a database."""
import argparse,collections,datetime,hashlib,json,pathlib,posixpath,re,zipfile,xml.etree.ElementTree as ET
import openpyxl

def main():
 p=argparse.ArgumentParser();p.add_argument('--package',required=True);p.add_argument('--iqc',required=True);p.add_argument('--out',required=True);a=p.parse_args()
 package=pathlib.Path(a.package);out=pathlib.Path(a.out);out.mkdir(parents=True,exist_ok=True)
 rules=json.loads((package/'rules/import_rules.json').read_text(encoding='utf-8'));source=package/'source'/rules['source_file'];digest=hashlib.sha256(source.read_bytes()).hexdigest()
 manifest=json.loads((package/'manifest.json').read_text(encoding='utf-8'))
 for entry in manifest:
  file=(package/entry['path']).resolve()
  if not file.is_relative_to(package.resolve()):raise RuntimeError('Manifest path escape')
  raw=file.read_bytes()
  if len(raw)!=entry['size_bytes'] or hashlib.sha256(raw).hexdigest()!=entry['sha256']:raise RuntimeError('Manifest mismatch: '+entry['path'])
 (out/'manifest-observed.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 w=openpyxl.load_workbook(source,read_only=True,data_only=True)
 sheets={s.title:list(s.values) for s in w};mainname='器具清單_Danh sach';rows={i+1:r for i,r in enumerate(sheets[mainname]) if i>=5 and r[1]}
 text=lambda v:'' if v is None else str(v).strip()
 identity=lambda kind,code:'tooling:'+kind+':'+code
 media={};anchors=[];photoissues=[];photos=collections.defaultdict(list)
 ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships','d':'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
 def rels(z,file):
  file=posixpath.join(posixpath.dirname(file),'_rels',posixpath.basename(file)+'.rels')
  if file not in z.namelist():return {}
  return {n.attrib['Id']:n.attrib['Target'] for n in ET.fromstring(z.read(file)) if n.attrib.get('TargetMode')!='External'}
 def resolve(base,target):return target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(base),target))
 with zipfile.ZipFile(source) as z:
  wr=rels(z,'xl/workbook.xml');root=ET.fromstring(z.read('xl/workbook.xml'));indexphotos=collections.defaultdict(list)
  for sheet in root.findall('m:sheets/m:sheet',ns):
   title=sheet.attrib['name'];file=resolve('xl/workbook.xml',wr[sheet.attrib['{'+ns['r']+'}id']]);sr=rels(z,file)
   for drawing in ET.fromstring(z.read(file)).findall('m:drawing',ns):
    df=resolve(file,sr[drawing.attrib['{'+ns['r']+'}id']]);dr=rels(z,df)
    for anchor in ET.fromstring(z.read(df)):
     origin=anchor.find('d:from',ns);blip=anchor.find('.//a:blip',ns)
     if origin is None or blip is None:continue
     row=int(origin.find('d:row',ns).text)+1;col=int(origin.find('d:col',ns).text)+1;rid=blip.attrib.get('{'+ns['r']+'}embed');target=resolve(df,dr[rid]);raw=z.read(target);sha=hashlib.sha256(raw).hexdigest();suffix=pathlib.PurePosixPath(target).suffix.lower();mime={'.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'}.get(suffix)
     entry={'sheet':title,'row':row,'column':col,'drawing':df,'relationship':rid,'media':target,'id':sha,'bytes':len(raw)};anchors.append(entry)
     if not mime:photoissues.append({**entry,'reason':'UNSUPPORTED_SOURCE_IMAGE'});continue
     media.setdefault(sha,{'id':sha,'bytes':len(raw),'mime':mime,'file':sha+suffix})
     dest=out/'media'/media[sha]['file'];dest.parent.mkdir(exist_ok=True)
     if not dest.exists():dest.write_bytes(raw)
     photo={'id':sha,'bytes':len(raw),'source':entry}
     if title==mainname and row in rows and col==27:photos[text(rows[row][1])].append(photo)
     elif title=='照片索引_Hinh anh' and row<=len(sheets[title]):
      key=text(sheets[title][row-1][0]);indexphotos[key].append(photo)
     else:photoissues.append({**entry,'reason':'ANCHOR_WITHOUT_UNIQUE_TOOL_ROW'})
  for row,r in rows.items():
   refs=[s.strip() for s in text(r[26]).split(',') if s.strip()]
   for ref in refs:
    if not re.fullmatch(r'P\d+',ref) or ref not in indexphotos:photoissues.append({'tool':r[1],'row':row,'reference':ref,'reason':'PHOTO_INDEX_UNRESOLVED'});continue
    indexrow=next((x for x in sheets['照片索引_Hinh anh'][5:] if text(x[0])==ref),None)
    # Index links are explicit identifiers; preserve the source name for cross-check, never assign by media order.
    for photo in indexphotos[ref]:photos[text(r[1])].append({**photo,'index':ref,'sourceName':text(indexrow[4])})
 # Visually verified source anomaly: P003 is Silcote anti-rust spray, not the named switch button.
 # Keep its original bytes and provenance, but do not present it as a confirmed tool photograph.
 disputed='09b152412a085eb543f5bcd2c3c50fdb8cdd0a021e4417baa1fc99a2e27d3b31'
 for code in photos:photos[code]=[p for p in photos[code] if p['id']!=disputed]
 resolvedanchors=[];unresolved=[]
 for issue in photoissues:
  candidates=sorted({code for code,items in photos.items() if any(p['id']==issue.get('id') for p in items)})
  if len(candidates)==1:resolvedanchors.append({**issue,'resolution':'DUPLICATE_MEDIA_HAS_EXPLICIT_ANCHOR','toolCode':candidates[0]})
  else:unresolved.append({**issue,**({'reason':'SOURCE_INDEX_IMAGE_CONTENT_CONFLICT','index':'P003','claimedTool':'DC01-0002'} if issue.get('id')==disputed else {})})
 photoissues=unresolved
 iqc=json.loads(pathlib.Path(a.iqc).read_text(encoding='utf-8'))['control'];active=next((v for v in iqc['versions'] if v['id']==iqc['activeVersionId'] and v['status']=='approved'),None)
 if not active:raise RuntimeError('No approved IQC source; preserve prior references and retry')
 parts=collections.defaultdict(list)
 for r in active['snapshot']['parts']:
  if not r.get('isDeleted'):parts[text(r['code'])].append(r)
 catalogs={}
 for collection,sheet,prefix in [('categories','器具類別_Loai dung cu','DC'),('suppliers','供應商_Nha cung cap','SUP'),('manufacturers','器具生產商_Nha che tao','MFR')]:
  catalogs[collection]=[]
  for r in sheets[sheet][5:]:
   code=text(r[0])
   if not re.fullmatch(prefix+r'\d+',code):continue
   item={'id':identity(collection,code),'code':code,'nameVi':text(r[2] if collection=='categories' else r[1]),'nameZh':text(r[1]) if collection=='categories' else ''}
   if collection!='categories':item.update(erp='',addresses=[text(r[2])] if r[2] else [],phones=[text(r[3])] if r[3] else [],contacts=[text(r[4])] if r[4] else [])
   catalogs[collection].append(item)
 mapping={r['erp']:r for r in rules['manufacturer_map']}
 for m in rules['manufacturer_map']:
  if any(r['code']==m['code'] for r in catalogs['manufacturers']):raise RuntimeError('Manufacturer code conflict '+m['code'])
  catalogs['manufacturers'].append({'id':identity('manufacturers',m['code']),'code':m['code'],'nameVi':m['name'],'nameZh':'','erp':m['erp'],'addresses':[],'phones':[],'contacts':[]})
 catalogs['custodians']=[{'id':identity('custodians','planning'),'nameVi':rules['internal_custodian'],'nameZh':''}]
 tools=[];iqcmap=[];nameissues=[]
 for row,r in rows.items():
  code=text(r[1]);cn=text(r[4]);name=text(r[6]);rawname=name
  if cn and name.startswith(cn+' / '):name=name[len(cn)+3:]
  elif re.search(r'[\u3400-\u9fff]',name):nameissues.append({'code':code,'row':row,'original':name,'reason':'NAME_SPLIT_REVIEW'})
  if code in rules['append_plus_ids']:
   name=name if name.endswith(rules['name_suffix']) else name+rules['name_suffix'];cn=cn if cn.endswith(rules['name_suffix']) else cn+rules['name_suffix']
  m=text(r[12]);m=mapping[m]['code'] if m in mapping else m
  internal='Nội bộ' in text(r[14]);inbound=datetime.datetime.strptime(text(r[29]),'%d/%m/%Y').date().isoformat() if r[29] else ''
  freq=12 if text(r[22])=='年 / Năm' else 6 if not r[22] or text(r[28])=='6 tháng/lần' else None
  if freq is None:raise RuntimeError('Unrecognized frequency '+code)
  rawcode=text(r[30]);matches=parts.get(rawcode,[]) if rawcode else [];matchstatus='empty' if not rawcode else 'matched' if len(matches)==1 else 'ambiguous' if len(matches)>1 or '+' in rawcode else 'unmatched'
  iqcmap.append({'toolCode':code,'row':row,'sourceCode':rawcode,'sourceName':text(r[31]),'status':matchstatus,'partIds':[v['id'] for v in matches] if matchstatus=='matched' else [],'iqcVersionId':active['id']})
  unique={p['id']:p for p in photos[code]}
  tools.append({'id':identity('tools',code),'code':code,'nameVi':name,'nameZh':cn,'categoryId':identity('categories',text(r[2])),'assetCode':text(r[5]),'specification':text(r[7]),'quantity':int(r[10]),'unit':text(r[9]),'manufacturerId':identity('manufacturers',m) if m else '',
   'location':{'kind':'internal' if internal else 'external','holderId':identity('custodians','planning') if internal else identity('suppliers',text(r[15]))},'inboundDate':inbound,'inboundDateLost':not bool(inbound),'enabled':code not in rules['inactive_reasons'],'inactiveReason':rules['inactive_reasons'].get(code,''),'archived':False,'archiveReason':'','notes':text(r[27]),'frequencyMonths':freq,'photos':list(unique.values()),'iqcIds':[v['id'] for v in matches] if matchstatus=='matched' else [],'iqcSource':{'code':rawcode,'name':text(r[31]),'status':matchstatus,'versionId':active['id']},'source':{'sha256':digest,'sheet':mainname,'row':row,'key':code,'fileName':source.name,'original':{openpyxl.utils.get_column_letter(i+1):text(v) for i,v in enumerate(r) if v is not None}}})
 snapshot={**catalogs,'tools':tools,'transfers':[]}
 counts={'tools':len(tools),'categories':dict(collections.Counter(r['source']['original']['C'] for r in tools)),'enabled':sum(r['enabled'] for r in tools),'inactive':sum(not r['enabled'] for r in tools),'internal':sum(r['location']['kind']=='internal' for r in tools),'external':sum(r['location']['kind']=='external' for r in tools),'inboundPresent':sum(bool(r['inboundDate']) for r in tools),'inboundLost':sum(r['inboundDateLost'] for r in tools),'frequency':dict(collections.Counter(r['frequencyMonths'] for r in tools)),'plus':sum(r['nameVi'].endswith(' (+)') for r in tools),'units':dict(collections.Counter(r['unit'] for r in tools)),'missingManufacturer':sum(not r['manufacturerId'] for r in tools),'photoTools':sum(bool(r['photos']) for r in tools),'photoReferences':sum(len(r['photos']) for r in tools),'uniquePhotos':len({p['id'] for r in tools for p in r['photos']}),'sourceAnchors':len(anchors),'unresolvedPhotos':len(photoissues),'iqc':dict(collections.Counter(r['status'] for r in iqcmap))}
 assert counts['tools']==366 and counts['categories']=={'DC01':59,'DC02':188,'DC04':119};assert counts['inactive']==12 and counts['internal']==308;assert counts['inboundPresent']==307 and counts['inboundLost']==59;assert counts['frequency']=={6:59,12:307};assert counts['plus']==11 and counts['missingManufacturer']==7
 assert len({r['id'] for r in tools})==366 and all(r['quantity']>0 for r in tools)
 report={'sourceSha256':digest,'counts':counts,'photoIssues':photoissues,'resolvedPhotoAnchors':resolvedanchors,'nameIssues':nameissues,'oldInspectionsImported':0,'oldTransferApprovalsCreated':0,'iqcVersionId':active['id']}
 for name,value in [('payload.json',snapshot),('dry-run.json',report),('iqc-mapping.json',iqcmap),('photo-anchors.json',anchors),('media.json',list(media.values()))]:(out/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':main()
