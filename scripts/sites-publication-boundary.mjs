import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireProgramCommit} from '../lib/sites-publication-readiness.mjs';
export function publicationBoundary(values={}){
  requireProgramCommit(values);
  throw Error('SITES_REGISTRATION_AND_PUBLICATION_NOT_AUTHORIZED_BY_SOURCE_CHECK');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))publicationBoundary(process.env);
