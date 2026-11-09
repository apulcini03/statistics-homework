import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {startBrowser} from './browser-helper.mjs';
let browser;
const dir=process.env.HW5_FINAL_SCREENSHOT_DIR;
before(async()=>{if(dir)await mkdir(dir,{recursive:true});browser=await startBrowser();});
after(async()=>{if(browser){await browser.close();assert.deepEqual(browser.exceptions,[],'No unhandled JavaScript exceptions');}});
const actions=['calculateRiemannBtn','calculateLebesgueBtn','runComparisonBtn','runConvergenceBtn',
 'runDirichletBtn','runThomaeBtn','calculateNormalCdfBtn','compareNormalCdfBtn','runCdfAccuracyBtn','runCdfConvergenceBtn','runCdfBenchmarkBtn'];
const chartIds=()=>browser.evaluate('Object.values(Chart.instances).map(c=>({canvas:c.canvas.id,id:c.id}))');
const setFields=async fields=>{for(const [id,value] of Object.entries(fields))await browser.set(id,String(value));};

test('HW5 final integration: homepage status, navigation and all buttons repeatedly on one page',async()=>{
 await browser.navigate();
 const card=await browser.evaluate(`(()=>{const a=document.querySelector('a[href="homework-06/"]');return {href:a.getAttribute('href'),text:a.closest('.card').textContent,status:a.closest('.card').querySelector('.status').textContent}})()`);
 assert.equal(card.href,'homework-06/');assert.equal(card.status,'Completed');assert.match(card.text,/benchmarks and tail analysis/);
 await browser.evaluate("document.querySelector('a[href=\"homework-06/\"]').click()");
 await browser.waitFor("location.pathname==='/homework-06/' && document.readyState==='complete'");
 assert.equal((await chartIds()).length,0);
 assert.deepEqual(await browser.evaluate('[...document.querySelectorAll("button")].map(b=>b.id).sort()'),actions.slice().sort());
 for(const [functionId,method,levelMethod] of [['square','left','lower'],['sinc','right','upper'],['sin','midpoint','midpoint']]){
  await setFields({riemannFunction:functionId,riemannMethod:method,lebesgueFunction:functionId,lebesgueMethod:levelMethod,comparisonFunction:functionId,cdfBenchmarkRepeats:3});
  const previous=await chartIds();
  for(const id of actions)await browser.click(id);
  const current=await chartIds();assert.equal(current.length,14);assert.equal(new Set(current.map(c=>c.canvas)).size,14);
  assert.ok(current.every(c=>!previous.some(old=>old.id===c.id)),'Every plot was replaced by the repeated workflow');
  const labels=await browser.evaluate(`({r:Chart.getChart('riemannChart').data.datasets[0].label,
   l:lebesgueResults.textContent,c:comparisonSummary.textContent})`);
  const name={square:'x²',sinc:'sin(x)/x',sin:'sin(x)'}[functionId];
  assert.equal(labels.r,name);assert.ok(labels.l.includes(name));assert.ok(labels.c.includes(name));
  const consistent=await browser.evaluate(`(()=>{const base=NormalCdf.getState().results,e=NormalCdf.experiments.getState();
   const accuracy=e.accuracy.find(r=>r.x===1).results;
   return base.every((r,i)=>r.approximation===accuracy[i].approximation && r.absoluteError===accuracy[i].absoluteError
    && r.approximation===e.benchmark[i].approximation && accuracy[i].numericError===e.benchmark[i].error)
    && e.convergence.slice(0,2).every((g,i)=>g.rows.find(r=>r.n===1000).approximation===base[i].approximation);})()`);
  assert.equal(consistent,true,'Same x and parameters give identical values across CDF components');
 }
 await browser.evaluate("document.querySelector('a[href=\"../index.html\"]').click()");
 await browser.waitFor("location.pathname==='/index.html' && document.readyState==='complete'");
 assert.equal(await browser.evaluate("document.querySelector('a[href=\"homework-06/\"]').closest('.card').querySelector('.status').textContent"),'Completed');
});

test('HW5 final integration: lower valid limits, singularity correction and explicit failed series',async()=>{
 await browser.navigate(6);
 await setFields({riemannFunction:'inverseSqrt',riemannIntervals:1,lebesgueFunction:'inverseSqrt',lebesgueLevels:1,lebesgueSamples:1,
  comparisonFunction:'inverseSqrt',comparisonIntervals:1,comparisonLevels:1,comparisonSamples:1,comparisonRepeats:3,
  dirichletIntervals:1,thomaeMaximumDenominator:1,thomaeIntervals:1,thomaeNumerator:'0',thomaeDenominator:'1'});
 for(const method of ['left','right','midpoint']){
  await browser.set('riemannMethod',method);await browser.click('calculateRiemannBtn');
  assert.match(await browser.evaluate('riemannResults.textContent'),/Approximation: 2\.00000000000/);
  assert.match(await browser.evaluate('riemannResults.textContent'),/evaluations: 0/);
 }
 for(const method of ['lower','upper','midpoint']){
  await browser.set('lebesgueMethod',method);await browser.click('calculateLebesgueBtn');
  assert.match(await browser.evaluate('lebesgueResults.textContent'),/Analytic contribution: 0\.200000000000/);
  assert.match(await browser.evaluate('lebesgueResults.textContent'),/not rigorous bounds/);
 }
 for(const id of ['runComparisonBtn','runDirichletBtn','runThomaeBtn'])await browser.click(id);
 assert.equal(await browser.evaluate('comparisonTableBody.rows.length'),6);
 assert.match(await browser.evaluate('comparisonSummary.textContent'),/Adapted methods/);
 assert.match(await browser.evaluate('dirichletSummary.textContent'),/tagged-sum diagnostic: 1/);
 assert.match(await browser.evaluate('dirichletSummary.textContent'),/tagged-sum diagnostic: 0/);
 assert.match(await browser.evaluate('thomaeSummary.textContent'),/T\(0\)=1; T\(1\)=1/);
 await setFields({normalCdfX:0,normalCdfParameter:2});await browser.click('compareNormalCdfBtn');
 assert.ok(await browser.evaluate('NormalCdf.getState().results.every(r=>r.approximation===.5&&r.evaluations===0&&r.iterations===0)'));
 await setFields({normalCdfMethod:'erf-series',normalCdfX:4,normalCdfParameter:1,normalCdfTolerance:'1e-15'});
 await browser.click('calculateNormalCdfBtn');
 assert.equal(await browser.evaluate('NormalCdf.getState().results[2].status'),'not-converged');
 assert.equal(await browser.evaluate('NormalCdf.getState().results[2].approximation'),null);
 await setFields({cdfExperimentX:0,cdfExperimentN:2,cdfExperimentTerms:1,cdfExperimentTolerance:'1e-3',cdfBenchmarkRepeats:3});
 await browser.click('runCdfConvergenceBtn');await browser.click('runCdfBenchmarkBtn');
 assert.ok(await browser.evaluate('NormalCdf.experiments.getState().benchmark.every(r=>r.approximation===.5&&r.evaluations===0&&r.iterations===0)'));
 assert.ok(await browser.evaluate('NormalCdf.experiments.getState().convergence.every(g=>g.rows.every(r=>r.error===0))'));
});

test('HW5 final integration: upper valid limits preserve full calculations and finite data',async()=>{
 await browser.navigate(6);
 await setFields({riemannFunction:'inverseSqrt',riemannIntervals:10000,lebesgueFunction:'inverseSqrt',lebesgueLevels:10000,lebesgueSamples:100000,
  comparisonFunction:'square',comparisonIntervals:10000,comparisonLevels:10000,comparisonSamples:100000,comparisonRepeats:9,
  dirichletIntervals:1000,thomaeMaximumDenominator:200,thomaeIntervals:2000,thomaeNumerator:'9'.repeat(100),thomaeDenominator:'9'.repeat(100)});
 for(const id of ['calculateRiemannBtn','calculateLebesgueBtn','runComparisonBtn','runDirichletBtn','runThomaeBtn'])await browser.click(id);
 assert.match(await browser.evaluate('riemannResults.textContent'),/Subintervals: 10000/);
 assert.match(await browser.evaluate('riemannPlotNote.textContent'),/200 of 10000/);
 assert.match(await browser.evaluate('lebesgueResults.textContent'),/Domain midpoint samples M: 100000/);
 assert.match(await browser.evaluate('comparisonSummary.textContent'),/n=10000; K=10000; M=100000/);
 assert.match(await browser.evaluate('comparisonSummary.textContent'),/9 measured runs/);
 assert.match(await browser.evaluate('dirichletSummary.textContent'),/Constructed irrational tags: 1000/);
 assert.match(await browser.evaluate('thomaeSummary.textContent'),/lowest terms: 1\/1/);
 assert.equal(await browser.evaluate("Chart.getChart('thomaePointsChart').data.datasets[0].data.length"),1000);
 await setFields({normalCdfMethod:'trapezoidal',normalCdfParameter:100000,normalCdfX:-10});
 for(const method of ['trapezoidal','simpson']){
  await browser.set('normalCdfMethod',method);await browser.click('calculateNormalCdfBtn');
  assert.ok(await browser.evaluate(`(()=>{const r=NormalCdf.getState().results.find(r=>r.methodId==='${method}');return r.evaluations===100001&&r.approximation>0&&Math.abs(r.approximation/7.619853024160593e-24-1)<2e-6})()`));
 }
 await setFields({normalCdfMethod:'erf-series',normalCdfParameter:1000,normalCdfTolerance:'1e-15',normalCdfX:4});
 await browser.click('calculateNormalCdfBtn');assert.equal(await browser.evaluate('NormalCdf.getState().results[2].status'),'accuracy-warning');
 await setFields({cdfExperimentN:100000,cdfExperimentTerms:1000,cdfExperimentTolerance:'1e-15',cdfBenchmarkRepeats:15,cdfExperimentX:10});
 await browser.click('runCdfAccuracyBtn');await browser.click('runCdfBenchmarkBtn');
 const state=await browser.evaluate('NormalCdf.experiments.getState()');
 assert.equal(state.accuracy.length,13);assert.equal(state.tails.length,24);
 assert.ok(state.accuracy.every(row=>row.results.every(r=>Number.isFinite(r.approximation))));
 for(const r of state.benchmark.slice(0,2)){assert.equal(r.batches.length,15);assert.equal(r.evaluations,100001);assert.equal(r.approximation,1);assert.ok(r.survival>0);}
 assert.equal(state.benchmark[2].status,'unsupported');assert.equal(state.benchmark[2].medianMs,null);
 const finite=await browser.evaluate("Object.values(Chart.instances).every(c=>c.data.datasets.every(d=>d.data.every(p=>typeof p==='number'?Number.isFinite(p):p===null||Object.values(p).filter(v=>typeof v==='number').every(Number.isFinite))))");
 assert.equal(finite,true);
});

test('HW5 final integration: 320, 768 and 1440px with visible scrollbars and all experiments active',async()=>{
 const dimensions=[];
 const measure=async(width,phase)=>{
  const r=await browser.evaluate(`({inner:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,
   canvases:[...document.querySelectorAll('canvas')].map(c=>({id:c.id,width:c.getBoundingClientRect().width,
   available:c.parentElement.clientWidth-parseFloat(getComputedStyle(c.parentElement).paddingLeft)-parseFloat(getComputedStyle(c.parentElement).paddingRight)}))})`);
  assert.equal(r.inner,width);if(width===320)assert.equal(r.client,320);
  assert.ok(r.client>0&&r.client<=width);assert.equal(r.scroll,r.client,`${width}px ${phase}`);
  assert.equal(r.canvases.length,14);assert.ok(r.canvases.every(c=>c.width<=c.available+1),`${width}px ${phase}: canvas contained`);
  dimensions.push({width,phase,...r});
 };
 for(const width of [320,768,1440]){
  await browser.viewport(width);await browser.navigate(6);await measure(width,'initial');
  await browser.set('cdfBenchmarkRepeats','3');for(const id of actions)await browser.click(id);await measure(width,'all active');
  assert.equal((await chartIds()).length,14);
  for(const id of ['calculateRiemannBtn','compareNormalCdfBtn','runCdfConvergenceBtn'])await browser.click(id);
  await measure(width,'repeated');assert.equal((await chartIds()).length,14);
  if(dir)for(const id of ['riemannResults','normalCdfSummary','cdfCostConvergenceChart']){
   await browser.evaluate(`document.getElementById('${id}').scrollIntoView({block:'center'})`);
   const shot=await browser.send('Page.captureScreenshot',{format:'png'});
   await writeFile(path.join(dir,`${id}-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  await browser.set('cdfExperimentX','2');await browser.set('normalCdfX','');
  await measure(width,'after destroy');assert.equal((await chartIds()).length,8);
  await browser.set('normalCdfX','1');await browser.click('compareNormalCdfBtn');await browser.click('runCdfConvergenceBtn');
  await measure(width,'recreated');assert.equal((await chartIds()).length,14);
 }
 if(dir)await writeFile(path.join(dir,'viewport-measurements.json'),JSON.stringify(dimensions,null,2));
});
