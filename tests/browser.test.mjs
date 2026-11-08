import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { startBrowser } from './browser-helper.mjs';

let browser;
before(async () => { browser = await startBrowser(); });
after(async () => {
  if (!browser) return;
  await browser.close();
  assert.deepEqual(browser.exceptions, [], 'No unhandled JavaScript exceptions');
});

test('ECC: obsolete encryption never publishes a package after key regeneration', async () => {
  await browser.navigate(3);
  await browser.evaluate(`window.originalDerive=eccDeriveAesKey;
    window.gate=new Promise(resolve=>window.release=resolve);
    eccDeriveAesKey=async(...args)=>{await window.gate;return window.originalDerive(...args)};`);
  await browser.set('eccPrivateKey', '123');
  await browser.click('eccGenerateKeysBtn');
  await browser.evaluate(`eccEncryptBtn.click();eccPrivateKey.value='456';eccGenerateKeysBtn.click();window.release();`);
  await browser.waitFor('!eccEncryptBtn.disabled');
  const result = await browser.evaluate(`({recipient:eccRecipient.d,pack:eccEncryptedPackage,
    encryption:eccEncryptionResult.textContent,decryption:eccDecryptionResult.textContent})`);
  assert.equal(result.recipient, 456);
  assert.equal(result.pack, null);
  assert.equal(result.encryption, '');
  assert.equal(result.decryption, '');
  await browser.evaluate('eccDeriveAesKey=window.originalDerive');
  await browser.click('eccEncryptBtn');
  await browser.click('eccDecryptBtn');
  assert.match(await browser.evaluate('eccDecryptionResult.textContent'), /Decryption successful!.*HELLO STATISTICS/s);
});

test('ECC: obsolete decryption cannot overwrite results after key regeneration', async () => {
  await browser.navigate(3);
  await browser.click('eccGenerateKeysBtn');
  await browser.click('eccEncryptBtn');
  await browser.evaluate(`window.originalDerive=eccDeriveAesKey;
    window.gate=new Promise(resolve=>window.release=resolve);
    eccDeriveAesKey=async(...args)=>{await window.gate;return window.originalDerive(...args)};
    eccDecryptBtn.click();eccPrivateKey.value='456';eccGenerateKeysBtn.click();window.release();`);
  await browser.waitFor('!eccDecryptBtn.disabled');
  assert.equal(await browser.evaluate('eccDecryptionResult.textContent'), '');
  assert.equal(await browser.evaluate('eccEncryptedPackage'), null);
});

test('Caesar: non-ASCII ciphertext is rejected instead of manufacturing English letters', async () => {
  await browser.navigate(3);
  await browser.set('caesarAttackCiphertext', 'ßﬀı');
  await browser.click('analyzeCaesarBtn');
  assert.match(await browser.evaluate('caesarAttackSummary.textContent'), /containing English letters/);
  assert.equal(await browser.evaluate('caesarCandidatesBody.children.length'), 0);
});

test('Welford: Process All stops on overflow with the last valid row intact and can reset', async () => {
  await browser.navigate(5);
  await browser.set('welfordObservations', '1e308,-1e308,2');
  await browser.click('welfordRunAllBtn');
  const result = await browser.evaluate(`({summary:welfordSummary.textContent,
    verification:welfordVerification.textContent,rows:welfordStepsBody.children.length,
    next:welfordNextBtn.disabled,all:welfordRunAllBtn.disabled,
    row:welfordStepsBody.textContent})`);
  assert.match(result.summary, /overflow/i);
  assert.doesNotMatch(result.verification, /PASS/);
  assert.equal(result.rows, 1);
  assert.equal(result.next, true);
  assert.equal(result.all, true);
  assert.doesNotMatch(result.row, /Infinity|NaN/);
  await browser.click('welfordResetBtn');
  await browser.set('welfordObservations', '2,4,6');
  await browser.click('welfordRunAllBtn');
  assert.match(await browser.evaluate('welfordVerification.textContent'), /Verification: PASS/);
});

test('Welford: single-step overflow stops and editing restarts a clean sequence', async () => {
  await browser.navigate(5);
  await browser.set('welfordObservations', '1e200,-1e200');
  await browser.click('welfordNextBtn');
  await browser.click('welfordNextBtn');
  assert.match(await browser.evaluate('welfordSummary.textContent'), /overflow/i);
  assert.equal(await browser.evaluate('welfordStepsBody.children.length'), 1);
  await browser.set('welfordObservations', '7');
  await browser.click('welfordNextBtn');
  assert.equal(await browser.evaluate('welfordStepsBody.children.length'), 1);
  assert.match(await browser.evaluate('welfordSummary.textContent'), /Sample variance: Undefined/);
});

test('Welford: non-finite direct verification never displays PASS', async () => {
  await browser.navigate(5);
  await browser.evaluate(`directWelfordStatistics=()=>({mean:Infinity,M2:NaN,variance:Infinity})`);
  await browser.click('welfordRunAllBtn');
  const result = await browser.evaluate('welfordVerification.textContent');
  assert.doesNotMatch(result, /PASS/);
  assert.match(result, /overflow|unavailable/i);
});

test('Distributions: degenerate Bernoulli scores keep correct axes under all transformations', async () => {
  await browser.navigate(4);
  for (const n of [1, 100]) {
    await browser.set('stochasticSystems', String(n));
    await browser.set('stochasticAttackers', '5');
    for (const p of [0, 1]) {
      await browser.set('stochasticProbability', String(p));
      await browser.click('runStochasticSimulationBtn');
      await browser.click('analyzeScoreDistributionsBtn');
      const charts = await browser.evaluate(`['totalScoreDistributionChart',
        'averageScoreDistributionChart','normalizedScoreDistributionChart'].map(id=>{
        const c=Chart.getChart(id);return {labels:c.data.labels,counts:c.data.datasets[0].data}})`);
      const expected = [(n * p).toFixed(1), p.toFixed(3), (Math.sqrt(n) * p).toFixed(2)];
      for (let i = 0; i < 3; i++) {
        assert.deepEqual(charts[i].labels, [expected[i]]);
        assert.deepEqual(charts[i].counts, [5]);
      }
    }
  }
});

test('Distributions: a valid rerun invalidates old analysis and an invalid rerun preserves it', async () => {
  await browser.navigate(4);
  await browser.set('stochasticProbability', '0');
  await browser.click('runStochasticSimulationBtn');
  await browser.click('analyzeScoreDistributionsBtn');
  await browser.set('stochasticSystems', '');
  await browser.click('runStochasticSimulationBtn');
  assert.equal(await browser.evaluate(`!!Chart.getChart('totalScoreDistributionChart')`), true);
  await browser.set('stochasticSystems', '100');
  await browser.set('stochasticProbability', '1');
  await browser.click('runStochasticSimulationBtn');
  assert.equal(await browser.evaluate('scoreDistributionTableBody.children.length'), 0);
  assert.equal(await browser.evaluate(`!!Chart.getChart('totalScoreDistributionChart')`), false);
  assert.match(await browser.evaluate('scoreDistributionSummary.textContent'), /Analyze/);
  await browser.click('analyzeScoreDistributionsBtn');
  assert.equal(await browser.evaluate('scoreDistributionTableBody.children.length'), 3);
  assert.deepEqual(await browser.evaluate(`Chart.getChart('totalScoreDistributionChart').data.labels`), ['100.0']);
});

test('Responsive: every homework contains uninitialized canvases at 320px and desktop', async () => {
  for (let hw = 1; hw <= 5; hw++) {
    await browser.viewport(1440);
    await browser.navigate(hw);
    for (const width of [1440, 320]) {
      await browser.viewport(width);
      const dimensions = await browser.evaluate(`({client:document.documentElement.clientWidth,
        scroll:document.documentElement.scrollWidth,canvases:[...document.querySelectorAll('.chart-container canvas')]
        .map(c=>({width:c.getBoundingClientRect().width,available:c.parentElement.clientWidth
          -parseFloat(getComputedStyle(c.parentElement).paddingLeft)
          -parseFloat(getComputedStyle(c.parentElement).paddingRight)}))})`);
      assert.equal(await browser.evaluate('window.innerWidth'), width, 'Requested outer viewport is preserved');
      if (width === 320) assert.equal(dimensions.client, 320);
      assert.equal(dimensions.scroll, dimensions.client, `HW${hw}, viewport ${width}: no horizontal overflow`);
      for (const c of dimensions.canvases) assert.ok(c.width <= c.available + 1, `HW${hw} canvas exceeds content width`);
    }
  }
});

test('Responsive: destroyed Chart.js canvases stay contained and can be recreated', async () => {
  await browser.viewport(320);
  await browser.navigate(5);
  await browser.click('runSamplingSimulationBtn');
  await browser.click('analyzeSamplingBtn');
  await browser.click('runSamplingSimulationBtn');
  assert.equal(await browser.evaluate(`!!Chart.getChart('samplingMeansChart')`), false);
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth'), 320);
  await browser.click('analyzeSamplingBtn');
  assert.equal(await browser.evaluate(`Chart.getChart('samplingMeansChart').data.datasets[0].data.reduce((s,p)=>s+p.y,0)`), 200);
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth'), 320);
  await browser.viewport(1440);
  assert.ok(await browser.evaluate(`Chart.getChart('samplingMeansChart').width > 500`));
});

test('ECC: regenerating the same scalar or an invalid scalar invalidates pending encryption', async () => {
  for (const value of ['123', '0']) {
    await browser.navigate(3);
    await browser.click('eccGenerateKeysBtn');
    await browser.evaluate(`window.originalDerive=eccDeriveAesKey;
      window.gate=new Promise(resolve=>window.release=resolve);
      eccDeriveAesKey=async(...args)=>{await gate;return originalDerive(...args)};
      eccEncryptBtn.click();eccPrivateKey.value=${JSON.stringify(value)};
      eccGenerateKeysBtn.click();release();`);
    await browser.waitFor('!eccEncryptBtn.disabled');
    assert.equal(await browser.evaluate('eccEncryptedPackage'), null);
    assert.equal(await browser.evaluate('eccEncryptionResult.textContent'), '');
  }
});

test('ECC: stale failure cannot publish an error after key regeneration', async () => {
  await browser.navigate(3);
  await browser.click('eccGenerateKeysBtn');
  await browser.evaluate(`window.gate=new Promise((resolve,reject)=>window.rejectDerivation=reject);
    eccDeriveAesKey=()=>gate;eccEncryptBtn.click();eccPrivateKey.value='456';
    eccGenerateKeysBtn.click();rejectDerivation(Error('superseded derivation'));`);
  await browser.waitFor('!eccEncryptBtn.disabled');
  assert.equal(await browser.evaluate('eccEncryptionResult.textContent'), '');
  assert.equal(await browser.evaluate('eccRecipient.d'), 456);
});

test('ECC: a new ciphertext invalidates pending decryption and still decrypts correctly', async () => {
  await browser.navigate(3);
  await browser.click('eccGenerateKeysBtn');
  await browser.click('eccEncryptBtn');
  await browser.evaluate(`window.originalDerive=eccDeriveAesKey;window.calls=0;
    window.gate=new Promise(resolve=>window.release=resolve);
    eccDeriveAesKey=async(...args)=>{if(++window.calls===1)await gate;return originalDerive(...args)};
    eccDecryptBtn.click();eccMessage.value='new plaintext';eccEncryptBtn.click();`);
  await browser.waitFor('!eccEncryptBtn.disabled');
  await browser.evaluate('release()');
  await browser.waitFor('!eccDecryptBtn.disabled');
  assert.equal(await browser.evaluate('eccDecryptionResult.textContent'), '');
  await browser.click('eccDecryptBtn');
  assert.match(await browser.evaluate('eccDecryptionResult.textContent'), /Recovered plaintext:\nnew plaintext$/);
});

test('Audit regression: the previous default workflows and all numeric validators', async t => {
  await browser.viewport(1440);
  for (let hw = 1; hw <= 5; hw++) {
    await t.test(`HW${hw} default workflow`, async () => {
      await browser.navigate(hw);
      assert.equal(await browser.evaluate('typeof Chart'), 'function');
      if (hw === 1) {
        for (const id of ['generateBtn', 'statisticsBtn', 'avalancheBtn']) await browser.click(id);
        assert.equal(await browser.evaluate('result.textContent'), 'Toy Public Key: (5, 8)');
        assert.match(await browser.evaluate('statisticsResults.textContent'), /Finite points: 89.*Points at infinity: 11/);
        await browser.set('privateKey', '1');
        await browser.click('animateBtn');
        assert.match(await browser.evaluate('animationStatus.textContent'), /Completed!/);
        await browser.set('privateKey', '1000');
        await browser.click('generateBtn');
        assert.equal(await browser.evaluate('steps.children.length'), 1000);
        await browser.set('sampleSize', '10000');
        await browser.click('statisticsBtn');
        assert.match(await browser.evaluate('statisticsResults.textContent'), /Finite points: 8889.*Points at infinity: 1111/);
        await browser.set('sampleSize', '1');
        await browser.click('statisticsBtn');
        assert.match(await browser.evaluate('correlationResults.textContent'), /Undefined/);
      }
      if (hw === 2) {
        for (const id of ['generateSeedBtn', 'deriveKeyBtn', 'generatePublicKeyBtn',
          'generateAddressBtn', 'checksumBtn', 'deriveAccountsBtn', 'runWalletStatsBtn',
          'compareHashesBtn', 'runKeccakAvalancheBtn']) await browser.click(id);
        assert.match(await browser.evaluate('addressResult.textContent'), /0x9858effd232b4033e47d90003d41ec34ecaeda94/);
        assert.match(await browser.evaluate('checksumResult.textContent'), /0x9858EfFD232B4033E47d90003D41EC34EcaEda94/);
        assert.match(await browser.evaluate('walletStatsResults.textContent'), /Bit 0: 1588\nBit 1: 1612/);
        assert.match(await browser.evaluate('walletStatsResults.textContent'), /79.74 \/ 160/);
        assert.match(await browser.evaluate('hashComparisonResults.textContent'), /138 \/ 256 bits/);
        assert.equal(await browser.evaluate(`['0x52908400098527886E0F7030069857D2E4169EE7',
          '0x8617E340B3D01FA5F11F306F4090FD50E238070D','0xde709f2102306220921060314715629080e2fb77',
          '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'].every(a=>ethers.getAddress(a.toLowerCase())===a)`), true);
        await browser.set('accountCount', '10'); await browser.click('deriveAccountsBtn');
        assert.equal(await browser.evaluate('accountsTableBody.children.length'), 10);
        await browser.set('statsAccountCount', '100'); await browser.click('runWalletStatsBtn');
        await browser.set('avalancheTrialCount', '1000'); await browser.click('runKeccakAvalancheBtn');
        assert.match(await browser.evaluate('keccakAvalancheResults.textContent'), /Trials: 1000/);
        await browser.set('hashInput', ''); await browser.click('compareHashesBtn');
        assert.match(await browser.evaluate('hashComparisonResults.textContent'), /c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470/);
      }
      if (hw === 3) {
        for (const id of ['eccGenerateKeysBtn', 'eccEncryptBtn', 'eccDecryptBtn', 'caesarEncryptBtn',
          'caesarDecryptBtn', 'analyzeCaesarBtn', 'runCaesarLengthExperimentBtn', 'runEccAttackBtn',
          'eccAttackDecryptBtn']) await browser.click(id);
        assert.match(await browser.evaluate('eccDecryptionResult.textContent'), /Recovered plaintext:\nHELLO STATISTICS/);
        assert.match(await browser.evaluate('caesarDecryptResult.textContent'), /Recovered plaintext:\nHELLO STATISTICS/);
        assert.match(await browser.evaluate('caesarAttackSummary.textContent'), /Estimated key: 3/);
        assert.match(await browser.evaluate('caesarLengthSummary.textContent'), /Correctly recovered keys: 236/);
        assert.match(await browser.evaluate('eccAttackDecryptionResults.textContent'), /Attack decryption successful!/);
        await browser.set('eccPrivateKey', '1000'); await browser.click('eccGenerateKeysBtn');
        await browser.click('eccEncryptBtn'); await browser.click('runEccAttackBtn');
        await browser.click('eccAttackDecryptBtn');
        assert.match(await browser.evaluate('eccAttackResults.textContent'), /Candidates tested: 1000/);
        assert.match(await browser.evaluate('eccAttackDecryptionResults.textContent'), /Attack decryption successful!/);
      }
      if (hw === 4) {
        for (const id of ['runStochasticSimulationBtn', 'analyzeScoreDistributionsBtn',
          'runLlnExperimentBtn', 'runCltExperimentBtn', 'runVarianceExperimentBtn',
          'runSystemsAttackersBtn']) await browser.click(id);
        assert.match(await browser.evaluate('llnSummary.textContent'), /Maximum systems: 1000/);
        assert.match(await browser.evaluate('systemsAttackersSummary.textContent'), /Aggregate score: 500491/);
        await browser.set('cltSelectedN', '10');
        assert.match(await browser.evaluate('cltSummary.textContent'), /Systems currently displayed: 10/);
        await browser.set('stochasticModel', 'rademacher');
        await browser.set('stochasticSystems', '1000'); await browser.set('stochasticAttackers', '2000');
        await browser.click('runStochasticSimulationBtn'); await browser.click('analyzeScoreDistributionsBtn');
        assert.equal(await browser.evaluate('bernoulliProbabilityGroup.hidden && stochasticProbability.disabled'), true);
        assert.equal(await browser.evaluate('hw3Simulation.finalScores.length'), 2000);
        await browser.set('stochasticModel', 'bernoulli');
      }
      if (hw === 5) {
        await browser.click('welfordNextBtn'); await browser.click('welfordRunAllBtn');
        assert.match(await browser.evaluate('welfordVerification.textContent'), /Verification: PASS/);
        await browser.click('welfordResetBtn');
        assert.equal(await browser.evaluate('welfordStepsBody.children.length'), 0);
        for (const id of ['runSamplingSimulationBtn', 'analyzeSamplingBtn', 'runSampleSizeExperimentBtn']) await browser.click(id);
        assert.equal(await browser.evaluate('sampleSizeResultsTableBody.children.length'), 9);
        await browser.set('samplingSystems', '2'); await browser.set('samplingHackers', '1');
        await browser.click('runSamplingSimulationBtn'); await browser.click('analyzeSamplingBtn');
        assert.equal(await browser.evaluate(`Chart.getChart('samplingMeansChart').data.datasets[0].data.reduce((s,p)=>s+p.y,0)`), 1);
        await browser.set('samplingSystems', '1000'); await browser.set('samplingHackers', '1000');
        await browser.click('runSamplingSimulationBtn'); await browser.click('analyzeSamplingBtn');
        assert.equal(await browser.evaluate('hw4SamplingSimulation.totalAttempts'), 1000000);
      }
      assert.ok(await browser.evaluate(`Object.values(Chart.instances).every(c=>c.width>0&&c.height>0)`));
    });
    const groups = {
      1: [['privateKey','generateBtn','result'],['sampleSize','statisticsBtn','statisticsResults'],['avalancheKey','avalancheBtn','avalancheResults']],
      2: [['accountCount','deriveAccountsBtn','accountsSummary'],['statsAccountCount','runWalletStatsBtn','walletStatsResults'],['avalancheTrialCount','runKeccakAvalancheBtn','keccakAvalancheResults']],
      3: [['eccPrivateKey','eccGenerateKeysBtn','eccKeysResult'],['caesarKey','caesarEncryptBtn','caesarEncryptResult'],['caesarExperimentTrials','runCaesarLengthExperimentBtn','caesarLengthSummary']],
      4: [['stochasticSystems','runStochasticSimulationBtn','stochasticSimulationSummary'],['stochasticAttackers','runStochasticSimulationBtn','stochasticSimulationSummary'],['stochasticProbability','runStochasticSimulationBtn','stochasticSimulationSummary'],['llnMaxSystems','runLlnExperimentBtn','llnSummary'],['llnAttackers','runLlnExperimentBtn','llnSummary'],['llnEpsilon','runLlnExperimentBtn','llnSummary'],['cltAttackers','runCltExperimentBtn','cltSummary'],['varianceAttackers','runVarianceExperimentBtn','varianceSummary']],
      5: [['samplingSystems','runSamplingSimulationBtn','samplingSimulationSummary'],['samplingHackers','runSamplingSimulationBtn','samplingSimulationSummary'],['sampleSizeHackers','runSampleSizeExperimentBtn','sampleSizeSummary']]
    };
    for (const [field, button, summary] of groups[hw]) {
      const attr = await browser.evaluate(`(()=>{const e=document.getElementById('${field}');
        return {min:Number(e.min),max:Number(e.max),step:e.step,value:e.value}})()`);
      for (const value of ['', String(attr.min - 1), String(attr.max + 1),
        ...(attr.step === '1' || field === 'sampleSize' ? ['1.5'] : [])]) {
        await t.test(`HW${hw} rejects ${field}=${JSON.stringify(value)}`, async () => {
          await browser.set(field, value); await browser.click(button);
          assert.match(await browser.evaluate(`document.getElementById('${summary}').textContent`), /enter|invalid|must be|^Use /i);
        });
      }
      await browser.set(field, attr.value);
    }
  }
});

test('Chart.js: repeated rendering at 320px and desktop preserves data and chart instances', async () => {
  const actions = {
    1: ['statisticsBtn'],
    2: ['runWalletStatsBtn', 'runKeccakAvalancheBtn'],
    3: ['analyzeCaesarBtn', 'runCaesarLengthExperimentBtn'],
    4: ['runStochasticSimulationBtn', 'analyzeScoreDistributionsBtn', 'runLlnExperimentBtn',
      'runCltExperimentBtn', 'runVarianceExperimentBtn', 'runSystemsAttackersBtn'],
    5: ['runSamplingSimulationBtn', 'analyzeSamplingBtn', 'runSampleSizeExperimentBtn']
  };
  const expectedCounts = { 1: 4, 2: 3, 3: 3, 4: 12, 5: 5 };
  for (const width of [320, 1440]) {
    await browser.viewport(width);
    for (let hw = 1; hw <= 5; hw++) {
      await browser.navigate(hw);
      for (let run = 0; run < 2; run++) {
        if (hw === 4) await browser.set('stochasticAttackers', String(run ? 11 : 7));
        if (hw === 5) await browser.set('samplingHackers', String(run ? 11 : 7));
        for (const id of actions[hw]) await browser.click(id);
        const charts = await browser.evaluate(`Object.values(Chart.instances).map(c=>({id:c.canvas.id,
          width:c.width,height:c.height,display:c.canvas.getBoundingClientRect().width,
          available:c.canvas.parentElement.clientWidth
            -parseFloat(getComputedStyle(c.canvas.parentElement).paddingLeft)
            -parseFloat(getComputedStyle(c.canvas.parentElement).paddingRight)}))`);
        assert.equal(charts.length, expectedCounts[hw], `HW${hw}, run ${run}`);
        for (const c of charts) {
          assert.ok(c.width > 0 && c.height > 0);
          assert.ok(c.display <= c.available + 1);
        }
        const page = await browser.evaluate('({inner:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})');
        assert.equal(page.inner, width);
        if (width === 320) assert.equal(page.client, 320);
        assert.equal(page.scroll, page.client, `HW${hw}: no horizontal overflow`);
        if (hw === 4) {
          assert.equal(await browser.evaluate(`Chart.getChart('totalScoreDistributionChart').data.datasets[0].data.reduce((a,b)=>a+b,0)`), run ? 11 : 7);
        }
        if (hw === 5) {
          assert.equal(await browser.evaluate(`Chart.getChart('samplingMeansChart').data.datasets[0].data.reduce((a,b)=>a+b.y,0)`), run ? 11 : 7);
        }
      }
    }
  }
});

test('Welford: large constant observations remain valid in the browser', async () => {
  await browser.navigate(5);
  await browser.set('welfordObservations', '1e308,1e308');
  await browser.click('welfordRunAllBtn');
  const text = await browser.evaluate('welfordVerification.textContent');
  assert.match(text, /Verification: PASS/);
  assert.doesNotMatch(text, /Infinity|NaN/);
  assert.match(await browser.evaluate('welfordSummary.textContent'), /Sample variance: 0/);
});
