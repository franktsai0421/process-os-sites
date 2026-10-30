const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),{performance:_performance}=require('node:perf_hooks');
function load(file){const window={addEventListener(){}},source=fs.readFileSync(file,'utf8'),context={window,document:{documentElement:{lang:'zh'}}};require('./entry-performance/fixture-ports.cjs')(context);vm.runInNewContext(source.replace('})(window);','host.diff=snapshotChanges;})(window);'),context);return window.diff;}
// Reference strict-equality algorithm retained as a semantic oracle, not a shipped old module.
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function original(base,next){const patches=[],guards=[];
    for(const collection of ['categories','suppliers','parts','errors','items']){
      for(const old of base[collection])if(!next[collection].some(row=>row.id===old.id)){const path=[collection,{id:old.id}];patches.push({op:'remove',path});guards.push({path,value:old});}
      for(const row of next[collection]){const old=base[collection].find(value=>value.id===row.id);
        if(!old){patches.push({op:'insert',path:[collection],value:row});continue;}
        for(const [field,value]of Object.entries(row))if(field!=='equipmentSnapshot'&&value!==undefined&&!equal(value,old[field])){
          const path=[collection,{id:row.id},field];patches.push({op:'set',path,value});
          guards.push({path,value:old[field]});
        }
      }
    }return{patches,guards};
  }

const candidate=load(path.resolve('public/process/iqc-master.js'));
let seed=79863;const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;},empty=()=>({categories:[],suppliers:[],parts:[],errors:[],items:[]});
let cases=0;function check(a,b){const before=structuredClone([a,b]);assert.deepStrictEqual(structuredClone(candidate(a,b)),structuredClone(original(a,b)));assert.deepStrictEqual([a,b],before);cases++;}
for(let run=0;run<150;run++){const a=empty(),b=empty();for(const k of Object.keys(a)){for(let i=0;i<rand(25)+2;i++)a[k].push({id:'id'+i,nameVi:'中文 Việt '+i,nested:{x:[1,2]},equipmentSnapshot:{id:'eq'}});b[k]=structuredClone(a[k]);if(b[k].length){b[k][rand(b[k].length)].nameVi='modified';b[k][0].equipmentSnapshot={id:'ignored'};b[k][0].optional=undefined;if(rand(2))b[k].splice(rand(b[k].length),1);}b[k].push({id:'new',nameVi:'new',photos:[{id:'photo2'},{id:'photo1'}]});}check(a,b);}
const a=empty();a.parts=[{id:'same',nameVi:'first'},{id:'same',nameVi:'second'},{id:'gone',nameVi:'gone'}];const b=empty();b.parts=[{id:'same',nameVi:'second'},{id:'same',nameVi:'third'}];check(a,b);
for(const id of [NaN,Infinity,-Infinity,0,-0,1,null,undefined,{},['id'],true]){const x=empty(),y=empty();x.items=[{id,x:1}];y.items=[{id,x:1}];check(x,y);}
console.log(JSON.stringify({status:'PASS',equivalenceCases:cases,scope:'shipped snapshotChanges versus strict equality reference; no timing threshold'},null,2));
