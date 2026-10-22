import {defineConfig} from 'drizzle-kit';
// Output is a NEW baseline candidate. Default/applied ./drizzle is untouched.
export default defineConfig({out:'./drizzle-sites-fresh',schema:'./db/sites-fresh-schema.ts',dialect:'sqlite'});
