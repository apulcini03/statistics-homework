import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startBrowser } from './browser-helper.mjs';

let browser;
before(async () => { browser = await startBrowser(); });
after(async () => {
  if (browser) {
    await browser.close();
    assert.deepEqual(browser.exceptions, [], 'No unhandled JavaScript exceptions');
  }
});

test('HW6 setup: six sections remain, with descriptive panels and three future placeholders', async () => {
  await browser.navigate(7);
  const page = await browser.evaluate(`({
    headings: [...document.querySelectorAll('main section > h2')].map(e => e.textContent),
    placeholders: [...document.querySelectorAll('section:has(.status) .card')].map(e => e.textContent),
    statuses: [...document.querySelectorAll('.status')].map(e => e.textContent),
    futureControls: [...document.querySelectorAll('section:has(.status)')].reduce((n, e) =>
      n + e.querySelectorAll('button,input,select,textarea,canvas,table').length, 0),
    datasetButtons: [...document.querySelectorAll('section[aria-labelledby="dataset-contingency"] button')].map(e => e.textContent),
    observations: StatisticalIndependence.dataset.observations.length,
    headerBackground: getComputedStyle(document.querySelector('header')).backgroundImage
  })`);
  assert.deepEqual(page.headings, [
    'Assignment', 'Theoretical Background',
    '1. Dataset and Contingency Table', '2. Marginal and Conditional Frequencies',
    '3. Expected Frequencies under Independence', '4. Chi-Square Test',
    '5. Statistical Interpretation', '6. Experiments and Conclusions'
  ]);
  assert.deepEqual(page.statuses, Array(3).fill('Not yet implemented'));
  assert.equal(page.placeholders.length, 3);
  for (const text of page.placeholders) {
    assert.doesNotMatch(text, /\d/, 'No placeholder numerical results');
    assert.doesNotMatch(text, /reject H₀|significant association|proves independence/i);
  }
  assert.equal(page.futureControls, 0);
  assert.deepEqual(page.datasetButtons, ['Apply Dataset', 'Reset Dataset']);
  assert.ok(page.observations >= 20);
  assert.match(page.headerBackground, /linear-gradient/);
});

test('HW6 setup: layout fits 320, 768 and 1440 px with standard Chrome scrollbars', async () => {
  await browser.navigate(7);
  for (const width of [320, 768, 1440]) {
    await browser.viewport(width);
    const layout = await browser.evaluate(`(() => {
      const available = document.documentElement.clientWidth;
      return {
        available,
        scroll: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll('body *')].filter(e => {
          const r = e.getBoundingClientRect();
          const wrapper = e.closest('#independenceTableContainer, .independence-frequency-table');
          const insideScrollableTable = wrapper && e !== wrapper;
          return !insideScrollableTable && r.width > 0 && (r.left < -1 || r.right > available + 1);
        }).map(e => e.tagName + '#' + e.id)
      };
    })()`);
    assert.ok(layout.scroll <= layout.available, `Horizontal page overflow at ${width}px`);
    assert.deepEqual(layout.overflowing, [], `Descendant overflow at ${width}px`);
  }
});

test('HW6 setup: return navigation works and repeated loads preserve the reusable dataset', async () => {
  await browser.navigate(7);
  const initial = await browser.evaluate('JSON.stringify(StatisticalIndependence.dataset)');
  await browser.evaluate("document.querySelector('a.homework-button').click()");
  await browser.waitFor("location.pathname === '/index.html' && document.readyState === 'complete'");
  assert.equal(await browser.evaluate("document.querySelector('a[href=\"homework-07/\"]') === null"), true,
    'Homepage entry remains deferred to Step 8');
  for (let repeat = 0; repeat < 2; repeat++) {
    await browser.navigate(7);
    assert.equal(await browser.evaluate('JSON.stringify(StatisticalIndependence.dataset)'), initial);
    assert.equal(await browser.evaluate("document.querySelectorAll('main section').length"), 8);
  }
});
