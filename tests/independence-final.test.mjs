import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('HW6 final: event targets, accessible references, function names and publication links remain coherent',()=>{
  const html=read('homework-07/index.html'),script=read('homework-07/script.js');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  for(const [,id] of script.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
    assert.ok(ids.includes(id),'Missing event/render target '+id);
  }
  for(const [,references] of html.matchAll(/(?:for|aria-labelledby|aria-describedby)="([^"]+)"/g)) {
    for(const id of references.split(/\s+/))assert.ok(ids.includes(id),'Missing accessible target '+id);
  }
  const functions=[...script.matchAll(/^  function (\w+)\(/gm)].map(match=>match[1]);
  assert.equal(new Set(functions).size,functions.length,'No duplicate module-level functions');
  for(const name of functions){
    assert.ok([...script.matchAll(new RegExp('\\b'+name+'\\b','g'))].length>=2,'Unreferenced/unexported function '+name);
  }
  const homepage=read('index.html'),readme=read('README.md');
  assert.equal([...homepage.matchAll(/href="homework-07\/"/g)].length,1);
  assert.match(homepage,/<h3>Homework 6 — Statistical Independence<\/h3>/);
  assert.match(readme,/## Homework 6 — Statistical Independence/);
  assert.match(readme,/\[Open Homework 6\]\(https:\/\/apulcini03\.github\.io\/statistics-homework\/homework-07\/\)/);
  assert.match(readme,/homework-07\/\s+# HW 6 — Statistical Independence/);
});
