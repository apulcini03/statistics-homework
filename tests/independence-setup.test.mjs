import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const html = readFileSync(path.join(root, 'homework-07/index.html'), 'utf8');
const source = readFileSync(path.join(root, 'homework-07/script.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context); // Must work independently of the DOM.
const dataset = JSON.parse(vm.runInContext('JSON.stringify(StatisticalIndependence.dataset)', context));

test('HW6 setup: English document, shared stylesheet, local navigation and unique IDs', () => {
  assert.match(html, /^<!DOCTYPE html>/i);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1.0">/);
  assert.match(html, /<h1>HW 6 — Statistical Independence<\/h1>/);
  assert.match(html, /href="\.\.\/index.html"[^>]*>← Back to homepage<\/a>/);
  assert.match(html, /href="\.\.\/css\/style.css"/);
  assert.match(html, /<script src="script.js" defer><\/script>/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, target] of html.matchAll(/aria-labelledby="([^"]+)"/g)) {
    assert.ok(ids.includes(target), `Missing section heading ${target}`);
  }
  for (const [, ref] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    assert.doesNotMatch(ref, /^https?:/, 'No external dependencies are needed');
    assert.ok(existsSync(path.resolve(root, 'homework-07', ref)), ref);
  }
});

test('HW6 setup: synthetic data contain at least 20 complete categorical pairs', () => {
  assert.equal(dataset.isSynthetic, true);
  assert.match(dataset.description, /Synthetic illustrative data; not a real student sample/);
  assert.deepEqual(dataset.variables, {
    studyMethod: { label: 'Study Method', categories: ['Individual', 'Group'] },
    examOutcome: { label: 'Exam Outcome', categories: ['Pass', 'Fail'] }
  });
  assert.ok(Array.isArray(dataset.observations));
  assert.ok(dataset.observations.length >= 20);
  for (const observation of dataset.observations) {
    assert.deepEqual(Object.keys(observation).sort(), ['examOutcome', 'studyMethod']);
    for (const key of Object.keys(dataset.variables)) {
      assert.equal(typeof observation[key], 'string');
      assert.ok(observation[key].trim().length > 0);
      assert.ok(dataset.variables[key].categories.includes(observation[key]));
    }
  }
  assert.equal(new Set(dataset.observations.map(row => `${row.studyMethod}/${row.examOutcome}`)).size, 4,
    'The example includes all four possible category pairs');
});

test('HW6 setup: original dataset API still exposes immutable individual observations without stored aggregates', () => {
  assert.equal(vm.runInContext('typeof StatisticalIndependence.buildContingencyTable', context), 'function');
  assert.deepEqual(Object.keys(dataset).sort(), ['description', 'isSynthetic', 'observations', 'title', 'variables']);
  assert.ok(dataset.observations.every(row => Object.values(row).every(value => typeof value === 'string')));
  assert.equal(vm.runInContext('Object.isFrozen(StatisticalIndependence.dataset.observations)', context), true);
  assert.equal(vm.runInContext('StatisticalIndependence.dataset.observations.every(Object.isFrozen)', context), true);
});

test('HW6 setup: theory includes probability conditions and safeguards against invalid inference', () => {
  const theory = html.split('<h2 id="theoretical-background">')[1].split('</section>')[0]
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replaceAll('&gt;', '>');
  assert.ok(theory.includes('P(X = x, Y = y) = P(X = x) P(Y = y) for all x and y'));
  assert.ok(theory.includes('provided P(X = x) > 0'));
  assert.ok(theory.includes('P(X = x) = ∑y P(X = x, Y = y)'));
  assert.ok(theory.includes('P(Y = y) = ∑x P(X = x, Y = y)'));
  assert.match(theory, /Sample frequencies are observed counts, not population probabilities/);
  assert.match(theory, /H₀: X and Y are independent in the population/);
  assert.match(theory, /H₁: X and Y are associated in the population/);
  assert.match(theory, /Failure to reject H₀ does not prove independence/);
  assert.match(theory, /Statistical association does not establish causation/);
});
