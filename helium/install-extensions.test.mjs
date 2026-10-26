import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stage,SHORTCUT_IDS,registration,EXTENSIONS} from './install-extensions.mjs';
function fixture(fn){const root=mkdtempSync(join(tmpdir(),'helium-stage-test-'));try{fn(root)}finally{rmSync(root,{recursive:true,force:true})}}
test('curated IDs and store update endpoint',()=>{assert.equal(Object.keys(EXTENSIONS).length,11);for(const id of Object.keys(EXTENSIONS))assert.match(id,/^[a-p]{32}$/);assert.equal(registration.external_update_url,'https://clients2.google.com/service/update2/crx')});
test('stage two, read back, idempotent, no profile changes',()=>fixture(root=>{writeFileSync(join(root,'Preferences'),'sentinel');const a=stage({root,ids:SHORTCUT_IDS});assert.equal(a.length,2);for(const x of a){assert.equal(x.live,false);assert.deepEqual(JSON.parse(readFileSync(x.registration)),registration)}assert.deepEqual(stage({root,ids:SHORTCUT_IDS}),a);assert.equal(readFileSync(join(root,'Preferences'),'utf8'),'sentinel');assert.equal(existsSync(join(root,'Default')),false)}));
test('dry run writes nothing',()=>fixture(root=>{assert.equal(stage({root,ids:SHORTCUT_IDS,dryRun:true}).length,2);assert.equal(existsSync(join(root,'External Extensions')),false)}));
test('invalid IDs rejected before writes',()=>fixture(root=>{assert.throws(()=>stage({root,ids:[SHORTCUT_IDS[0],'../../bad']}));assert.equal(existsSync(join(root,'External Extensions')),false)}));
test('conflicting registration preserved',()=>fixture(root=>{const [entry]=stage({root,ids:[SHORTCUT_IDS[0]]});writeFileSync(entry.registration,'{}');assert.throws(()=>stage({root,ids:SHORTCUT_IDS}),/refusing overwrite/);assert.equal(readFileSync(entry.registration,'utf8'),'{}');assert.equal(existsSync(join(root,'External Extensions',SHORTCUT_IDS[1]+'.json')),false)}));
