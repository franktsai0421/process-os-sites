"""Freeze exact named Git predecessor projections; never read runtime worktree.
Usage: python3 scripts/generate-unified-draft-source-contract.py --source FINAL40 \
  --target main=b06394ce0065849733399423afd2d906761d69c1 [--target bom=REAL40 ...]
Output is a test-only ledger. Missing commit/tree/blob is a hard failure; no
network, cache invention, git hash-object writes or history reconstruction.
"""
from pathlib import Path
import argparse,subprocess,hashlib,json,difflib,base64,re
ROOT=Path(__file__).resolve().parents[1]
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,stderr=subprocess.PIPE)
def commit(value):
 if not re.fullmatch('[a-f0-9]{40}',value):raise ValueError('EXACT_40_CHARACTER_COMMIT_REQUIRED')
 if git('cat-file','-t',value).strip()!=b'commit':raise ValueError('REAL_GIT_COMMIT_REQUIRED')
 return {'commit':value,'tree':git('rev-parse',value+'^{tree}').decode().strip()}
def tree(ref,extra):
 result={}
 for record in git('ls-tree','-rz',ref).split(b'\0'):
  if not record:continue
  metadata,name=record.split(b'\t',1);mode,kind,oid=metadata.decode().split();name=name.decode('utf-8')
  if kind=='blob' and (name.startswith('lib/') or name.startswith('app/') or name.startswith('public/process/')) and re.search(r'\.(?:[cm]?js|tsx?|html|css)$',name) or kind=='blob' and name in extra:result[name]=oid
 return result
def source(oid):return git('cat-file','blob',oid)
def meta(oid,raw):return {'blob':oid,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
def rules(before,after):
 old=before.splitlines(keepends=True);new=after.splitlines(keepends=True);oldoffset=[0];newoffset=[0]
 for line in old:oldoffset.append(oldoffset[-1]+len(line))
 for line in new:newoffset.append(newoffset[-1]+len(line))
 return [{'beforeOffset':oldoffset[a],'afterOffset':newoffset[c],'before':base64.b64encode(b''.join(old[a:b])).decode(),'after':base64.b64encode(b''.join(new[c:d])).decode()} for tag,a,b,c,d in difflib.SequenceMatcher(None,old,new,autojunk=False).get_opcodes() if tag!='equal']
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);parser.add_argument('--target',action='append',required=True);parser.add_argument('--include',action='append',default=[]);parser.add_argument('--historical-ledger');parser.add_argument('--witness-output',default='scripts/unified-draft-source-witness.json');parser.add_argument('--output',default='scripts/unified-draft-source-contract.json');args=parser.parse_args()
 source_meta=commit(args.source);targets={}
 for item in args.target:
  name,ref=item.split('=',1)
  if not re.fullmatch('[a-z][a-z0-9_-]*',name) or name in targets:raise ValueError('UNIQUE_NAMED_TARGET_REQUIRED')
  targets[name]=commit(ref)
 extra=set(args.include)
 for file in extra:
  if file.startswith('/') or '\\' in file or any(part in ['', '.', '..'] for part in file.split('/')):raise ValueError('NORMALIZED_INCLUDED_PATH_REQUIRED')
 currenttree=tree(args.source,extra);targettrees={name:tree(entry['commit'],extra) for name,entry in targets.items()}
 for name,old in targettrees.items():
  removed=set(old)-set(currenttree)
  if removed:raise ValueError('REMOVED_SOURCE_NEEDS_EXPLICIT_SEPARATE_PROOF:'+name+':'+','.join(sorted(removed)))
 touched=sorted({file for old in targettrees.values() for file,oid in currenttree.items() if old.get(file)!=oid})
 if not touched:raise ValueError('NO_CHANGED_RUNTIME_SOURCES')
 current=[];projections=[];added=[]
 for file in touched:
  raw=source(currenttree[file]);after=meta(currenttree[file],raw);current.append({'file':file,**after})
  for target,oldtree in targettrees.items():
   if file not in oldtree:added.append({'file':file,'absentFrom':target});continue
   if oldtree[file]==currenttree[file]:continue
   before=source(oldtree[file]);projections.append({'file':file,'target':target,'before':meta(oldtree[file],before),'after':after,'rules':rules(before,raw)})
 result={'format':'PROCESS_OS_UNIFIED_SOURCE_V1','source':source_meta,'targets':targets,'current':current,'projections':projections,'added':added}
 output=(ROOT/args.output).resolve()
 if ROOT not in output.parents:raise ValueError('OUTPUT_MUST_BE_WITHIN_OWN_CHECKOUT')
 # Preserve only actual raw commit/tree objects needed to resolve the selected
 # source paths. Parent commit bodies and unrelated blob bodies are not claimed.
 objects={}
 def remember(oid,kind):
  raw=git('cat-file',kind,oid)
  actual=hashlib.sha1(kind.encode()+b' '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
  if actual!=oid:raise ValueError('GIT_WITNESS_OBJECT_MISMATCH')
  objects[oid]={'oid':oid,'type':kind,'raw':base64.b64encode(raw).decode()}
  return raw
 def prove_path(reference,file):
  raw=remember(reference['commit'],'commit');first=raw.split(b'\n',1)[0]
  if first!=b'tree '+reference['tree'].encode():raise ValueError('COMMIT_TREE_WITNESS_MISMATCH')
  oid=reference['tree'];parts=file.split('/')
  for index,part in enumerate(parts):
   raw=remember(oid,'tree');entries={};position=0
   while position<len(raw):
    space=raw.index(b' ',position);null=raw.index(b'\0',space);name=raw[space+1:null].decode();entries[name]=(raw[position:space].decode(),raw[null+1:null+21].hex());position=null+21
   if part not in entries:return None
   mode,oid=entries[part]
   if index<len(parts)-1 and mode!='40000':raise ValueError('WITNESS_PATH_IS_NOT_TREE')
  return oid
 for entry in current:
  if prove_path(source_meta,entry['file'])!=entry['blob']:raise ValueError('SOURCE_BLOB_WITNESS_MISMATCH')
 for entry in projections:
  if prove_path(targets[entry['target']],entry['file'])!=entry['before']['blob']:raise ValueError('PREDECESSOR_BLOB_WITNESS_MISMATCH')
 for entry in added:
  if prove_path(targets[entry['absentFrom']],entry['file']) is not None:raise ValueError('NEW_FILE_WITNESS_MISMATCH')
 historical=[]
 if args.historical_ledger:
  requests=json.loads((ROOT/args.historical_ledger).read_text());seen=set()
  for request in requests:
   ref,file=request['ref'],request['file'];reference=commit(ref)
   if file.startswith('/') or '\\' in file or any(part in ['', '.', '..'] for part in file.split('/')):raise ValueError('HISTORICAL_PATH_INVALID')
   key=(ref,file)
   if key in seen:raise ValueError('DUPLICATE_HISTORICAL_REQUEST')
   seen.add(key);oid=prove_path(reference,file)
   if oid is not None:remember(oid,'blob')
   historical.append({'ref':ref,'file':file,'blob':oid})
 witness=(ROOT/args.witness_output).resolve()
 if ROOT not in witness.parents:raise ValueError('WITNESS_MUST_BE_WITHIN_OWN_CHECKOUT')
 witness.parent.mkdir(parents=True,exist_ok=True);witness.write_text(json.dumps({'format':'PROCESS_OS_SOURCE_WITNESS_V1','scope':'Bounded actual commit/tree paths only; no full-history or unrelated blob-content claim.','historical':historical,'objects':[objects[oid] for oid in sorted(objects)]},indent=2)+'\n')
 # Deduplicate repeated raw spans across named predecessors without reducing
 # any inverse. Readers verify canonical base64, SHA256 and length per pool item.
 spanpool={}
 for entry in projections:
  for rule in entry['rules']:
   for side in ['before','after']:
    raw=base64.b64decode(rule.pop(side));digest=hashlib.sha256(raw).hexdigest()
    spanpool[digest]={'bytes':len(raw),'sha256':digest,'base64':base64.b64encode(raw).decode()};rule[side+'Ref']=digest
 result['encoding']='content-addressed-base64-spans-v1';result['spans']=spanpool
 output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,ensure_ascii=True,indent=2)+'\n')
 print(json.dumps({'source':source_meta,'targets':targets,'currentFiles':len(current),'projections':len(projections),'added':len(added),'output':str(output)}))
if __name__=='__main__':main()
