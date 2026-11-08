import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const script=readFileSync(new URL('../homework-06/script.js',import.meta.url),'utf8');
const make=source=>{const c=vm.createContext({document:{addEventListener(){}},performance,setTimeout});vm.runInContext(source,c);return vm.runInContext('NormalCdf',c);};
const normal=make(script), experiments=normal.experiments;
const ids=['trapezoidal','simpson','erf-series'];
const fine={n:10000,maxTerms:100,tolerance:1e-13};
const close=(a,b,t)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${a} vs ${b}, tolerance=${t}`);

// Source independent from the application catalog: CPython 3.10.7/macOS libm
// math.erfc, same reproducible command documented in the Step 6 vectors.
// https://docs.python.org/3.10/library/math.html#math.erfc
// Additional tail vectors use erfc directly, not 1 minus a rounded CDF.
const independent=[[0,.5],[.5,.30853753872598694],[1,.15865525393145705],[1.96,.02499789514822043],
 [2,.022750131948179216],[3,.0013498980316300957],[4,3.167124183311996e-5],
 [6,9.865876450377014e-10],[8,6.22096057427182e-16],[10,7.619853024160593e-24]];

test('CDF accuracy: independent source, ordered immutable catalog, survival and NIST precision',()=>{
 assert.match(experiments.numericSource.title,/CPython 3.10.7.*binary64/);
 assert.match(experiments.numericSource.limitation,/not|cannot/i);
 assert.equal(experiments.numericReferences.length,19);
 assert.ok(Object.isFrozen(experiments.numericReferences));
 let previous=-Infinity;
 for(const r of experiments.numericReferences){
  assert.ok(Object.isFrozen(r));assert.ok(r.x>previous);previous=r.x;
  assert.ok(r.cdf>=0&&r.cdf<=1&&r.survival>=0&&r.survival<=1);
  const opposite=experiments.numericReferences.find(v=>v.x===-r.x);
  assert.equal(r.cdf,opposite.survival);
 }
 for(const [x,tail] of independent){
  assert.equal(experiments.numericReferences.find(r=>r.x===x).survival,tail);
  assert.equal(experiments.numericReferences.find(r=>r.x===-x).cdf,tail);
 }
 assert.equal(normal.source.decimalPlaces,5);
 assert.equal(experiments.numericReferences.find(r=>r.x===10).cdf,1);
 assert.ok(experiments.numericReferences.find(r=>r.x===10).survival>0);
});

test('CDF accuracy: all 13 points, separate NIST/numeric differences and unchanged algorithms',()=>{
 const rows=experiments.accuracy(fine); assert.equal(rows.length,13);
 for(const row of rows)for(const r of row.results){
  const original=normal.calculate(r.methodId,row.x,r.methodId==='erf-series'?100:10000,1e-13);
  assert.equal(r.approximation,original.approximation); assert.equal(r.status,original.status);
  assert.equal(r.evaluations,original.evaluations);assert.equal(r.iterations,original.iterations);
  assert.equal(r.absoluteError,Math.abs(r.approximation-row.nist));assert.ok(r.absoluteError<=1e-5);
  assert.equal(r.numericError,Math.abs(r.approximation-row.numeric));
  assert.equal(r.error,r.numericError);assert.ok(r.numericError<=(r.methodId==='trapezoidal'?3e-8:3e-13));
 }
 const nist=experiments.calculate('simpson',1,{...fine,referenceKind:'nist'});
 assert.equal(nist.error,nist.absoluteError);assert.notEqual(nist.error,nist.numericError);
 assert.equal(experiments.calculate('simpson',.25,fine).error,null);
});

test('CDF convergence: actual schedules, Simpson parity, general improvement and separate work units',()=>{
 const groups=experiments.convergence(1,fine);
 assert.deepEqual(Array.from(groups[0].rows,r=>r.resolution),[20,50,100,200,500,1000,2000,5000,10000]);
 for(const g of groups.slice(0,2)){
  assert.ok(g.rows.at(-1).error<g.rows[0].error);
  for(const r of g.rows){assert.equal(r.n,r.resolution);assert.equal(r.evaluations,r.n+1);assert.equal(r.cost,r.evaluations);assert.equal(r.n%2,0);}
 }
 const series=groups[2].rows;
 assert.deepEqual(Array.from(series,r=>r.tolerance),[1e-3,1e-5,1e-7,1e-9,1e-11,1e-13,1e-15]);
 assert.ok(series.at(-1).error<series[0].error);
 assert.ok(series.at(-1).iterations>series[0].iterations);
 for(const r of series){assert.equal(r.cost,r.iterations);assert.equal(r.evaluations,0);assert.equal(r.maxTerms,100);}
 const atFour=experiments.convergence(4,fine)[2].rows;
 assert.ok(atFour.some(r=>r.status==='accuracy-warning'));
 // Do not assert strict error reduction for every tighter series tolerance.
 assert.ok(atFour.filter(r=>r.approximation!==null).every(r=>r.iterations>0));
 assert.equal(atFour[0].status,'error');assert.equal(atFour[0].approximation,null);
 assert.match(atFour[0].message,/invalid probability/);
});

test('CDF convergence: zeros, near-rounding errors, missing references and unsupported cases never fake log data',()=>{
 for(const g of experiments.convergence(0)){
  assert.ok(g.rows.every(r=>r.error===0&&r.cost===0&&/Zero/.test(r.errorClass)));
  assert.deepEqual(Array.from(experiments.logPoints(g.rows,'resolution')),[]);
 }
 const simpson=experiments.calculate('simpson',2,fine);assert.match(simpson.errorClass,/rounding scale/);
 const failed=experiments.convergence(4,{maxTerms:1})[2].rows;
 assert.ok(failed.every(r=>r.approximation===null&&r.status==='not-converged'));
 assert.equal(experiments.logPoints(failed,'cost').length,0);
 for(const g of experiments.convergence(.25))assert.equal(experiments.logPoints(g.rows,'resolution').length,0);
 const unsupported=experiments.convergence(11);
 assert.ok(unsupported.every(g=>g.rows.every(r=>r.status==='unsupported'&&r.error===null)));
 for(const g of experiments.convergence(1,fine))for(const axis of ['cost','resolution']){
  const points=experiments.logPoints(g.rows,axis);
  assert.ok(points.every(p=>p.x>0&&p.y>0));
  assert.equal(points.length,g.rows.filter(r=>r.error>0&&r[axis]>0).length);
 }
});

test('CDF tails: domains, stable negative CDF and direct positive survival, including rounded 1',()=>{
 const rows=experiments.tails(fine);assert.equal(rows.length,24);
 assert.deepEqual(Array.from(new Set(rows.map(r=>r.x))),[-10,-8,-6,-4,4,6,8,10]);
 for(const r of rows){
  if(r.methodId==='erf-series'&&Math.abs(r.x)>4){assert.equal(r.status,'unsupported');assert.equal(r.approximation,null);assert.equal(r.survival,null);continue;}
  const expected=independent.find(v=>v[0]===Math.abs(r.x))[1];
  const small=r.x<0?r.approximation:r.survival;
  assert.ok(Math.abs(small/expected-1)<2e-6);
  assert.ok(r.smallTailRelativeError<2e-6);assert.ok(r.survival>=0&&r.survival<=1);
  if(r.x>0&&r.methodId!=='erf-series')assert.equal(r.survival,r.tailProbability);
 }
 for(const id of ['trapezoidal','simpson']){
  const r=rows.find(r=>r.x===10&&r.methodId===id);
  assert.equal(r.approximation,1);assert.equal(r.numericError,0);assert.ok(r.survival>0);assert.ok(r.survivalError>0);
  assert.notEqual(r.survival,1-r.approximation);assert.match(r.message,/rounded to 1/);
 }
});

test('CDF experiments: invalid parameters, x and reference source rejected explicitly',()=>{
 for(const options of [{n:3},{n:0},{n:2.5},{n:100001},{n:'1000'},{n:NaN},{maxTerms:0},{maxTerms:1001},
  {tolerance:0},{tolerance:1e-16},{tolerance:Infinity},{referenceKind:'interpolated'},{repeats:2},{repeats:16},{repeats:3.5}]){
  assert.throws(()=>experiments.validateOptions(options));assert.throws(()=>experiments.accuracy(options));
 }
 for(const x of [NaN,Infinity,null,'1'])assert.throws(()=>experiments.convergence(x));
 assert.throws(()=>experiments.calculate('unknown',1));
});

test('CDF benchmark helpers: statistics and clock detection are deterministic',()=>{
 assert.deepEqual({...experiments.timingStatistics([3,1,2])},{minimumMs:1,medianMs:2,maximumMs:3});
 assert.equal(experiments.timingStatistics([1,4,2,3]).medianMs,2.5);
 for(const data of [[],[NaN],[-1],[Infinity]])assert.throws(()=>experiments.timingStatistics(data));
 let t=0; close(experiments.timerResolution(()=>t+=.25),.25,0);
 assert.equal(experiments.timerResolution(()=>1),null);
 assert.throws(()=>experiments.timerResolution(()=>NaN));
 let backwards=10;assert.throws(()=>experiments.timerResolution(()=>backwards--));
});

test('CDF benchmark: warm-up, adaptive real algorithm calls, repeated batches and timer limitation',async()=>{
 // Instrument only the existing implementation's entry, preserving every computation.
 const c=vm.createContext({document:{addEventListener(){}},performance,setTimeout,calls:0,clock:0});
 vm.runInContext(script.replace('function trapezoidal(x, n = 1000) {','function trapezoidal(x, n = 1000) { globalThis.calls++;globalThis.clock+=.1;'),c);
 const e=vm.runInContext('NormalCdf.experiments',c);let yields=0;
 const r=await e.benchmarkMethod('trapezoidal',1,{n:20,repeats:5},{now:()=>c.clock,pause:async()=>{yields++;}});
 assert.equal(r.warmupCalls,3);assert.equal(r.batches.length,5);assert.ok(r.batchSize>1&&r.batchSize<=65536);
 assert.equal(c.calls,1+r.warmupCalls+r.calibrationCalls+r.measuredCalls); // One untimed accuracy probe.
 assert.equal(r.measuredCalls,r.batches.reduce((sum,b)=>sum+b.calls,0));
 assert.ok(r.minimumMs<=r.medianMs&&r.medianMs<=r.maximumMs);close(r.medianMs,.1,1e-12);
 assert.ok(yields>=6);assert.equal(r.timerResolutionMs,null);assert.match(r.benchmarkStatus,/limit/);
 assert.equal(r.evaluations,21);assert.equal(r.iterations,20);
});

test('CDF benchmark: all methods, unsupported/nonconvergent skip and cancellation',async()=>{
 let clock=0;const runtime={now:()=>clock+=10,pause:async()=>{}};
 const rows=await experiments.benchmark(1,{n:20,repeats:3},runtime);
 assert.equal(rows.length,3);assert.ok(rows.every(r=>r.batches.length===3));
 for(const r of rows){assert.ok(r.maximumMs>=r.medianMs&&r.medianMs>=r.minimumMs);assert.ok(r.measuredCalls>=3);}
 const unsupported=await experiments.benchmarkMethod('erf-series',8,{},runtime);
 assert.equal(unsupported.status,'unsupported');assert.equal(unsupported.medianMs,null);assert.equal(unsupported.warmupCalls,0);
 const failed=await experiments.benchmarkMethod('erf-series',4,{maxTerms:1},runtime);
 assert.equal(failed.status,'not-converged');assert.equal(failed.batches.length,0);
 await assert.rejects(experiments.benchmark(1,{}, {...runtime,isCancelled:()=>true}),/cancelled/);
 let cancelled=false;
 await assert.rejects(experiments.benchmarkMethod('simpson',1,{n:20},{...runtime,isCancelled:()=>cancelled,pause:async()=>{cancelled=true;}}),/cancelled/);
 await assert.rejects(experiments.benchmarkMethod('simpson',1,{repeats:2},runtime));
});

test('CDF experiments: accuracy, convergence and tails delegate to the existing method catalog',()=>{
 let instrumented=script;
 for(const [signature,id] of [["function trapezoidal(x, n = 1000) {",'trapezoidal'],["function simpson(x, n = 1000) {",'simpson'],["function erfSeries(x, maxTerms = 100, tolerance = 1e-12) {",'erf-series']]){
  instrumented=instrumented.replace(signature,signature+` globalThis.calls['${id}']++;`);
 }
 const c=vm.createContext({document:{addEventListener(){}},calls:{trapezoidal:0,simpson:0,'erf-series':0}});
 vm.runInContext(instrumented,c);const e=vm.runInContext('NormalCdf.experiments',c);
 e.accuracy({n:20});e.convergence(1);e.tails({n:20});
 assert.deepEqual(c.calls,{trapezoidal:30,simpson:30,'erf-series':22});
});
