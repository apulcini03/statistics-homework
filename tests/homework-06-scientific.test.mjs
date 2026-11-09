import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const html=readFileSync(new URL('../homework-06/index.html',import.meta.url),'utf8');
const context=vm.createContext({document:{addEventListener(){}},performance,setTimeout});
vm.runInContext(readFileSync(new URL('../homework-06/script.js',import.meta.url),'utf8'),context);
const evaluate=expression=>vm.runInContext(expression,context);
const conclusions=html.slice(html.indexOf('<h2>Results and Conclusions</h2>'));
const paragraphs=[...conclusions.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m=>m[1].replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim());
const cited=(paragraph,value)=>assert.ok(paragraph.includes(value.toExponential(2)),`Missing verified rounded value ${value.toExponential(2)}`);

test('Scientific conclusions: cited x² errors match actual n, K and M configurations',()=>{
 const p=paragraphs.find(p=>p.startsWith('For x² on [0,1]'));
 assert.ok(p);assert.match(p,/refining n from 20 to 1000/);assert.match(p,/\(20,400\).*\(1000,20000\)/);
 for(const n of [20,1000])cited(p,evaluate(`calculateRiemann('square',${n},'midpoint').absoluteError`));
 for(const method of ['left','right'])cited(p,evaluate(`calculateRiemann('square',1000,'${method}').absoluteError`));
 for(const n of [20,1000])cited(p,evaluate(`calculateLebesgue('square',${n},${n*20},'midpoint').absoluteError`));
 const improper=paragraphs.find(p=>p.includes('unbounded 1/sqrt(x)'));
 assert.equal(evaluate("calculateRiemann('inverseSqrt',1,'left').approximation"),2);
 assert.equal(evaluate("calculateLebesgue('inverseSqrt',20,2000,'midpoint').analyticContribution"),.2);
 assert.match(improper,/improper integral of 2/);assert.match(improper,/0\.2 on \(0,0\.01\]/);
});

test('Scientific conclusions: CDF differences, term counts and tail value match existing experiments',()=>{
 const p=paragraphs.find(p=>p.startsWith('At x=1,'));assert.ok(p);
 assert.match(p,/n from 20 to 10000/);assert.match(p,/from 1e-3 to 1e-15/);
 const groups=evaluate('NormalCdf.experiments.convergence(1)');
 for(const group of groups){cited(p,group.rows[0].error);cited(p,group.rows.at(-1).error);}
 assert.equal(groups[2].rows[0].iterations,4);assert.equal(groups[2].rows.at(-1).iterations,13);
 assert.match(p,/from 4 to 13/);assert.match(p,/binary64 vectors, not certified errors/);assert.match(p,/NIST's five-decimal table/);
 const tail=paragraphs.find(p=>p.startsWith('At x=10 and n=10000,'));
 const r=evaluate("NormalCdf.experiments.calculate('simpson',10,{n:10000})");
 cited(tail,r.survival);assert.equal(r.approximation,1);assert.ok(r.survival>0);
 assert.match(tail,/not a mathematically exact probability/);
 assert.doesNotMatch(conclusions,/final analysis will|CDF will be evaluated|The conclusions will/);
});
