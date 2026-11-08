import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startBrowser } from './browser-helper.mjs';

let browser;
before(async()=>{ browser=await startBrowser(); });
after(async()=>{
  if(!browser)return;
  await browser.close(); assert.deepEqual(browser.exceptions,[], 'No unhandled JavaScript exceptions');
});
const state=()=>browser.evaluate('NormalCdf.getState()');
const summary=()=>browser.evaluate('normalCdfSummary.textContent');

// Real Chrome tests, no fake Chart.js implementation or numeric methods.
test('Normal CDF methods UI: selected calculation, three-method comparison and truthful metrics',async()=>{
  await browser.navigate(6);
  await browser.click('calculateNormalCdfBtn');
  let s=await state();
  assert.ok(Math.abs(s.results[0].approximation-.8413447460685429)<3e-6);
  assert.equal(s.results[0].evaluations,1001);
  assert.ok(s.results.slice(1).every(r=>r.status==='pending' && r.approximation===null));
  await browser.click('compareNormalCdfBtn'); s=await state();
  assert.equal(s.results.length,3);
  assert.ok(s.results.every(r=>Number.isFinite(r.approximation) && r.elapsedMs>=0));
  assert.equal(s.results[1].evaluations,1001); assert.equal(s.results[2].evaluations,0);
  assert.ok(s.results[2].iterations>0);
  const rows=await browser.evaluate('[...normalCdfTableBody.rows].map(r=>[...r.cells].map(c=>c.textContent))');
  assert.equal(rows.length,3); assert.ok(rows.every(row=>row.length===9 && row[2]==='0.84134'));
  assert.equal(rows[0][8],'n=1000'); assert.match(rows[2][8],/max terms=100; tolerance=1e-12/);
  assert.equal(await browser.evaluate("Chart.getChart('normalCdfErrorChart').data.datasets[0].data.length"),3);
});

test('Normal CDF methods UI: graphs use Gaussian points, exact marker and x-limited fill; replace on rerun',async()=>{
  await browser.navigate(6);
  let previous=[];
  for(const x of [-4,0,1.96,4,-8]) {
    await browser.set('normalCdfX',String(x));
    await browser.click('compareNormalCdfBtn');
    const r=await browser.evaluate(`(()=>{const c=Chart.getChart('normalCdfDensityChart');return {
      ids:Object.values(Chart.instances).map(c=>c.id),
      data:c.data.datasets.map(d=>d.data), count:Object.keys(Chart.instances).length,
      axes:c.options.scales.x.type, bounds:[c.options.scales.x.min,c.options.scales.x.max], summary:normalCdfPlotNote.textContent,
      errors:Chart.getChart('normalCdfErrorChart')?.data.datasets[0].data??null};})()`);
    assert.ok(r.ids.every(id=>!previous.includes(id))); previous=r.ids;
    assert.equal(r.count,x===-8?1:2); assert.equal(r.axes,'linear');
    assert.deepEqual(r.bounds,[-Math.max(6,Math.abs(x)+1),Math.max(6,Math.abs(x)+1)]);
    for(const p of r.data[0]) assert.ok(Math.abs(p.y-Math.exp(-p.x*p.x/2)/Math.sqrt(2*Math.PI))<1e-15);
    assert.ok(r.data[1].every(p=>p.x<=x)); assert.equal(r.data[1].at(-1).x,x);
    assert.ok(r.data[2].every(p=>p.x===x)); assert.equal(r.data[2][0].y,0);
    assert.match(r.summary,/truncated.*left tail.*Rendering is excluded/);
    if(x===0) assert.deepEqual(r.errors,[0,0,0]);
    if(x===-8) { const s=await state(); assert.equal(s.results[2].status,'error'); assert.equal(s.results[2].approximation,null); }
  }
});

test('Normal CDF methods UI: edits invalidate old tables/charts; no interpolated reference',async()=>{
  await browser.navigate(6);
  for(const [id,value] of [['normalCdfX','0.25'],['normalCdfParameter','2000'],['normalCdfTolerance','1e-10'],['normalCdfMethod','simpson']]) {
    await browser.click('compareNormalCdfBtn');
    await browser.set(id,value);
    assert.ok((await state()).results.every(r=>r.approximation===null && r.absoluteError===null));
    assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'),0);
    assert.ok(await browser.evaluate('[...normalCdfTableBody.rows].every(r=>r.cells[1].textContent==="Not computed")'));
  }
  await browser.click('compareNormalCdfBtn');
  assert.ok((await state()).results.every(r=>r.reference===null && r.absoluteError===null));
  assert.equal(await browser.evaluate("Chart.getChart('normalCdfErrorChart')===undefined"),true);
  assert.match(await browser.evaluate('normalCdfErrorNote.textContent'),/No NIST reference.*no interpolation/);
});

test('Normal CDF methods UI: odd Simpson n, invalid inputs and series non-convergence are explicit',async()=>{
  await browser.navigate(6);
  await browser.set('normalCdfMethod','simpson'); await browser.set('normalCdfParameter','3');
  await browser.click('calculateNormalCdfBtn');
  assert.match(await summary(),/even only/); assert.equal(await browser.evaluate('normalCdfParameter.value'),'3');
  assert.equal((await state()).results[1].approximation,null);
  for(const value of ['', '-2','2.5','100001','1e309']) {
    await browser.set('normalCdfParameter',value); await browser.click('calculateNormalCdfBtn');
    assert.equal((await state()).results[1].approximation,null);
    assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'),0);
  }
  await browser.set('normalCdfMethod','erf-series'); await browser.set('normalCdfX','4');
  await browser.set('normalCdfParameter','1'); await browser.click('calculateNormalCdfBtn');
  assert.match(await summary(),/not-converged.*|Maximum terms reached/);
  assert.equal((await state()).results[2].iterations,1);
  await browser.set('normalCdfParameter','100'); await browser.set('normalCdfTolerance','1e-15');
  await browser.click('calculateNormalCdfBtn'); assert.match(await summary(),/accuracy-warning.*|cancellation\/roundoff/);
  await browser.set('normalCdfX','5'); await browser.click('calculateNormalCdfBtn');
  assert.match(await summary(),/supports.*4/); assert.equal((await state()).results[2].approximation,null);
  await browser.set('normalCdfX','1');
  for(const tolerance of ['', '0','1e-16','.01','1e309']) {
    await browser.set('normalCdfTolerance',tolerance); await browser.click('calculateNormalCdfBtn');
    assert.equal((await state()).results[2].approximation,null);
  }
  for(const x of ['', '1e309', '1e-400']) {
    await browser.set('normalCdfX',x); await browser.click('compareNormalCdfBtn');
    assert.equal((await state()).x,null); assert.deepEqual((await state()).results,[]);
  }
});

test('Normal CDF methods UI: Exercise 1 charts and results survive CDF calculations and destroy',async()=>{
  await browser.navigate(6);
  for(const id of ['calculateRiemannBtn','calculateLebesgueBtn','runComparisonBtn','runConvergenceBtn','runDirichletBtn','runThomaeBtn']) await browser.click(id);
  const get=()=>browser.evaluate(`({ids:Object.values(Chart.instances).filter(c=>!c.canvas.id.startsWith('normalCdf')).map(c=>c.id),
    summaries:[riemannResults.textContent,lebesgueResults.textContent,comparisonSummary.textContent,
    convergenceSummary.textContent,dirichletSummary.textContent,thomaeSummary.textContent]})`);
  const before=await get(); assert.equal(before.ids.length,8);
  await browser.click('compareNormalCdfBtn'); assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'),10);
  assert.deepEqual(await get(),before);
  await browser.set('normalCdfX',''); assert.deepEqual(await get(),before);
  assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'),8);
});

test('Normal CDF methods UI: 320px and desktop fit pending, rendered, error and destroyed canvases',async()=>{
  await browser.navigate(6);
  for(const width of [320,1440]) {
    await browser.viewport(width);
    for(const x of ['1','-10','','1']) {
      await browser.set('normalCdfX',x);
      if(x)await browser.click('compareNormalCdfBtn');
      const r=await browser.evaluate(`({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,
        canvas:[...document.querySelectorAll('#normalCdfDensityChart,#normalCdfErrorChart')].map(c=>({
        width:c.getBoundingClientRect().width,parent:c.parentElement.clientWidth-parseFloat(getComputedStyle(c.parentElement).paddingLeft)-parseFloat(getComputedStyle(c.parentElement).paddingRight)}))})`);
      if(width===320)assert.equal(r.client,320);
      assert.equal(r.scroll,r.client); assert.ok(r.canvas.every(c=>c.width<=c.parent+1));
    }
    const dir=process.env.NORMAL_CDF_METHODS_SCREENSHOT_DIR;
    if(dir) {
      await mkdir(dir,{recursive:true});
      await browser.evaluate("normalCdfSummary.scrollIntoView({block:'start'})");
      const image=await browser.send('Page.captureScreenshot',{format:'png'});
      await writeFile(path.join(dir,`normal-cdf-methods-${width}.png`),Buffer.from(image.data,'base64'));
      for(const id of ['normalCdfDensityChart','normalCdfErrorChart']) {
        await browser.evaluate(`document.getElementById('${id}').scrollIntoView({block:'center'})`);
        const plot=await browser.send('Page.captureScreenshot',{format:'png'});
        await writeFile(path.join(dir,`${id}-${width}.png`),Buffer.from(plot.data,'base64'));
      }
    }
  }
});
