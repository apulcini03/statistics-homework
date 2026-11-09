import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {test} from 'node:test';

const root=fileURLToPath(new URL('../',import.meta.url));
test('HW5 final: unique HTML IDs, label/event targets, local dependencies and compilable script',()=>{
 const html=readFileSync(path.join(root,'homework-06/index.html'),'utf8');
 const script=readFileSync(path.join(root,'homework-06/script.js'),'utf8');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
 for(const m of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/g))assert.ok(ids.includes(m[1]),`Label target ${m[1]}`);
 for(const m of script.matchAll(/getElementById\(["']([^"']+)["']\)/g))assert.ok(ids.includes(m[1]),`Script target ${m[1]}`);
 for(const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)){
  if(/^(?:https?:|#)/.test(m[1]))continue;
  assert.ok(existsSync(path.resolve(root,'homework-06',m[1].split('#')[0])),m[1]);
 }
 assert.doesNotThrow(()=>new vm.Script(script));
});
