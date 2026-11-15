"""Paired actual-handler measurements from exact main archive and candidate.
Usage: python scripts/compare-tooling-equipment-speed.py /path/to/baseline /path/to/output.json
Prepare baseline with git archive <pinned-main> and copy only the benchmark script.
Node dependencies resolve via NODE_PATH; no data/service credentials required.
"""
import json, os, pathlib, statistics, subprocess, sys
root=pathlib.Path(__file__).resolve().parents[1]
baseline=pathlib.Path(sys.argv[1]).resolve()
output=pathlib.Path(sys.argv[2]).resolve()
pairs=int(os.environ.get('SPEED_PAIRS','3'))
baseline_commit=os.environ.get('SPEED_BASELINE_COMMIT','e040a7e838133c0c9870850a49955cf045dbc02b')
assert len(baseline_commit)==40 and all(c in '0123456789abcdef' for c in baseline_commit)
assert subprocess.check_output(['git','cat-file','-t',baseline_commit],cwd=root,text=True).strip()=='commit'
for file in ['lib/versioned-shared-workflow.ts','lib/process-state.ts','lib/state-records.ts','lib/tooling-workflow.ts','lib/equipment-workflow.ts','app/api/tooling/iqc/route.ts','app/api/routine-equipment/route.ts']:
    assert (baseline/file).read_bytes()==subprocess.check_output(['git','show',baseline_commit+':'+file],cwd=root), file+' baseline drift'
runs=[]
for pair in range(pairs):
    for mode in (['before','after'] if pair%2==0 else ['after','before']):
        source=baseline if mode=='before' else root
        env={**os.environ,'SPEED_ROUNDS':'1','NODE_PATH':str(root/'node_modules'),'SPEED_SOURCE_COMMIT':baseline_commit if mode=='before' else subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()}
        p=subprocess.run(['node','scripts/benchmark-tooling-equipment-speed.cjs'],cwd=source,env=env,text=True,capture_output=True)
        if p.returncode:
            raise RuntimeError(f'{mode} pair={pair} failed: {p.stderr[-4000:]}')
        report=json.loads(p.stdout)
        runs.append({'pair':pair,'mode':mode,**report})
        output.with_suffix(f'.pair{pair}.{mode}.json').write_text(json.dumps(runs[-1],ensure_ascii=False,indent=2)+'\n')
        print(f'pair={pair} mode={mode} PASS',flush=True)
summary=[]
for s in runs[0]['summary']:
    row={'module':s['module'],'step':s['step']}
    for mode in ['before','after']:
        items=[x for run in runs if run['mode']==mode for x in run['samples'] if x['module']==s['module'] and x['step']==s['step']]
        row[mode]={'n':len(items),'medianMs':statistics.median(x['ms'] for x in items),'medianReadStateMs':statistics.median(x['phases'].get('readState',{}).get('ms',0) for x in items),'r2Gets':sorted(set(x['get'] for x in items)),'cas':sorted(set(x['cas'] for x in items)),'peakGets':max(x['peakGets'] for x in items),'wireBytesRange':[min(x['wireBytes'] for x in items),max(x['wireBytes'] for x in items)]}
    assert row['before']['r2Gets']==row['after']['r2Gets']
    assert row['before']['cas']==row['after']['cas']
    assert row['before']['wireBytesRange']==row['after']['wireBytesRange']
    row['improvementPercent']=(1-row['after']['medianMs']/row['before']['medianMs'])*100
    summary.append(row)
output.write_text(json.dumps({'status':'PASS_SYNTHETIC_PAIRED_MEASUREMENT','baselineCommit':baseline_commit,'pairs':pairs,'order':'alternating before/after; no discarded warmup','summary':summary,'runs':runs},ensure_ascii=False,indent=2)+'\n')
