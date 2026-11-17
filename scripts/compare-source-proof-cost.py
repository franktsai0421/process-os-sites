"""Pair immutable ea137 source against current proof helper; retain all runs."""
import hashlib,json,pathlib,statistics,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[1];before=pathlib.Path(sys.argv[1]).resolve();output=pathlib.Path(sys.argv[2]);base='ea137c7dd8d608d216d45ab29b033fc5f782ff5d';runner=root/'scripts/profile-source-proof-cost.cjs'
for file in ['scripts/inventory-quality-source-contract.cjs','scripts/inventory-quality-source-contract.json','scripts/account-outcome-source-contract.cjs','scripts/quality-main-source-contract.cjs','scripts/quality-main-source-contracts.json','public/process/fqc-master.js']:
 assert (before/file).read_bytes()==subprocess.check_output(['git','show',base+':'+file],cwd=root),'baseline drift '+file
runs=[]
for pair in range(3):
 for mode in (['before','after']if pair%2==0 else ['after','before']):
  data=json.loads(subprocess.check_output(['node',str(runner),str(before if mode=='before'else root)],text=True,cwd=root));runs.append({'pair':pair,'mode':mode,**data});print(pair,mode,'PASS',flush=True)
for name in ['known','mutant-restore','mutant-admission']:
 assert len({step['resultHash']for run in runs for step in run['steps']if step['name']==name})==1,'proof outcome drift'
for name in ['inventory-quality.projectKnown','account-outcome.projectKnown']:
 assert len({entry['calls']for run in runs for entry in run['stats']if entry['name']==name})==1,'proof invocation skipped '+name
summary=[]
for name in ['known','mutant-restore','mutant-admission']:
 item={'name':name}
 for mode in ['before','after']:item[mode]={'n':3,'medianMs':statistics.median(step['ms']for run in runs if run['mode']==mode for step in run['steps']if step['name']==name)}
 summary.append(item)
for run in runs:
 if run['mode']=='after':
  for file,value in run['sourceHashes'].items():assert hashlib.sha256((root/file).read_bytes()).hexdigest()==value,'candidate drift '+file
output.write_text(json.dumps({'baselineCommit':base,'status':'PASS_PROOF_OUTCOME_AND_INVOCATION_PARITY','summary':summary,'runs':runs},indent=2)+'\n')
