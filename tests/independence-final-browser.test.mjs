import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startBrowser } from './browser-helper.mjs';

let browser;
const screenshots=process.env.HW6_FINAL_SCREENSHOT_DIR;
before(async()=>{if(screenshots)await mkdir(screenshots,{recursive:true});browser=await startBrowser();});
after(async()=>{if(browser){await browser.close();assert.deepEqual(browser.exceptions,[],'No unhandled application exceptions');}});

test('HW6 final integration: published homepage navigation, all experiments, real alpha decision changes and return path',async()=>{
  await browser.navigate();
  const card=await browser.evaluate(`(()=>{const a=document.querySelector('a[href="homework-07/"]');return {
    title:a.closest('.card').querySelector('h3').textContent,status:a.closest('.card').querySelector('.status').textContent};})()`);
  assert.deepEqual(card,{title:'Homework 6 — Statistical Independence',status:'Completed'});
  await browser.evaluate("document.querySelector('a[href=\"homework-07/\"]').click()");
  await browser.waitFor("location.pathname==='/homework-07/' && document.readyState==='complete'");
  for(const id of ['D','B','C','A']){
    await browser.set('independenceExperiment',id);
    await browser.click('loadIndependenceExperiment');
    const active=await browser.evaluate(`({id:StatisticalIndependence.getState().activeExperimentId,
      charts:Object.keys(Chart.instances).length,tables:document.querySelectorAll('main table').length,
      decision:document.getElementById('independenceInterpretationDecision').textContent})`);
    assert.equal(active.id,id);assert.equal(active.charts,4);assert.equal(active.tables,8);
    assert.equal(active.decision,id==='D'?'Reject H₀':'Fail to reject H₀');
  }
  // Temporary manual inputs, not additional application scenarios. These fill
  // the integration gap: A–D have unchanged decisions across all offered alpha.
  // Independent df=1 p-values: CPython math.erfc(sqrt(chiSquare/2)).
  for(const [counts,p,decisions] of [
    [[16,4,10,10],.04670334074933065,['Fail to reject H₀','Reject H₀','Reject H₀']],
    [[17,3,12,8],.07663796276152732,['Fail to reject H₀','Fail to reject H₀','Reject H₀']]
  ]){
    const pairs=[['A','X'],['A','Y'],['B','X'],['B','Y']];
    const input='Format,Result\n'+counts.flatMap((count,i)=>Array(count).fill(pairs[i].join(','))).join('\n');
    await browser.set('independenceDatasetInput',input);
    await browser.click('applyIndependenceDataset');
    assert.equal(await browser.evaluate('StatisticalIndependence.getState().activeExperimentId'),null);
    assert.match(await browser.evaluate("document.getElementById('independenceActiveExperiment').textContent"),/not attributed/);
    assert.ok(Math.abs(await browser.evaluate('StatisticalIndependence.getState().chiSquareTest.pValue')-p)<5e-14);
    await browser.evaluate(`window.finalBaseline=StatisticalIndependence.getState();
      window.finalCharts=Object.values(Chart.instances).map(c=>c.id);`);
    for(const [i,alpha] of [.01,.05,.1].entries()){
      await browser.set('independenceAlpha',String(alpha));
      assert.equal(await browser.evaluate("document.getElementById('independenceInterpretationDecision').textContent"),decisions[i]);
      assert.equal(await browser.evaluate(`['activeDataset','contingencyTable','chiSquareTest','cramersV']
        .every(key=>window.finalBaseline[key]===StatisticalIndependence.getState()[key])`),true);
      assert.deepEqual(await browser.evaluate('Object.values(Chart.instances).map(c=>c.id)'),await browser.evaluate('window.finalCharts'));
    }
  }
  const valid=await browser.evaluate('JSON.stringify(StatisticalIndependence.getState())');
  await browser.set('independenceDatasetInput','Format,Result\nBroken');
  await browser.click('applyIndependenceDataset');
  assert.equal(await browser.evaluate('JSON.stringify(StatisticalIndependence.getState())'),valid);
  await browser.click('resetIndependenceDataset');
  assert.equal(await browser.evaluate('StatisticalIndependence.getState().activeExperimentId'),'A');
  for(const width of [320,768,1440]){
    await browser.viewport(width);
    const bounds=await browser.evaluate(`(()=>{const width=document.documentElement.clientWidth;return {
      fits:document.documentElement.scrollWidth<=width,
      outside:[...document.querySelectorAll('body *')].filter(e=>{
        const wrapper=e.closest('#independenceTableContainer,.independence-frequency-table');if(wrapper&&wrapper!==e)return false;
        const r=e.getBoundingClientRect();return r.width>0&&(r.left < -1 || r.right>width+1);
      }).map(e=>e.tagName+'#'+e.id)};})()`);
    assert.equal(bounds.fits,true,`Page overflow at ${width}`);assert.deepEqual(bounds.outside,[]);
    if(screenshots){
      await browser.evaluate("document.querySelector('section[aria-labelledby=\"statistical-interpretation\"]').scrollIntoView()");
      const shot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(path.join(screenshots,`hw6-interpretation-${width}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  await browser.evaluate("document.querySelector('a.homework-button').click()");
  await browser.waitFor("location.pathname==='/index.html' && document.readyState==='complete'");
  assert.equal(await browser.evaluate("document.querySelector('a[href=\"homework-07/\"]').closest('.card').querySelector('.status').textContent"),'Completed');
  for(const width of [320,768,1440]){
    await browser.viewport(width);
    assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),true);
  }
});
