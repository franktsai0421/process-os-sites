import test from 'node:test';
import assert from 'node:assert/strict';
import {readLedger,stateFor,transition} from '../lib/piece-calibration.mjs';
import {resetIntent,applyReset} from '../lib/piece-calibration-reset.mjs';

function model(){
 const rows=['a','b'].map(id=>({id,assetCode:id,pieceMark:id,enabled:true,calibrationCycle:'monthly',calibrationMethod:'internal',calibratedAt:'2025-12-12',expiresAt:'2030-12-12'}));
 const active={id:'v1',status:'approved',equipment:rows},master={activeVersionId:'v1',versions:[active]},today='2026-11-26';
 let revision=0,uid=0,ledger=readLedger();
 const send=(cmd)=>{ledger=transition(ledger,active,cmd,{actor:{id:cmd.action==='approve'?'reviewer':'operator',role:'staff'},now:today+'T00:00:00Z',today,uid:()=>String(++uid)});revision++;};
 const round=(ids,date,outcome='pass')=>{
  send({action:'newPlan',ids});const plan=ledger.docs.at(-1);
  send({action:'save',doc:plan.id,start:date,end:date});send({action:'submit',doc:plan.id});send({action:'approve',doc:plan.id});
  const report=ledger.docs.at(-1);send({action:'save',doc:report.id,rows:ids.map(id=>({id,date,outcome,photos:['a'.repeat(64)]}))});
  send({action:'submit',doc:report.id});send({action:'approve',doc:report.id});return plan.plan;
 };
 const preview=plan=>resetIntent({ledger,master,revision},plan?undefined:null,today,plan);
 return {round,preview,master,get ledger(){return ledger;},apply(plan){ledger=applyReset(preview(plan),{actorId:'owner',at:today,token:'preview-token'});revision++;},facts:id=>stateFor(ledger,rows.find(r=>r.id===id),today)};
}
test('shared round is indivisible and must be latest for every participant',()=>{
 const m=model(),shared=m.round(['a','b'],'2026-09-25'),later=m.round(['b'],'2026-10-26');
 assert.throws(()=>m.preview(shared),/NEWER_ROUND/);
 assert.deepEqual(m.preview(later).preview.pieces[0].restore,{calibratedAt:'2026-09-25',expiresAt:'2026-10-25'});
 m.apply(later);assert(m.facts('b').locked);assert.equal(m.preview(shared).preview.pieces.length,2);
 m.apply(shared);assert.equal(m.ledger.docs.length,0);assert.equal(m.ledger.plans.length,0);assert(!m.facts('a').locked);
 assert.deepEqual(m.facts('a').dates,{calibratedAt:'2025-12-12',expiresAt:'2030-12-12'});
});
test('full reset retains master versions and removes actual histories',()=>{
 const m=model(),prior=structuredClone(m.master);m.round(['a','b'],'2026-09-25','fail');assert.equal(m.facts('a').status,'failed');m.apply();assert.deepEqual(m.master,prior);assert.equal(m.ledger.docs.length,0);assert.deepEqual(m.facts('a').history,[]);assert(!m.facts('a').locked);
});
test('unverifiable baseline rejects reset without changing the ledger',()=>{
 const m=model();m.round(['a'],'2026-09-25');
 delete m.ledger.plans[0].pieces[0].baseline;const before=structuredClone(m.ledger);
 assert.throws(()=>m.preview(),/BASELINE_UNVERIFIED/);assert.deepEqual(before,m.ledger);
});
