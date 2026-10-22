import fs from 'node:fs';
import {validateSnapshot} from '../lib/snapshot-contract.mjs';
const [filename,...extra]=process.argv.slice(2);
if(!filename||extra.length)throw Error('Usage: node scripts/snapshot-inspect.mjs <manifest.json>');
if(fs.statSync(filename).size>16*1024*1024)throw Error('Manifest too large');
console.log(JSON.stringify(validateSnapshot(JSON.parse(fs.readFileSync(filename,'utf8')))));
