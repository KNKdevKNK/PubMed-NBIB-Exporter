import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const manifest=JSON.parse(await readFile(new URL('../manifest.json',import.meta.url),'utf8'));
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
assert.equal(manifest.version,pkg.version);
assert.deepEqual(manifest.host_permissions,['https://pubmed.ncbi.nlm.nih.gov/*','https://eutils.ncbi.nlm.nih.gov/*']);
for(const file of ['api.mjs','app.mjs','background.js','content.js','core.mjs','native-policy.mjs','runner.mjs','test.mjs']) {
  const result=spawnSync(process.execPath,['--check',file],{cwd:new URL('../',import.meta.url),stdio:'inherit'});
  if(result.status!==0) process.exit(result.status || 1);
}
console.log('Syntax, manifest version, and host permission checks passed.');
