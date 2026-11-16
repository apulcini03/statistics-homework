import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startBrowser } from './browser-helper.mjs';

let browser;
before(async () => { browser = await startBrowser(); });
after(async () => {
  if (browser) {
    await browser.close();
    assert.deepEqual(browser.exceptions, [], 'No unhandled application exceptions');
  }
});
async function apply(text, hasHeader = true) {
  await browser.set('independenceDatasetInput', text);
  await browser.evaluate(`document.getElementById('independenceHasHeader').checked=${hasHeader}`);
  await browser.click('applyIndependenceDataset');
}

async function checkView() {
  const view = await browser.evaluate(`(() => {
    const state=StatisticalIndependence.getState();
    const table=document.querySelector('#independenceChiSquareTable table');
    const chart=Chart.getChart('independenceChiSquareChart');
    return { state, header:[...table.tHead.rows[0].cells].map(e=>e.textContent),
      rows:[...table.tBodies[0].rows].map(row=>[...row.cells].map(e=>e.textContent)),
      summary:document.getElementById('independenceChiSquareSummary').textContent,
      warnings:document.getElementById('independenceChiSquareWarnings').textContent,
      diagnostics:document.getElementById('independenceChiSquareDiagnostics').textContent,
      note:document.getElementById('independenceChiSquareChartNote').textContent,
      chart:chart ? {id:chart.id,labels:chart.data.labels,data:chart.data.datasets[0].data,
        min:chart.options.scales.y.min,beginAtZero:chart.options.scales.y.beginAtZero} : null,
      count:Object.keys(Chart.instances).length,
      decisions:document.querySelector('section[aria-labelledby="chi-square"]').querySelectorAll('input,select,button').length };
  })()`);
  const t = view.state.contingencyTable, result = view.state.chiSquareTest;
  const names = Object.values(view.state.activeDataset.variables).map(variable=>variable.label);
  assert.deepEqual(view.header, [names[0]+' / '+names[1], ...t.columnCategories]);
  assert.deepEqual(view.rows, t.rowCategories.map((label,i)=>[label,...result.contributions[i].map(value=>value===null?'N/A':value.toPrecision(10))]));
  if (result.chiSquare !== null) {
    const labels = t.rowCategories.flatMap(row=>t.columnCategories.map(column=>`${names[0]}: ${row} | ${names[1]}: ${column}`));
    assert.deepEqual(view.chart.labels,labels.slice(0,50));
    assert.deepEqual(view.chart.data,result.contributions.flat().slice(0,50));
    assert.equal(view.chart.min,0);
    assert.equal(view.chart.beginAtZero,true);
    assert.equal(view.count,4);
  }
  assert.equal(view.decisions,0,'No significance-level or decision controls');
  return view;
}

test('HW6 Pearson UI: default statistic, independent p-value, sparse warning and contributions are coherent', async () => {
  await browser.navigate(7);
  const view=await checkView(), result=view.state.chiSquareTest;
  assert.ok(Math.abs(result.chiSquare-8/45)<1e-15);
  assert.ok(Math.abs(result.pValue-.6732899796599957)<5e-14);
  assert.deepEqual(result.contributions,[[1/30,1/18],[1/30,1/18]]);
  assert.equal(result.degreesOfFreedom,1);
  assert.match(view.summary,/Asymptotic p-value: 0\.673289979660/);
  assert.match(view.diagnostics,/Minimum expected count: 4\.500000.*below 5: 2 \(50\.0000%\)/);
  assert.match(view.warnings,/Sparse expected counts.*may be unreliable/);
  assert.equal(await browser.evaluate("document.querySelectorAll('.status').length"),0);
  const prose=await browser.evaluate("document.querySelector('section[aria-labelledby=\"chi-square\"]').textContent");
  assert.match(prose,/not the\s+probability that H₀ is true/);
  assert.match(prose,/independent observations, mutually\s+exclusive categories/);
});

test('HW6 Pearson UI: alternative dimensions update df, categories, contribution chart and p-value without stale values', async () => {
  await browser.navigate(7);
  for(const [text,df] of [['B,Y\nA,X\nB,Y',1],['B,Y\nA,Z\nB,X\nA,Y',2],
    ['C,Y\nB,X\nA,Y\nC,Y',2],['C,Z\nB,Y\nA,X\nB,Y',4]]){
    const previous=await browser.evaluate("Chart.getChart('independenceChiSquareChart').id");
    await apply('Format,Result\n'+text);
    const view=await checkView();
    assert.equal(view.state.chiSquareTest.degreesOfFreedom,df);
    assert.equal(view.state.chiSquareTest.status,'computed');
    assert.equal(view.header[0],'Format / Result');
    assert.notEqual(view.chart.id,previous);
  }
});

test('HW6 Pearson UI: single-category data show defined zero contributions with no p-value or decision', async () => {
  await browser.navigate(7);
  for(const text of ['Only,Same\nOnly,Same','Only,X\nOnly,Y','A,Only\nB,Only']){
    await apply(text,false);
    const view=await checkView();
    assert.equal(view.state.chiSquareTest.status,'not-applicable');
    assert.equal(view.state.chiSquareTest.pValue,null);
    assert.equal(view.state.chiSquareTest.chiSquare,0);
    assert.match(view.summary,/Asymptotic p-value: N\/A/);
    assert.match(view.warnings,/two nonempty categories/);
  }
});

test('HW6 Pearson UI: small p-values use scientific notation; underflow stays positive mathematically with finite log p', async () => {
  await browser.navigate(7);
  await apply([...Array(100).fill('A,X'),...Array(100).fill('B,Y')].join('\n'),false);
  let view=await checkView();
  assert.ok(view.state.chiSquareTest.pValue>0 && view.state.chiSquareTest.pValue<1e-40);
  assert.match(view.summary,/Asymptotic p-value: \d\.\d+e-\d+/);
  await apply([...Array(2500).fill('A,X'),...Array(2500).fill('B,Y')].join('\n'),false);
  view=await checkView();
  assert.equal(view.state.chiSquareTest.chiSquare,5000);
  assert.equal(view.state.chiSquareTest.pValue,0);
  assert.equal(view.state.chiSquareTest.pValueDetails.status,'underflow');
  assert.ok(Number.isFinite(view.state.chiSquareTest.pValueDetails.logProbability));
  assert.match(view.summary,/Underflow \(p > 0; log p/);
  assert.match(view.warnings,/mathematically positive/);
});

test('HW6 Pearson UI: invalid edits and formatting preserve test state; reset and repeated chart recreation are atomic', async () => {
  await browser.navigate(7);
  await apply('Format,Result\nA,X\nA,Y\nB,X');
  const before=await browser.evaluate(`window.testReference=StatisticalIndependence.getState().chiSquareTest;
    ({state:JSON.stringify(StatisticalIndependence.getState()),html:document.getElementById('independenceChiSquareTable').innerHTML,
      chart:Chart.getChart('independenceChiSquareChart').id})`);
  await browser.set('independenceFrequencyFormat','percentage');
  assert.equal(await browser.evaluate('window.testReference===StatisticalIndependence.getState().chiSquareTest'),true);
  assert.equal(await browser.evaluate("Chart.getChart('independenceChiSquareChart').id"),before.chart);
  await apply('Format,Result\nBroken');
  assert.equal(await browser.evaluate('JSON.stringify(StatisticalIndependence.getState())'),before.state);
  assert.equal(await browser.evaluate("document.getElementById('independenceChiSquareTable').innerHTML"),before.html);
  assert.equal(await browser.evaluate("Chart.getChart('independenceChiSquareChart').id"),before.chart);
  for(let repeat=0;repeat<3;repeat++){
    await browser.evaluate("Chart.getChart('independenceChiSquareChart').destroy()");
    assert.equal(await browser.evaluate('Object.keys(Chart.instances).length'),3);
    await browser.click('resetIndependenceDataset');
    const reset=await checkView();
    assert.equal(reset.header[0],'Study Method / Exam Outcome');
    assert.equal(reset.state.chiSquareTest.degreesOfFreedom,1);
  }
});

test('HW6 Pearson UI: Chart.js unavailable preserves calculations, table and warnings and can recover', async () => {
  await browser.navigate(7);
  await browser.evaluate('Object.values(Chart.instances).forEach(chart=>chart.destroy());window.savedChart=Chart;window.Chart=undefined');
  await apply('A,X\nA,Y\nB,X',false);
  assert.equal(await browser.evaluate("document.querySelectorAll('#independenceChiSquareTable tbody tr').length"),2);
  assert.equal(await browser.evaluate('StatisticalIndependence.getState().chiSquareTest.status'),'computed');
  assert.match(await browser.evaluate("document.getElementById('independenceChiSquareChartFeedback').textContent"),/Chart.js failed to load/);
  await browser.evaluate('window.Chart=window.savedChart;delete window.savedChart');
  await browser.click('resetIndependenceDataset');
  await checkView();
});

test('HW6 Pearson UI: arbitrary HTML-like variable/category labels render as text', async () => {
  await browser.navigate(7);
  await apply('<svg onload=window.injected=true>,Result\n<img src=x onerror=window.injected=true>,A & B\nÉquipe,✓');
  const view=await checkView();
  assert.ok(view.rows[0][0].includes('<img src=x onerror=window.injected=true>'));
  assert.equal(await browser.evaluate('window.injected===undefined'),true);
  assert.equal(await browser.evaluate("document.querySelectorAll('section[aria-labelledby=\"chi-square\"] img,section[aria-labelledby=\"chi-square\"] svg').length"),0);
});

test('HW6 Pearson UI: 50×50 contributions remain complete with capped chart and fit 320/768/1440px after destroy()', async () => {
  await browser.navigate(7);
  const maximum=Array.from({length:5000},(_,i)=>`${'r'.repeat(95)}${i%50},${'c'.repeat(95)}${Math.floor(i/50)%50}`).join('\n');
  for(const text of [null,maximum]){
    if(text){
      await apply(text,false);
      const view=await checkView();
      assert.equal(view.state.chiSquareTest.degreesOfFreedom,2401);
      assert.equal(view.rows.length,50);
      assert.equal(view.state.chiSquareTest.contributions.flat().length,2500);
      assert.equal(view.chart.data.length,50);
      assert.match(view.note,/50 of 2500/);
    }
    for(const width of [320,768,1440]){
      await browser.viewport(width);
      for(const destroyed of [false,true]){
        if(destroyed)await browser.evaluate("Chart.getChart('independenceChiSquareChart').destroy()");
        const bounds=await browser.evaluate(`(()=>{const width=document.documentElement.clientWidth;
          return {fits:document.documentElement.scrollWidth<=width,
            overflow:[...document.querySelectorAll('body *')].filter(e=>{
              const parent=e.closest('#independenceTableContainer,.independence-frequency-table');
              if(parent && parent!==e)return false;
              const r=e.getBoundingClientRect();return r.width>0&&(r.left < -1 || r.right>width+1);
            }).map(e=>e.tagName+'#'+e.id)};})()`);
        assert.equal(bounds.fits,true,`Overflow at ${width}; maximum=${!!text}; destroyed=${destroyed}`);
        assert.deepEqual(bounds.overflow,[]);
        if(destroyed){if(text)await apply(text,false);else await browser.click('resetIndependenceDataset');}
      }
    }
  }
});
