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

test('HW7 Step 1 browser: ordered exercises, English content and inactive future components', async () => {
  await browser.navigate(8);
  const state = await browser.evaluate(`({
    language: document.documentElement.lang,
    headings: [...document.querySelectorAll('main > section > h2')].map(e => e.textContent),
    exercises: ['exercise-1', 'exercise-2'].map(id => [...document.querySelector(
      'section[aria-labelledby="' + id + '"]').querySelectorAll('h3')].map(e => e.textContent)),
    slots: [...document.querySelectorAll('[data-placeholder]')].map(e => e.innerHTML),
    active: document.querySelectorAll('main button, main input, main select, canvas, output').length,
    statuses: [...document.querySelectorAll('.status')].map(e => e.textContent),
    header: getComputedStyle(document.querySelector('header')).backgroundImage,
    styles: [...document.styleSheets].map(s => s.href),
    resources: performance.getEntriesByType('resource').map(e => new URL(e.name).pathname)
  })`);
  assert.equal(state.language, 'en');
  assert.deepEqual(state.headings, ['Assignment', 'Exercise 1 — Modes of Convergence',
    'Exercise 2 — Conditional Probability & Bayesian Inference', 'Conclusions']);
  assert.deepEqual(state.exercises, [
    ['Definitions and Comparison', 'Convergence Simulations', '3. Law of Large Numbers',
      '4. Central Limit Theorem', '5. Square-Root Scaling and Variance'],
    ['1. Conditional Probability', "2. Bayes' Theorem", 'Prior, Likelihood and Posterior',
      'Bayesian Experiments', 'Results and Conclusions']
  ]);
  assert.equal(state.slots.length, 3);
  assert.ok(state.slots.every(s => s === ''));
  assert.equal(state.active, 37);
  assert.equal(state.statuses.length, 1);
  assert.ok(state.statuses.every(s => /not yet implemented/i.test(s)));
  assert.match(state.header, /linear-gradient/);
  assert.ok(state.styles.some(s => s?.endsWith('/css/style.css')));
  assert.ok(state.resources.includes('/homework-08/script.js'));
});

for (const width of [320, 768, 1440]) {
  test(`HW7 Step 1 browser: no page, card, table or descendant overflow at ${width}px`, async () => {
    await browser.navigate(8);
    await browser.viewport(width);
    const layout = await browser.evaluate(`(() => {
      const available = document.documentElement.clientWidth;
      return {
        available, scroll: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll('body *')].filter(e => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.left < -1 || r.right > available + 1 || e.scrollWidth > e.clientWidth + 1);
        }).map(e => e.tagName + '#' + e.id)
      };
    })()`);
    assert.ok(layout.scroll <= layout.available, JSON.stringify(layout));
    assert.deepEqual(layout.overflowing, []);
  });
}

test('HW7 Step 1 browser: internal links and return to homepage work', async () => {
  await browser.navigate(8);
  for (const id of ['exercise-1', 'exercise-2', 'conclusions']) {
    await browser.evaluate(`document.querySelector('nav a[href="#${id}"]').click()`);
    await browser.waitFor(`location.hash === '#${id}'`);
    assert.equal(await browser.evaluate(`document.getElementById('${id}').getBoundingClientRect().height > 0`), true);
  }
  await browser.evaluate(`document.querySelector('a.homework-button').click()`);
  await browser.waitFor("location.pathname === '/index.html' && document.readyState === 'complete'");
  assert.equal(await browser.evaluate("document.querySelector('h1').textContent.length > 0"), true);
  await browser.navigate(8);
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-placeholder]:not(:empty)').length"), 0);
});
