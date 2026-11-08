import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {startBrowser} from './browser-helper.mjs';
let browser;
const dir=process.env.CDF_ACCURACY_SCREENSHOT_DIR;
before(async()=>{if(dir)await mkdir(dir,{recursive:true});browser=await startBrowser();});
after(async()=>{if(browser){await browser.close();assert.deepEqual(browser.exceptions,[],'No unhandled JavaScript exceptions');}});
const state=()=>browser.evaluate('NormalCdf.experiments.getState()');

test('CDF accuracy UI: separate sources, 13 points, 24 tail records and numeric status',async()=>{
 await browser.navigate(6);assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'),0);
 await browser.click('runCdfAccuracyBtn');const s=await state();
 assert.equal(s.accuracy.length,13);assert.equal(s.tails.length,24);
 const rows=await browser.evaluate('[...cdfAccuracyBody.rows].map(r=>[...r.cells].map(c=>c.textContent))');
 assert.equal(rows.length,13);assert.ok(rows.every(row=>row.length===15&&/^\d\.\d{5}$/.test(row[1])));
 for(let i=0;i<13;i++)for(let m=0;m<3;m++){
  assert.equal(Number(rows[i][3+4*m]),s.accuracy[i].results[m].approximation===null?NaN:Number(s.accuracy[i].results[m].approximation.toPrecision(15)));
  assert.equal(Number(rows[i][4+4*m]),Number(s.accuracy[i].results[m].absoluteError.toPrecision(15)));
  assert.equal(Number(rows[i][5+4*m]),Number(s.accuracy[i].results[m].numericError.toPrecision(15)));
 }
 assert.equal(s.tails.filter(r=>r.status==='unsupported').length,6);
 const tail=s.tails.find(r=>r.x===10&&r.methodId==='simpson');
 assert.equal(tail.approximation,1);assert.ok(tail.survival>0);assert.equal(tail.numericError,0);
 assert.match(await browser.evaluate('cdfAccuracySummary.textContent'),/not mathematically exact/);
 assert.equal(await browser.evaluate('cdfTailBody.rows.length'),24);
});

test('CDF convergence UI: separate log charts, real costs, repeated updates and explicit zeros',async()=>{
 await browser.navigate(6);await browser.click('runCdfConvergenceBtn');
 assert.equal(await browser.evaluate('cdfConvergenceBody.rows.length'),25);
 const chartData=()=>browser.evaluate(`Object.values(Chart.instances).map(c=>({id:c.id,canvas:c.canvas.id,
  x:c.options.scales.x.type,y:c.options.scales.y.type,reverse:!!c.options.scales.x.reverse,
  datasets:c.data.datasets.map(d=>d.data)}))`);
 const old=await chartData();assert.equal(old.length,4);
 assert.ok(old.every(c=>c.x==='logarithmic'&&c.y==='logarithmic'));
 assert.equal(old.find(c=>c.canvas==='cdfSeriesConvergenceChart').reverse,true);
 for(const c of old)for(const ds of c.datasets)assert.ok(ds.every(p=>p.x>0&&p.y>0));
 await browser.click('runCdfConvergenceBtn');assert.ok((await chartData()).every(c=>!old.some(o=>o.id===c.id)));
 assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'),4);
 await browser.set('cdfExperimentX','0');assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'),0);
 await browser.click('runCdfConvergenceBtn');
 assert.ok((await chartData()).every(c=>c.datasets.every(ds=>ds.length===0)));
 assert.ok((await state()).convergence.every(g=>g.rows.every(r=>r.error===0)));
 assert.match(await browser.evaluate('cdfConvergenceSummary.textContent'),/Zero errors omitted from log charts: 25/);
 await browser.set('cdfExperimentX','.25');await browser.click('runCdfConvergenceBtn');
 assert.ok((await state()).convergence.every(g=>g.rows.every(r=>r.referenceValue===null&&r.error===null)));
 assert.match(await browser.evaluate('cdfConvergenceSummary.textContent'),/Unavailable\/failed points: 25/);
 await browser.set('cdfExperimentX','1');await browser.set('cdfReferenceKind','nist');await browser.click('runCdfConvergenceBtn');
 assert.ok((await state()).convergence.every(g=>g.rows.every(r=>r.error===r.absoluteError)));
 assert.ok(await browser.evaluate("Chart.getChart('cdfSimpsonConvergenceChart').options.scales.y.title.text.includes('NIST (5 d.p.)')"));
});

test('CDF convergence UI: unsupported and nonconvergent series never create fake plot points',async()=>{
 await browser.navigate(6);await browser.set('cdfExperimentX','8');await browser.click('runCdfConvergenceBtn');
 assert.ok((await state()).convergence[2].rows.every(r=>r.status==='unsupported'&&r.approximation===null));
 assert.equal(await browser.evaluate("Chart.getChart('cdfSeriesConvergenceChart').data.datasets[0].data.length"),0);
 await browser.set('cdfExperimentX','4');await browser.set('cdfExperimentTerms','1');await browser.click('runCdfConvergenceBtn');
 assert.ok((await state()).convergence[2].rows.every(r=>r.status==='not-converged'&&r.iterations===1));
 assert.equal(await browser.evaluate("Chart.getChart('cdfSeriesConvergenceChart').data.datasets[0].data.length"),0);
});

test('CDF benchmark UI: real repeated batches, coherent metrics and no rendering in timed calls',async()=>{
 await browser.navigate(6);await browser.click('runCdfConvergenceBtn');
 const ids=await browser.evaluate('Object.keys(Chart.instances)');
 await browser.click('runCdfBenchmarkBtn');const rows=(await state()).benchmark;
 assert.equal(rows.length,3);assert.equal(await browser.evaluate('cdfBenchmarkBody.rows.length'),3);
 assert.deepEqual(await browser.evaluate('Object.keys(Chart.instances)'),ids);
 for(const r of rows){
  assert.equal(r.warmupCalls,3);assert.equal(r.batches.length,5);assert.ok(r.calibrationCalls>0);
  assert.ok(r.minimumMs<=r.medianMs&&r.medianMs<=r.maximumMs);
  assert.equal(r.measuredCalls,r.batches.reduce((sum,b)=>sum+b.calls,0));
  assert.ok(r.batches.every(b=>b.calls>0&&b.calls<=65536&&b.elapsedMs>=0));
  assert.ok(/indicative|observed/.test(r.benchmarkStatus));
 }
 assert.match(await browser.evaluate('cdfBenchmarkSummary.textContent'),/exclude all rendering/);
 if(dir){await writeFile(path.join(dir,'benchmark-results.json'),JSON.stringify({browser:await browser.send('Browser.getVersion'),rows},null,2));}
 await browser.set('cdfExperimentX','8');await browser.click('runCdfBenchmarkBtn');
 const skipped=(await state()).benchmark[2];assert.equal(skipped.status,'unsupported');assert.equal(skipped.medianMs,null);assert.equal(skipped.batches.length,0);
});

test('CDF benchmark UI: edits cancel a running job and prevent stale publication or button state',async()=>{
 await browser.navigate(6);
 await browser.evaluate(`runCdfBenchmarkBtn.click();cdfExperimentX.value='2';cdfExperimentX.dispatchEvent(new Event('input',{bubbles:true}));`);
 await browser.evaluate('new Promise(resolve=>setTimeout(resolve,100))');
 assert.equal((await state()).benchmark,null);assert.equal(await browser.evaluate('cdfBenchmarkBody.rows.length'),0);
 assert.equal(await browser.evaluate('runCdfBenchmarkBtn.disabled'),false);
 await browser.click('runCdfBenchmarkBtn');assert.ok((await state()).benchmark.every(r=>r.x===2));
 await browser.set('cdfExperimentX','1');assert.equal((await state()).benchmark,null);assert.equal(await browser.evaluate('cdfBenchmarkBody.rows.length'),0);
});

test('CDF experiments UI: invalid settings produce no old tables or charts',async()=>{
 await browser.navigate(6);
 for(const [id,value] of [['cdfExperimentN','3'],['cdfExperimentN','100001'],['cdfExperimentTerms','0'],['cdfExperimentTolerance','0']]){
  await browser.set('cdfExperimentN','1000');await browser.set('cdfExperimentTerms','100');await browser.set('cdfExperimentTolerance','1e-12');
  await browser.click('runCdfAccuracyBtn');await browser.click('runCdfConvergenceBtn');
  await browser.set(id,value);await browser.click('runCdfAccuracyBtn');await browser.click('runCdfConvergenceBtn');
  assert.equal(await browser.evaluate('cdfAccuracyBody.rows.length+cdfConvergenceBody.rows.length+cdfTailBody.rows.length'),0);
  assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'),0);
  assert.equal((await state()).accuracy,null);assert.equal((await state()).convergence,null);
 }
 await browser.set('cdfExperimentTolerance','1e-12');
 for(const x of ['', '1e309']){await browser.set('cdfExperimentX',x);await browser.click('runCdfConvergenceBtn');assert.equal((await state()).convergence,null);}
 await browser.set('cdfExperimentX','1');await browser.set('cdfBenchmarkRepeats','2');await browser.click('runCdfBenchmarkBtn');
 assert.equal((await state()).benchmark,null);assert.match(await browser.evaluate('cdfBenchmarkSummary.textContent'),/repetitions/);
});

test('CDF experiments UI: coexist with all Exercise 1 charts and Step 6 state',async()=>{
 await browser.navigate(6);
 for(const id of ['calculateRiemannBtn','calculateLebesgueBtn','runComparisonBtn','runConvergenceBtn','runDirichletBtn','runThomaeBtn','compareNormalCdfBtn'])await browser.click(id);
 const baseline=await browser.evaluate(`({ids:Object.keys(Chart.instances),cdf:NormalCdf.getState(),summaries:[riemannResults.textContent,lebesgueResults.textContent,comparisonSummary.textContent,convergenceSummary.textContent,dirichletSummary.textContent,thomaeSummary.textContent]})`);
 assert.equal(baseline.ids.length,10);
 await browser.click('runCdfAccuracyBtn');await browser.click('runCdfConvergenceBtn');await browser.click('runCdfBenchmarkBtn');
 assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'),14);
 await browser.set('cdfExperimentX','0');
 const after=await browser.evaluate(`({ids:Object.keys(Chart.instances),cdf:NormalCdf.getState(),summaries:[riemannResults.textContent,lebesgueResults.textContent,comparisonSummary.textContent,convergenceSummary.textContent,dirichletSummary.textContent,thomaeSummary.textContent]})`);
 assert.deepEqual(after,baseline);
});

test('CDF experiments UI: standard Chrome viewport, 320px/desktop, tables and canvas recreation fit',async()=>{
 await browser.navigate(6);
 for(const width of [320,1440]){
  await browser.viewport(width);
  for(const action of ['pending','calculated','destroyed','recreated']){
   if(action==='calculated'||action==='recreated'){await browser.click('runCdfAccuracyBtn');await browser.click('runCdfConvergenceBtn');}
   if(action==='destroyed')await browser.set('cdfExperimentX','1');
   const size=await browser.evaluate(`({inner:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,
    canvases:[...document.querySelectorAll('[id^="cdf"][id$="Chart"]')].map(c=>({width:c.getBoundingClientRect().width,
    available:c.parentElement.clientWidth-parseFloat(getComputedStyle(c.parentElement).paddingLeft)-parseFloat(getComputedStyle(c.parentElement).paddingRight)}))})`);
   assert.equal(size.inner,width);if(width===320)assert.equal(size.client,320);
   assert.equal(size.scroll,size.client);assert.ok(size.canvases.every(c=>c.width<=c.available+1));
  }
  if(dir){
   for(const id of ['cdfExperimentControls','cdfSimpsonConvergenceChart','cdfCostConvergenceChart']){
    await browser.evaluate(`document.getElementById('${id}').scrollIntoView({block:'center'})`);
    const shot=await browser.send('Page.captureScreenshot',{format:'png'});
    await writeFile(path.join(dir,`${id}-${width}.png`),Buffer.from(shot.data,'base64'));
   }
  }
 }
});
