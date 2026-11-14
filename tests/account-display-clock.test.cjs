// Execute the shipped clock during login/logout page replacement, without network ports.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
void test('display clock tolerates absent login shell and resumes on the next mounted header',()=>{
 const source=fs.readFileSync('public/process/app.js','utf8'),start=source.lastIndexOf('setInterval(() => {'),end=source.indexOf('}, 1000);',start);assert(start>=0&&end>start);
 const nodes=new Map(),context={Date,document:{querySelector:s=>nodes.get(s)||null},setInterval(callback,delay){assert.equal(delay,1000);context.tick=callback;}};
 vm.createContext(context);vm.runInContext(source.slice(start,end+'}, 1000);'.length),context);
 assert.doesNotThrow(()=>context.tick());const clock={textContent:''},board={textContent:''};nodes.set('#clock',clock);nodes.set('#board-clock',board);context.tick();assert(clock.textContent);assert(board.textContent);
 nodes.delete('#clock');board.textContent='';assert.doesNotThrow(()=>context.tick());assert(board.textContent);nodes.clear();assert.doesNotThrow(()=>context.tick());nodes.set('#clock',{textContent:''});context.tick();assert(nodes.get('#clock').textContent);
});
