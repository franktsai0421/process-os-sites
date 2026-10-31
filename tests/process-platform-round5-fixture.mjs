// Synthetic-only extension of the compiled Worker fixture. No production source,
// account, database, media or credentials are read. Each caller owns this Worker.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createPhotoEntryFixture} from './photo-entry-cloud-fixture.mjs';
import {pngFixture} from './photo-fixtures.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const at='2026-10-29T00:00:00.000Z';
// Keep bridge failure diagnostics in the local test report, including nested
// undici causes, without serializing arbitrary request objects or credentials.
function readbackErrorSummary(error,seen=new Set()){
  if(error===null||typeof error!=='object')return{thrownType:typeof error,value:String(error)};
  if(seen.has(error))return{circular:true};
  seen.add(error);
  const result={};
  for(const key of ['name','message','stack','code','errno','syscall','address','port']){
    const value=error[key];if(['string','number','boolean'].includes(typeof value))result[key]=value;
  }
  if('cause' in error)result.cause=readbackErrorSummary(error.cause,seen);
  if(Array.isArray(error.errors))result.errors=error.errors.map(item=>readbackErrorSummary(item,seen));
  return result;
}
const configuredCount=(value,name)=>{
  const count=Number(value);
  assert(Number.isSafeInteger(count)&&count>0,name+' must be a positive safe integer');
  return count;
};

// Uses PROCESS_TEST_BUILD_DIR exactly as createPhotoEntryFixture does. Create
// baseline/candidate Workers sequentially if their environment values differ.
// ipqcItems is the count in EACH of the AB/C approved source libraries. Each
// error group owns at most ten items. canvasNodes is the A-CUT canvas count;
// C-CUT retains one independent operation for the C query acceptance path.
export async function createProcessPlatformRound5Fixture(options={}){
  const ipqcItems=configuredCount(options.ipqcItems??process.env.ROUND5_IPQC_ITEMS??1,'ROUND5_IPQC_ITEMS');
  const canvasNodes=configuredCount(options.canvasNodes??process.env.ROUND5_CANVAS_NODES??1,'ROUND5_CANVAS_NODES');
  const fixture=await createPhotoEntryFixture();
  try{
    assert.equal(fixture.url.hostname,'127.0.0.1');
    const bucket=await fixture.mf.getR2Bucket('STATE_ARCHIVE');
    const load=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')({STATE_ARCHIVE:bucket});
    const values=await fixture.readValues();
    const users=JSON.parse(values.platformUsers);
    assert.equal(users.length,1);
    users.push({...users[0],id:'reviewer',name:'Synthetic Round5 Reviewer'});
    values.platformUsers=JSON.stringify(users);

    const standard=pngFixture({width:160,height:80,alpha:true});
    const method=pngFixture({width:120,height:60});
    const media=[
      {id:sha(standard),name:'round5-standard.png',note:'Synthetic standard photograph',bytes:standard,width:160,height:80},
      {id:sha(method),name:'round5-method.png',note:'Synthetic method photograph',bytes:method,width:120,height:60},
    ];
    for(const prefix of ['ipqc-ab/photos/','ipqc-c/photos/'])for(const photo of media){
      await bucket.put(prefix+photo.id,photo.bytes,{httpMetadata:{contentType:'image/png'}});
    }
    const photoRecord=photo=>({id:photo.id,name:photo.name,note:photo.note});
    const ab=JSON.parse(values.ipqcABMasterControl);
    const abScope=ab.scopes['A:G1'];
    const abActive=abScope.versions.find(v=>v.id===abScope.activeVersionId&&v.status==='approved');
    assert.equal(abActive.snapshot.items.length,1);
    Object.assign(abActive.snapshot.items[0],{
      standardPhotos:[photoRecord(media[0])],methodPhotos:[photoRecord(media[1])],
    });
    const expandItems=(snapshot,prefix)=>{
      const firstError=clone(snapshot.errors[0]),firstItem=clone(snapshot.items[0]);
      snapshot.errors=Array.from({length:Math.ceil(ipqcItems/10)},(_,index)=>({
        ...clone(firstError),id:index?prefix+'-error-'+(index+1):firstError.id,
        code:firstError.code.replace(/L\d+$/,'L'+(index+1)),
        name:index?'Synthetic '+prefix.toUpperCase()+' error group '+(index+1):firstError.name,
      }));
      snapshot.items=Array.from({length:ipqcItems},(_,index)=>{
        const error=snapshot.errors[Math.floor(index/10)];
        return {...clone(firstItem),id:index?prefix+'-item-'+(index+1):firstItem.id,
          errorId:error.id,code:error.code+'-'+String(index%10+1).padStart(2,'0'),
          standard:index?'10 mm · synthetic item '+(index+1):firstItem.standard};
      });
    };
    expandItems(abActive.snapshot,'ab');
    values.ipqcABMasterControl=JSON.stringify(ab);
    const ipqcC=JSON.parse(values.ipqcCMasterControl);
    const cActive=ipqcC.versions.find(v=>v.id===ipqcC.activeVersionId&&v.status==='approved');
    assert.equal(cActive.snapshot.items.length,1);
    Object.assign(cActive.snapshot.items[0],{
      notApplicable:false,notApplicableReason:'',mediaItems:media.map(photoRecord),
    });
    expandItems(cActive.snapshot,'c');
    values.ipqcCMasterControl=JSON.stringify(ipqcC);

    const authoring=JSON.parse(values.processAuthoringControl);
    const active=authoring.versions.find(v=>v.id===authoring.activeVersionId&&v.status==='approved');
    assert.equal(active.snapshot.workspaces.length,1);
    const content=clone(active.snapshot);
    const operation=content.workspaces[0].stages['A-CUT'][0];
    Object.assign(operation,{
      x:80,y:100,ipqcAssignments:[],
      instructionSteps:[{text:'Read the synthetic label',standard:'10 mm'}],
      mediaItems:[{id:'round5-operation-photo',name:media[0].name,note:'Synthetic operation image',type:'image',src:'data:image/png;base64,'+standard.toString('base64')}],
    });
    const aOperations=Array.from({length:canvasNodes},(_,index)=>index?{
      ...clone(operation),id:'round5-a-operation-'+(index+1),
      number:'A-'+String(index+1).padStart(2,'0'),name:'Synthetic A operation '+(index+1),
      x:80+(index%5)*380,y:100+Math.floor(index/5)*320,
    }:operation);
    for(let index=0;index<aOperations.length;index++)aOperations[index].nextIds=index+1<aOperations.length?[aOperations[index+1].id]:[];
    content.workspaces[0].stages['A-CUT']=aOperations;
    content.workspaces.push({
      id:JSON.stringify(['G1','C']),line:'C',category:'G1',
      stages:{'C-CUT':[{...clone(operation),id:'round5-c-operation',number:'C-01',name:'Synthetic C operation',stageCode:'C-CUT',templateId:'C-CUT-manual',productCodes:['C1'],nextIds:[],ipqcQueryEnabled:true}]},
    });
    active.snapshot=clone(content);
    authoring.workflow=load('lib/shared-draft.ts').createSharedDraft('process:platform',content,authoring.activeVersionId,'round5-authoring-generation');
    values.processAuthoringControl=JSON.stringify(authoring);

    const encoded=await load('lib/state-records.ts').encodeRecordValues(bucket,values);
    // All key enumeration is against this instance's fresh nonpersistent bucket.
    const keys=async()=>{
      const result=[];let cursor;
      do{const page=await bucket.list(cursor?{cursor}:{});result.push(...page.objects.map(o=>o.key));cursor=page.truncated?page.cursor:null;}while(cursor);
      return result;
    };
    const initialObjectKeys=new Set(await keys());
    const emptyFeedback=JSON.stringify({issues:[],attachments:[],batches:[],handoffs:[]});
    let resetCount=0;
    async function reset(){
      // Close the previous round's browser contexts before calling this method;
      // an old request must not race the next round's otherwise identical seed.
      await fixture.db.batch([
        fixture.db.prepare('UPDATE shared_state SET revision=1,"values"=?,updated_at=? WHERE id=1').bind(encoded,at),
        fixture.db.prepare('UPDATE web_feedback_store SET revision=0,payload=? WHERE id=1').bind(emptyFeedback),
        fixture.db.prepare('DELETE FROM process_login_limits'),
        fixture.db.prepare('DELETE FROM process_revoked_sessions'),
        fixture.db.prepare('DELETE FROM state_backups'),
      ]);
      const extra=(await keys()).filter(key=>!initialObjectKeys.has(key));
      for(let i=0;i<extra.length;i+=100)await bucket.delete(extra.slice(i,i+100));
      const row=await fixture.db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').first();
      assert.equal(row.revision,1);
      assert.equal(row.values,encoded);
      resetCount++;
      return {resetCount,revision:row.revision,fixtureHash:sha(encoded)};
    }
    await reset();
    return{
      ...fixture,reset,
      actors:{editor:'frank',reviewer:'reviewer'},
      fixtureHash:sha(encoded),
      counts:{workspaces:2,stages:2,operations:canvasNodes+1,aCanvasNodes:canvasNodes,cCanvasNodes:1,products:2,approvedAbItems:ipqcItems,approvedCItems:ipqcItems,approvedAbErrors:abActive.snapshot.errors.length,approvedCErrors:cActive.snapshot.errors.length,itemsPerErrorGroup:10,ipqcPhotoReferences:4*ipqcItems,distinctSyntheticPngs:2,operationPhotoReferences:canvasNodes+1},
      media:media.map(({bytes,...photo})=>({...photo,byteLength:bytes.length})),
      seed:{aOperationId:operation.id,cOperationId:'round5-c-operation',abItemId:abActive.snapshot.items[0].id,cItemId:cActive.snapshot.items[0].id,abVersionId:abActive.id,cVersionId:cActive.id,activeAuthoringId:authoring.activeVersionId,activeAuthoringSnapshot:clone(active.snapshot)},
      async readAuthoring(){
        let phase='d1-select';
        try{
          const row=await fixture.db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();
          assert.equal(typeof row?.values,'string','Synthetic shared_state manifest is required');
          phase='r2-handle';assert.equal(typeof bucket.get,'function','Cached synthetic R2 bucket is required');
          phase='decode';
          // Select this module only; do not defer any authoring content/history.
          const decoded=await load('lib/state-records.ts').decodeRecordValues(bucket,JSON.parse(row.values),{keys:['processAuthoringControl']});
          return JSON.parse(decoded.values.processAuthoringControl);
        }catch(error){
          const diagnostic={phase,error:readbackErrorSummary(error)};
          throw new Error('ROUND5_AUTHORING_READBACK_FAILED '+JSON.stringify(diagnostic),{cause:error});
        }
      },
    };
  }catch(error){await fixture.close();throw error;}
}
