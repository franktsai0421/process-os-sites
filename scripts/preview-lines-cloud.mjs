// Local-only, synthetic preview. Never connects to an existing Site or database.
import fs from 'node:fs';
import path from 'node:path';
import {createLinesFixture} from '../tests/lines-native-fixture.mjs';
const {fixture,password,users}=await createLinesFixture();
const credentials=path.join(fixture.runtime,'preview-access.json');
fs.writeFileSync(credentials,JSON.stringify({url:fixture.url.href,users,password},null,2),{mode:0o600});
console.log(JSON.stringify({localOnly:true,url:fixture.url.href,credentials,programCommit:fixture.programCommit,buildEntrySha256:fixture.buildEntrySha256,synthetic:true}));
let closing=false;
const removeCredentials=()=>fs.rmSync(credentials,{force:true});
async function close(){if(closing)return;closing=true;removeCredentials();await fixture.close();process.exit(0);}
// The native runtime also handles signals and may exit synchronously. Remove
// this fixture's password before its handler runs, with an exit fallback.
process.once('exit',removeCredentials);
process.prependListener('SIGINT',close);process.prependListener('SIGTERM',close);
