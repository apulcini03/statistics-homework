'use strict';

// The numerical API has no DOM or Chart.js dependency. Random draws are made once
// per independent replicate; increasing n never redraws that replicate's U or Z/W.
const ConvergenceSimulations = (() => {
  const defaults = Object.freeze({ model: 'A', count: 2000, maxN: 127, epsilon: 0.5, seed: 42 });
  const models = Object.freeze({
    A: Object.freeze({
      title: 'A — Typewriter sequence',
      definition: 'One U ~ Uniform[0, 1) per path. Start at n = 1: m = floor(log₂ n), k = n − 2^m. '
        + 'Block m has 2^m indices, n = 2^m, …, 2^(m+1) − 1. '
        + 'X_n = 1 on [k/2^m, (k+1)/2^m), and 0 otherwise; the reference is X = 0.',
      classification: 'Theory: convergence in probability, in L² and in distribution to 0; '
        + 'no almost sure convergence to 0. Every U is hit once in each block, and also misses '
        + 'intervals in every block after m = 0, so paths have infinitely many ones and zeros. '
        + 'This disproves both L² ⇒ almost sure and probability ⇒ almost sure convergence.',
      formulas: 'Theory: P(|X_n| > ε) = 2^(−m) for 0 < ε < 1, and 0 for ε ≥ 1; '
        + 'E[X_n²] = 2^(−m).'
    }),
    B: Object.freeze({
      title: 'B — Shrinking normal',
      definition: 'Draw Z ~ N(0, 1) once per path and set X_n = Z/n for every n; reference X = 0.',
      classification: 'Theory: convergence to 0 almost surely, in L², in probability and in distribution. '
        + 'Z is finite almost surely and E[Z²] = 1.',
      formulas: 'Theory: P(|X_n| > ε) = 2 Φ(−nε); E[X_n²] = 1/n².'
    }),
    C: Object.freeze({
      title: 'C — Alternating normals',
      definition: 'Draw independent Z, W ~ N(0, 1) once per path. X_n = Z for even n and W for odd n. '
        + 'The reference random variable is X = Z on the same probability space.',
      classification: 'Theory: convergence in distribution to X, since every marginal is N(0, 1); '
        + 'no convergence in probability, in L² or almost surely to X. '
        + 'For odd n, W − Z ~ N(0, 2), while even-index errors vanish. '
        + 'Identical distributions do not mean identical values: with probability one Z ≠ W.',
      formulas: 'Theory: for even n, deviation probability and MSE are 0; for odd n, '
        + 'P(|X_n − X| > ε) = 2 Φ(−ε/√2) > 0 and E[(X_n − X)²] = 2.'
    })
  });

  function validateParameters(raw) {
    if (!raw || !Object.hasOwn(models, raw.model)) throw new RangeError('Select example A, B or C.');
    const p = { model: raw.model };
    for (const key of ['count', 'maxN', 'epsilon', 'seed']) {
      const value = raw[key];
      if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))) {
        throw new RangeError('All parameters must be finite numbers; empty values are not allowed.');
      }
      p[key] = Number(value);
    }
    if (!Number.isInteger(p.count) || p.count < 10 || p.count > 5000) throw new RangeError('Trajectories must be an integer from 10 to 5,000.');
    if (!Number.isInteger(p.maxN) || p.maxN < 15 || p.maxN > 1023) throw new RangeError('Maximum n must be an integer from 15 to 1,023.');
    if (!(p.epsilon > 0)) throw new RangeError('ε must be finite and strictly positive.');
    if (!Number.isInteger(p.seed) || p.seed < 0 || p.seed > 0xffffffff) throw new RangeError('Seed must be an integer from 0 to 4,294,967,295.');
    return p;
  }

  // Mulberry32: explicit unsigned 32-bit state; all seeds, including zero, work.
  function createRng(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Invalid seed.');
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalPair(random) {
    const radius = Math.sqrt(-2 * Math.log(1 - random()));
    const angle = 2 * Math.PI * random();
    return { z: radius * Math.cos(angle), w: radius * Math.sin(angle) };
  }

  function typewriterIndex(n) {
    if (!Number.isInteger(n) || n < 1 || n > 1023) throw new RangeError('Index n must be from 1 to 1,023.');
    const m = Math.floor(Math.log2(n));
    const size = 2 ** m;
    const k = n - size;
    return { m, k, size, left: k / size, right: (k + 1) / size };
  }

  function valueAt(model, n, latent) {
    if (model === 'A') {
      const { left, right } = typewriterIndex(n);
      return latent.u >= left && latent.u < right ? 1 : 0;
    }
    if (model === 'B') return latent.z / n;
    if (model === 'C') return n % 2 === 0 ? latent.z : latent.w;
    throw new RangeError('Unknown model.');
  }

  function generateLatents(parameters) {
    const p = validateParameters(parameters);
    const random = createRng(p.seed);
    return Array.from({ length: p.count }, () => p.model === 'A' ? { u: random() } : normalPair(random));
  }

  function generateTrajectory(model, latent, maxN) {
    typewriterIndex(maxN); // Shared finite index bound, without model-specific randomness.
    return Array.from({ length: maxN }, (_, i) => valueAt(model, i + 1, latent));
  }

  function calculateErrors(values, references) {
    if (values.length !== references.length || !values.length) throw new RangeError('Samples must have equal, positive lengths.');
    return values.map((x, i) => {
      const error = x - references[i];
      if (!Number.isFinite(error)) throw new RangeError('Samples must be finite.');
      return error;
    });
  }

  function estimateErrors(errors, epsilon) {
    if (!errors.length || !Number.isFinite(epsilon) || epsilon <= 0) throw new RangeError('Nonempty errors and positive finite ε required.');
    let hits = 0, sumSquares = 0;
    for (const error of errors) {
      if (!Number.isFinite(error) || !Number.isFinite(error * error)) throw new RangeError('Errors must have finite squares.');
      hits += Math.abs(error) > epsilon ? 1 : 0;
      sumSquares += error * error;
    }
    return { probability: hits / errors.length, mse: sumSquares / errors.length };
  }

  // Standard normal survival approximation (absolute error < 8e-8).
  // Compute the small tail directly to avoid subtracting a CDF close to one.
  function normalSurvival(x) {
    if (x < 0) return 1 - normalSurvival(-x);
    if (x === 0) return 0.5;
    const t = 1 / (1 + 0.2316419 * x);
    return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI)
      * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  }

  function theoretical(model, n, epsilon) {
    typewriterIndex(n);
    if (!Number.isFinite(epsilon) || epsilon <= 0) throw new RangeError('Positive finite ε required.');
    if (model === 'A') {
      const mass = 1 / typewriterIndex(n).size;
      return { probability: epsilon < 1 ? mass : 0, mse: mass };
    }
    if (model === 'B') return { probability: 2 * normalSurvival(n * epsilon), mse: 1 / (n * n) };
    if (model === 'C') return n % 2 === 0 ? { probability: 0, mse: 0 }
      : { probability: 2 * normalSurvival(epsilon / Math.SQRT2), mse: 2 };
    throw new RangeError('Unknown model.');
  }

  function empiricalCDF(samples, grid) {
    if (!samples.length || !samples.every(Number.isFinite) || !grid.every(Number.isFinite)) throw new RangeError('CDF samples and grid must be finite and samples nonempty.');
    const sorted = [...samples].sort((a, b) => a - b);
    return grid.map(x => {
      let lo = 0, hi = sorted.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (sorted[mid] <= x) lo = mid + 1;
        else hi = mid;
      }
      return { x, y: lo / sorted.length };
    });
  }

  function prepareDistributions(model, snapshots, references) {
    let min = -1, max = 1;
    for (const values of [...snapshots.map(s => s.values), references]) {
      for (const x of values) { min = Math.min(min, x); max = Math.max(max, x); }
    }
    const padding = (max - min) * 0.05;
    const lo = min - padding, hi = max + padding;
    // Include the atoms exactly; left-limit points expose the jumps of model A.
    const grid = [...new Set([...Array.from({ length: 121 }, (_, i) => lo + (hi - lo) * i / 120),
      -1e-10, 0, 1 - 1e-10, 1])].sort((a, b) => a - b);
    return {
      snapshots: snapshots.map(s => ({ n: s.n, cdf: empiricalCDF(s.values, grid) })),
      reference: empiricalCDF(references, grid),
      theoreticalReference: grid.map(x => ({ x, y: model === 'C' ? normalSurvival(-x) : Number(x >= 0) }))
    };
  }

  function* simulationSteps(parameters) {
    const p = validateParameters(parameters);
    const latents = generateLatents(p);
    const references = latents.map(l => p.model === 'C' ? l.z : 0);
    const snapshotIndices = [...new Set([1, 2, p.maxN - 1, p.maxN])];
    const snapshots = [], statistics = [];
    const pathMax = Math.min(p.maxN, 127);
    const paths = Array.from({ length: Math.min(p.count, 8) }, () => []);
    for (let n = 1; n <= p.maxN; n++) {
      const values = latents.map(l => valueAt(p.model, n, l));
      const estimated = estimateErrors(calculateErrors(values, references), p.epsilon);
      statistics.push({ n, ...estimated, theory: theoretical(p.model, n, p.epsilon) });
      if (n <= pathMax) paths.forEach((path, i) => path.push({ x: n, y: values[i] }));
      if (snapshotIndices.includes(n)) snapshots.push({ n, values });
      if (n % 16 === 0) yield n / p.maxN;
    }
    return { parameters: p, paths, pathMax, statistics,
      distributions: prepareDistributions(p.model, snapshots, references) };
  }

  function simulate(parameters) {
    const iterator = simulationSteps(parameters);
    let step;
    do { step = iterator.next(); } while (!step.done);
    return step.value;
  }

  // Plot selection only: never used by any estimator. Keep paired odd/even
  // indices so C cannot appear convergent because of parity aliasing.
  function displayIndices(maxN) {
    typewriterIndex(maxN);
    const indices = new Set(Array.from({ length: Math.min(maxN, 32) }, (_, i) => i + 1));
    for (let m = 0; 2 ** m <= maxN; m++) {
      indices.add(2 ** m);
      indices.add(Math.min(maxN, 2 ** (m + 1) - 1));
    }
    for (let i = 0; i < 96; i++) {
      const n = Math.max(1, 2 * Math.floor((1 + (maxN - 1) * i / 95) / 2));
      indices.add(n);
      if (n + 1 <= maxN) indices.add(n + 1);
    }
    indices.add(maxN);
    return [...indices].sort((a, b) => a - b);
  }

  return Object.freeze({ defaults, models, validateParameters, createRng, normalPair,
    typewriterIndex, valueAt, generateLatents, generateTrajectory, calculateErrors, estimateErrors,
    normalSurvival, theoretical, empiricalCDF, prepareDistributions, simulationSteps, simulate, displayIndices });
})();

// Rendering and asynchronous orchestration are deliberately outside the numerical API.
if (typeof document !== 'undefined') {
  const form = document.getElementById('convergence-form');
  if (form) initializeConvergenceUI(form);
}

function initializeConvergenceUI(form) {
  const api = ConvergenceSimulations;
  const byId = id => document.getElementById(id);
  const fields = { model: 'simulation-model', count: 'simulation-count', maxN: 'simulation-max',
    epsilon: 'simulation-epsilon', seed: 'simulation-seed' };
  const feedback = byId('simulation-feedback');
  const warning = byId('simulation-chart-warning');
  const results = byId('simulation-results');
  const run = byId('run-simulation');
  const charts = [];
  let revision = 0;

  function destroyCharts() {
    while (charts.length) charts.pop().destroy();
    // Also clean up a partially constructed Chart if its constructor threw.
    if (typeof Chart !== 'undefined' && Chart.getChart) {
      for (const id of ['paths', 'deviation', 'mse', 'distribution']) Chart.getChart('simulation-' + id)?.destroy();
    }
  }

  function describeModel() {
    const model = api.models[byId(fields.model).value];
    const container = byId('simulation-model-info');
    container.replaceChildren();
    if (!model) return;
    for (const value of [model.title, model.definition, model.classification, model.formulas]) {
      const p = document.createElement('p');
      p.textContent = value;
      container.append(p);
    }
  }

  function invalidate(message) {
    revision++;
    run.disabled = false;
    form.setAttribute('aria-busy', 'false');
    destroyCharts();
    results.replaceChildren();
    warning.textContent = '';
    feedback.textContent = message;
  }

  function addResult(label, text) {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = text;
    results.append(dt, dd);
  }

  function renderResult(result) {
    const p = result.parameters;
    addResult('Effective parameters', `${api.models[p.model].title}; trajectories = ${p.count}; maximum n = ${p.maxN}; ε = ${p.epsilon}; seed = ${p.seed}.`);
    const format = x => x === 0 ? '0' : x.toPrecision(6);
    for (const n of [...new Set([1, 2, p.maxN - 1, p.maxN])]) {
      const row = result.statistics[n - 1];
      addResult(`At n = ${n}`, `Estimated P(|X_n − X| > ε) = ${format(row.probability)}; theory = ${format(row.theory.probability)}. `
        + `Estimated MSE = ${format(row.mse)}; theory = ${format(row.theory.mse)}.`);
    }
    addResult('Reading the plots', `Paths show every index from 1 to ${result.pathMax}. Error curves display ${api.displayIndices(p.maxN).length} indices; `
      + `statistics used all ${p.maxN} indices and all ${p.count} trajectories. Normal probability curves use a numerical tail approximation `
      + '(absolute error below 0.0000002 for two-sided probabilities); extreme tails may underflow to zero. Displayed numbers are rounded.');
    addResult('Monte Carlo limits', 'Finite samples illustrate the model and do not prove convergence. Zero observed deviations do not imply zero population probability. '
      + 'Shared random draws make estimates at different indices dependent; CDFs and paths convey different information.');
    renderCharts(result);
  }

  function renderCharts(result) {
    destroyCharts();
    if (typeof Chart === 'undefined') {
      warning.textContent = 'Chart.js is unavailable. Numerical results and theoretical explanations remain available; run again after Chart.js becomes available.';
      return;
    }
    const colors = ['#174ea6', '#c2410c', '#047857', '#7e22ce', '#be123c', '#0e7490', '#4d7c0f', '#a16207'];
    const series = (label, data, index, extra = {}) => ({ label, data, borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length], pointRadius: 0, borderWidth: 2, ...extra });
    const draw = (id, datasets, xTitle, yTitle, probability = false) => {
      charts.push(new Chart(byId('simulation-' + id), {
        type: 'line', data: { datasets }, options: {
          responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
          scales: { x: { type: 'linear', title: { display: true, text: xTitle } },
            y: { min: probability ? 0 : undefined, max: probability ? 1 : undefined,
              title: { display: true, text: yTitle } } },
          plugins: { legend: { labels: { boxWidth: 12, font: { size: 10 } } } }
        }
      }));
    };
    try {
      draw('paths', result.paths.map((path, i) => series(`Path ${i + 1}`, path, i)), 'n (initial window)', 'X_n');
      const rows = api.displayIndices(result.parameters.maxN).map(n => result.statistics[n - 1]);
      for (const [id, key, title] of [['deviation', 'probability', 'P(|X_n − X| > ε)'], ['mse', 'mse', 'Mean-square error']]) {
        draw(id, [series('Monte Carlo estimate', rows.map(r => ({ x: r.n, y: r[key] })), 0),
          series('Theoretical value', rows.map(r => ({ x: r.n, y: r.theory[key] })), 1, { borderDash: [6, 4] })], 'n', title, key === 'probability');
      }
      const d = result.distributions;
      draw('distribution', [...d.snapshots.map((s, i) => series(`Empirical X_n, n = ${s.n}`, s.cdf, i)),
        series('Empirical reference X', d.reference, 4, { borderDash: [3, 3] }),
        series('Theoretical reference CDF', d.theoreticalReference, 5, { borderDash: [7, 4] })], 'x (shared grid)', 'CDF: P(value ≤ x)', true);
    } catch {
      destroyCharts();
      warning.textContent = 'Charts could not be rendered. Numerical results remain available. Run again to retry.';
    }
  }

  form.addEventListener('input', () => {
    invalidate('Parameters changed. Run Simulation to compute new results.');
    describeModel();
  });
  form.addEventListener('change', () => {
    invalidate('Parameters changed. Run Simulation to compute new results.');
    describeModel();
  });
  byId('reset-simulation').addEventListener('click', () => {
    form.reset();
    invalidate('Reset complete. No simulation has been run.');
    describeModel();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    let parameters;
    try {
      parameters = api.validateParameters(Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, byId(id).value])));
    } catch (error) {
      invalidate(error.message);
      return;
    }
    invalidate('Running simulation…');
    const current = revision;
    run.disabled = true;
    form.setAttribute('aria-busy', 'true');
    try {
      const iterator = api.simulationSteps(parameters);
      // Yield before work, then every 16 indices, so edits/reset can cancel.
      let step;
      do {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (current !== revision) return;
        step = iterator.next();
        if (!step.done) feedback.textContent = `Running simulation… ${Math.floor(step.value * 100)}%`;
      } while (!step.done);
      if (current !== revision) return;
      renderResult(step.value);
      feedback.textContent = 'Simulation complete. Classification is theoretical; estimates are Monte Carlo.';
    } catch (error) {
      if (current === revision) invalidate(`Simulation failed: ${error.message}`);
    } finally {
      if (current === revision) {
        run.disabled = false;
        form.setAttribute('aria-busy', 'false');
      }
    }
  });
  describeModel();
}

// Step 3: independent numerical API. The verified convergence models above are
// unchanged; only their seeded RNG is reused. A row is one independent replica.
const SampleMeanExperiments = (() => {
  const defaults = Object.freeze({ distribution: 'bernoulli', p: 0.5, maxN: 500,
    count: 3000, paths: 6, epsilon: 0.1, seed: 42 });
  const sizes = Object.freeze([1, 2, 5, 10, 30, 50, 100, 200]);

  function finiteNumber(value, label) {
    if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))) {
      throw new RangeError(`${label} must be a finite number; empty values are not allowed.`);
    }
    return Number(value);
  }

  function checkN(n) {
    if (!Number.isInteger(n) || n < 1 || n > 2000) throw new RangeError('Maximum n must be an integer from 1 to 2,000.');
  }

  function populationMoments(distribution, p) {
    if (distribution === 'uniform') return { mean: 0.5, variance: 1 / 12, sd: Math.sqrt(1 / 12) };
    if (distribution !== 'bernoulli') throw new RangeError('Select Bernoulli or Uniform.');
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError('Bernoulli p must be between 0 and 1.');
    const variance = p * (1 - p);
    return { mean: p, variance, sd: Math.sqrt(variance) };
  }

  function validateParameters(raw) {
    if (!raw) throw new RangeError('Parameters are required.');
    const p = { distribution: raw.distribution,
      p: raw.distribution === 'bernoulli' ? finiteNumber(raw.p, 'Bernoulli p') : null };
    populationMoments(p.distribution, p.p);
    for (const key of ['maxN', 'count', 'paths', 'epsilon', 'seed']) p[key] = finiteNumber(raw[key], key);
    checkN(p.maxN);
    if (!Number.isInteger(p.count) || p.count < 200 || p.count > 5000) throw new RangeError('Replicas must be an integer from 200 to 5,000.');
    if (!Number.isInteger(p.paths) || p.paths < 1 || p.paths > 8) throw new RangeError('Displayed paths must be an integer from 1 to 8.');
    if (p.epsilon <= 0) throw new RangeError('ε must be strictly positive.');
    ConvergenceSimulations.createRng(p.seed); // Validate seed with the shared implementation.
    return p;
  }

  function generateSample(distribution, p, n, random) {
    populationMoments(distribution, p);
    checkN(n);
    return Array.from({ length: n }, () => distribution === 'uniform' ? random() : Number(random() < p));
  }

  function sampleFromSeed(distribution, p, n, seed) {
    return generateSample(distribution, p, n, ConvergenceSimulations.createRng(seed));
  }

  function cumulativeMeans(observations) {
    if (!observations.length) throw new RangeError('A sample must be nonempty.');
    let sum = 0;
    return observations.map((x, i) => {
      if (!Number.isFinite(x)) throw new RangeError('Observations must be finite.');
      sum += x;
      return sum / (i + 1);
    });
  }

  function finalMeans(samples) {
    if (!samples.length) throw new RangeError('At least one replica is required.');
    return samples.map(sample => cumulativeMeans(sample).at(-1));
  }

  function sampleMoments(values) {
    if (values.length < 2) throw new RangeError('At least two replicas are required for sample variance.');
    let mean = 0, m2 = 0, count = 0;
    for (const value of values) {
      if (!Number.isFinite(value)) throw new RangeError('Values must be finite.');
      const delta = value - mean;
      mean += delta / ++count;
      m2 += delta * (value - mean);
    }
    const variance = Math.max(0, m2 / (count - 1));
    return { mean, variance, sd: Math.sqrt(variance) };
  }

  function meanTheory(distribution, p, n, dependent = false) {
    checkN(n);
    const moments = populationMoments(distribution, p);
    const variance = dependent ? moments.variance : moments.variance / n;
    return { mean: moments.mean, variance, sd: Math.sqrt(variance) };
  }

  function standardizeMean(mean, n, moments) {
    checkN(n);
    if (!Number.isFinite(mean) || !Number.isFinite(moments.mean) || !Number.isFinite(moments.sd) || moments.sd < 0) {
      throw new RangeError('Finite mean and population moments required.');
    }
    return moments.sd === 0 ? null : Math.sqrt(n) * (mean - moments.mean) / moments.sd;
  }

  function deviationProbability(means, mu, epsilon) {
    if (!means.length || !Number.isFinite(mu) || !Number.isFinite(epsilon) || epsilon <= 0 || !means.every(Number.isFinite)) {
      throw new RangeError('Finite means and positive finite ε required.');
    }
    return means.filter(x => Math.abs(x - mu) > epsilon).length / means.length;
  }

  function chebyshevBound(variance, n, epsilon) {
    checkN(n);
    if (!Number.isFinite(variance) || variance < 0 || !Number.isFinite(epsilon) || epsilon <= 0) {
      throw new RangeError('Nonnegative finite variance and positive finite ε required.');
    }
    // Sequential division avoids underflow in epsilon²; an overflowing raw bound
    // is legitimately displayed as infinity and capped at one for plotting.
    const raw = variance === 0 ? 0 : variance / n / epsilon / epsilon;
    return { raw, capped: Math.min(1, raw) };
  }

  function histogram(values, edges) {
    if (!values.length || edges.length < 2 || !values.every(Number.isFinite)
      || !edges.every((x, i) => Number.isFinite(x) && (!i || x > edges[i - 1]))) {
      throw new RangeError('Finite samples and strictly increasing bin edges required.');
    }
    const counts = Array(edges.length - 1).fill(0);
    for (const x of values) {
      if (x < edges[0] || x > edges.at(-1)) throw new RangeError('Histogram edges must cover every sample.');
      let lo = 0, hi = counts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >>> 1;
        if (x >= edges[mid]) lo = mid;
        else hi = mid - 1;
      }
      counts[lo]++;
    }
    return counts.map((count, i) => ({ left: edges[i], right: edges[i + 1],
      x: (edges[i] + edges[i + 1]) / 2, count, density: count / values.length / (edges[i + 1] - edges[i]) }));
  }

  const normalDensity = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);

  function displayIndices(maxN) {
    checkN(maxN);
    const indices = new Set(Array.from({ length: Math.min(30, maxN) }, (_, i) => i + 1));
    for (let i = 0; i < 270; i++) indices.add(1 + Math.round((maxN - 1) * i / 269));
    return [...indices].sort((a, b) => a - b);
  }

  function* simulationSteps(parameters) {
    const p = validateParameters(parameters);
    const population = populationMoments(p.distribution, p.p);
    const random = ConvergenceSimulations.createRng(p.seed);
    const dependentRandom = ConvergenceSimulations.createRng((p.seed ^ 0x9e3779b9) >>> 0);
    const nValues = [...new Set([...sizes.filter(n => n <= p.maxN), p.maxN])].sort((a, b) => a - b);
    const snapshots = nValues.map(n => ({ n, means: [] }));
    const aggregates = Array.from({ length: p.maxN }, () => ({ mean: 0, m2: 0, hits: 0 }));
    const dependentMeans = [], paths = [], indices = displayIndices(p.maxN);
    for (let replica = 0; replica < p.count; replica++) {
      const observations = generateSample(p.distribution, p.p, p.maxN, random);
      const means = cumulativeMeans(observations);
      means.forEach((value, i) => {
        const row = aggregates[i], delta = value - row.mean;
        row.mean += delta / (replica + 1);
        row.m2 += delta * (value - row.mean);
        row.hits += Math.abs(value - population.mean) > p.epsilon ? 1 : 0;
      });
      if (replica < p.paths) paths.push(indices.map(n => ({ x: n, y: means[n - 1] })));
      for (const snapshot of snapshots) snapshot.means.push(means[snapshot.n - 1]);
      // This single Y is the dependent mean at every n, with no CLT applied.
      dependentMeans.push(generateSample(p.distribution, p.p, 1, dependentRandom)[0]);
      if ((replica + 1) % 16 === 0) yield (replica + 1) / p.count;
    }
    const statistics = aggregates.map((row, i) => {
      const variance = Math.max(0, row.m2 / (p.count - 1));
      return { n: i + 1, mean: row.mean, variance, sd: Math.sqrt(variance), probability: row.hits / p.count,
        theory: meanTheory(p.distribution, p.p, i + 1), bound: chebyshevBound(population.variance, i + 1, p.epsilon) };
    });
    const dependent = { ...sampleMoments(dependentMeans), theory: population.variance };
    const standardized = population.sd === 0 ? [] : snapshots.map(s => ({ n: s.n,
      values: s.means.map(mean => standardizeMean(mean, s.n, population)) }));
    let min = -4, max = 4;
    for (const s of standardized) for (const x of s.values) { min = Math.min(min, x); max = Math.max(max, x); }
    const edges = Array.from({ length: 41 }, (_, i) => min + (max - min) * i / 40);
    // Preserve exact extreme endpoints against floating-point interpolation.
    edges[0] = min;
    edges[40] = max;
    return { parameters: p, population, statistics, paths, snapshots, dependent, edges,
      clt: standardized.map(s => ({ n: s.n, ...sampleMoments(s.values), histogram: histogram(s.values, edges) })) };
  }

  function simulate(parameters) {
    const steps = simulationSteps(parameters);
    let step;
    do { step = steps.next(); } while (!step.done);
    return step.value;
  }

  return Object.freeze({ defaults, sizes, validateParameters, populationMoments, generateSample,
    sampleFromSeed, cumulativeMeans, finalMeans, sampleMoments, meanTheory, standardizeMean,
    deviationProbability, chebyshevBound, histogram, normalDensity, displayIndices, simulationSteps, simulate });
})();

if (typeof document !== 'undefined' && document.getElementById('means-form')) initializeSampleMeanUI();

function initializeSampleMeanUI() {
  const api = SampleMeanExperiments, byId = id => document.getElementById(id);
  const form = byId('means-form'), run = byId('run-lln'), selectN = byId('clt-n');
  const feedback = byId('means-feedback'), warning = byId('means-chart-warning');
  const fields = { distribution: 'means-distribution', p: 'means-p', maxN: 'means-max',
    count: 'means-count', paths: 'means-paths', epsilon: 'means-epsilon', seed: 'means-seed' };
  const charts = new Map();
  let revision = 0, result = null;
  const format = x => x === Infinity ? '∞' : x === 0 ? '0' : x.toPrecision(6);

  function destroyChart(id) {
    charts.get(id)?.destroy();
    charts.delete(id);
    if (typeof Chart !== 'undefined' && Chart.getChart) Chart.getChart(id)?.destroy();
  }

  function destroyCharts() {
    for (const id of ['means-lln-chart', 'means-probability-chart', 'means-clt-chart', 'means-scaling-chart']) destroyChart(id);
  }

  function invalidate(message) {
    revision++;
    result = null;
    destroyCharts();
    run.disabled = false;
    form.setAttribute('aria-busy', 'false');
    byId('means-p').disabled = byId('means-distribution').value === 'uniform';
    for (const id of ['means-parameters', 'means-population', 'lln-results', 'means-scaling-table', 'means-dependence-table']) byId(id).replaceChildren();
    selectN.replaceChildren(new Option('Run LLN Simulation first', ''));
    selectN.disabled = true;
    byId('clt-results').textContent = 'Run the shared experiment above to compare standardized means.';
    byId('scaling-results').textContent = 'Run the shared experiment above to populate the variance table.';
    warning.textContent = '';
    feedback.textContent = message;
  }

  function makeTable(containerId, captionText, headings, rows) {
    const table = document.createElement('table');
    table.className = 'means-table';
    const caption = table.createCaption();
    caption.textContent = captionText;
    const head = table.createTHead().insertRow();
    for (const heading of headings) {
      const th = document.createElement('th');
      th.scope = 'col'; th.textContent = heading; head.append(th);
    }
    const body = table.createTBody();
    for (const row of rows) {
      const tr = body.insertRow();
      row.forEach((value, i) => {
        const cell = document.createElement(i ? 'td' : 'th');
        if (!i) cell.scope = 'row';
        cell.dataset.label = headings[i];
        cell.textContent = value;
        tr.append(cell);
      });
    }
    byId(containerId).replaceChildren(table);
  }

  function series(label, data, color = '#174ea6', extra = {}) {
    return { label, data, borderColor: color, backgroundColor: color, pointRadius: 0, borderWidth: 2, ...extra };
  }

  function chart(id, datasets, xTitle, yTitle, probability = false) {
    destroyChart(id);
    if (typeof Chart === 'undefined') {
      warning.textContent = 'Chart.js is unavailable. Tables and numerical results remain available. Run again when Chart.js becomes available.';
      return;
    }
    try {
      charts.set(id, new Chart(byId(id), { type: 'line', data: { datasets }, options: {
        animation: false, responsive: true, maintainAspectRatio: false, parsing: false,
        scales: { x: { type: 'linear', title: { display: true, text: xTitle } },
          y: { min: probability ? 0 : undefined, max: probability ? 1 : undefined,
            title: { display: true, text: yTitle } } },
        plugins: { legend: { labels: { boxWidth: 12, font: { size: 10 } } } }
      } }));
    } catch {
      destroyChart(id);
      warning.textContent = 'A chart could not be rendered. Tables and numerical results remain available; run again to retry.';
    }
  }

  function renderCLT() {
    if (!result) return;
    destroyChart('means-clt-chart');
    const n = Number(selectN.value), p = result.parameters;
    if (result.population.sd === 0) {
      byId('clt-results').textContent = `σ = 0: standardization is undefined for Bernoulli p = ${p.p}. `
        + `All ${p.count} sample means equal μ = ${p.p}; no standardized histogram or normal comparison is drawn.`;
      return;
    }
    const row = result.clt.find(s => s.n === n);
    if (!row) return;
    const area = row.histogram.reduce((s, bin) => s + bin.density * (bin.right - bin.left), 0);
    byId('clt-results').textContent = `n = ${n}; independent replicas = ${p.count}; empirical mean of Z_n = ${format(row.mean)}; `
      + `empirical variance of Z_n (R − 1) = ${format(row.variance)}. Population targets: mean 0 and variance 1. `
      + `Histogram area = ${format(area)}; bin width = ${format(result.edges[1] - result.edges[0])}.`;
    const lo = result.edges[0], hi = result.edges.at(-1);
    const grid = [...new Set([...Array.from({ length: 201 }, (_, i) => lo + (hi - lo) * i / 200),
      -4, -3, -2, -1, 0, 1, 2, 3, 4])].sort((a, b) => a - b);
    chart('means-clt-chart', [series('Empirical density', row.histogram.map(bin => ({ x: bin.x, y: bin.density })),
      '#174ea6', { type: 'bar', backgroundColor: '#174ea680', categoryPercentage: 1, barPercentage: 1 }),
    series('N(0,1) density', grid.map(x => ({ x, y: api.normalDensity(x) })), '#c2410c')], 'Z_n (shared bin edges)', 'Density');
  }

  function render(data) {
    result = data;
    const p = data.parameters, pop = data.population, last = data.statistics.at(-1);
    byId('means-parameters').textContent = `Effective parameters: ${p.distribution === 'uniform' ? 'Uniform(0,1); Bernoulli p unused' : `Bernoulli(${p.p})`}; `
      + `maximum n = ${p.maxN}; replicas = ${p.count}; displayed paths = ${p.paths}; ε = ${p.epsilon}; seed = ${p.seed}.`;
    byId('means-population').textContent = `Known population parameters: μ = ${format(pop.mean)}; σ² = ${format(pop.variance)}; σ = ${format(pop.sd)}. `
      + 'These are theoretical parameters, not estimates from the generated sample.';
    byId('lln-results').textContent = `At n = ${p.maxN}, estimated P(|X̄_n − μ| > ε) = ${format(last.probability)}; `
      + `raw Chebyshev bound = ${format(last.bound.raw)}; capped bound = ${format(last.bound.capped)}. `
      + 'Monte Carlo estimates have sampling error; zero observed deviations do not establish zero probability.';
    const rows = data.snapshots.map(s => data.statistics[s.n - 1]);
    makeTable('means-scaling-table', `Independent sample means — ${p.count} replicas at every n`,
      ['n', 'Theoretical variance', 'Theoretical SD', 'Empirical variance', 'Empirical SD'],
      rows.map(r => [r.n, format(r.theory.variance), format(r.theory.sd), format(r.variance), format(r.sd)]));
    makeTable('means-dependence-table', `Variance comparison — ${p.count} replicas in each case`,
      ['n', 'Independent theory', 'Independent empirical', 'Dependent theory', 'Dependent empirical'],
      rows.map(r => [r.n, format(r.theory.variance), format(r.variance), format(data.dependent.theory), format(data.dependent.variance)]));
    byId('scaling-results').textContent = `At n = ${p.maxN}: independent variance estimate = ${format(last.variance)} `
      + `(theory ${format(last.theory.variance)}); perfectly dependent variance estimate = ${format(data.dependent.variance)} `
      + `(theory ${format(pop.variance)}). The dependent mean is the same Y at every n. `
      + 'Variance and SD estimates fluctuate across finite samples; only the i.i.d. case has the stated square-root reduction.';
    const indices = api.displayIndices(p.maxN);
    const colors = ['#174ea6', '#047857', '#7e22ce', '#be123c', '#0e7490', '#4d7c0f', '#a16207', '#475569'];
    chart('means-lln-chart', [...data.paths.map((path, i) => series(`Mean path ${i + 1}`, path, colors[i])),
      series('Theoretical μ', indices.map(n => ({ x: n, y: pop.mean })), '#c2410c', { borderDash: [6, 4] })], 'n', 'Cumulative mean');
    chart('means-probability-chart', [series('Monte Carlo probability', indices.map(n => ({ x: n, y: data.statistics[n - 1].probability }))),
      series('min(1, Chebyshev bound)', indices.map(n => ({ x: n, y: data.statistics[n - 1].bound.capped })), '#c2410c', { borderDash: [6, 4] })],
    'n', 'P(|X̄_n − μ| > ε)', true);
    chart('means-scaling-chart', [series('Empirical SD', indices.map(n => ({ x: n, y: data.statistics[n - 1].sd }))),
      series('Theoretical σ/√n', indices.map(n => ({ x: n, y: data.statistics[n - 1].theory.sd })), '#c2410c', { borderDash: [6, 4] })], 'n', 'SD of independent sample means');
    selectN.replaceChildren(...data.snapshots.map(s => new Option(String(s.n), String(s.n))));
    selectN.value = String(data.snapshots.some(s => s.n === 200) ? 200 : p.maxN);
    selectN.disabled = false;
    renderCLT();
  }

  for (const event of ['input', 'change']) form.addEventListener(event, () => invalidate('Parameters changed. Run LLN Simulation to update all three experiments.'));
  selectN.addEventListener('change', renderCLT);
  byId('reset-means').addEventListener('click', () => { form.reset(); invalidate('Reset complete. No sample-mean experiment has been run.'); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    let p;
    try { p = api.validateParameters(Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, byId(id).value]))); }
    catch (error) { invalidate(error.message); return; }
    invalidate('Running sample-mean experiments…');
    const current = revision;
    run.disabled = true;
    form.setAttribute('aria-busy', 'true');
    try {
      const iterator = api.simulationSteps(p);
      let step;
      do {
        await new Promise(resolve => setTimeout(resolve, 0));
        if (current !== revision) return;
        step = iterator.next();
        if (!step.done) feedback.textContent = `Running sample-mean experiments… ${Math.floor(100 * step.value)}%`;
      } while (!step.done);
      if (current !== revision) return;
      render(step.value);
      feedback.textContent = 'Sample-mean experiments complete. Finite simulations illustrate, but do not prove, LLN or CLT.';
    } catch (error) {
      if (current === revision) invalidate(`Experiment failed: ${error.message}`);
    } finally {
      if (current === revision) { run.disabled = false; form.setAttribute('aria-busy', 'false'); }
    }
  });
}

// Step 4: event probabilities only. Parameter-distribution inference is left to
// later steps. This API is independent of DOM state and chart rendering.
const EventProbabilityCalculators = (() => {
  const diagnostic = Object.freeze({ prior: 0.01, likelihoodH: 0.95, likelihoodNotH: 0.05 });

  function validateProbability(value, label = 'Probability') {
    if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') {
      throw new RangeError(`${label} must be a number; empty values are not allowed.`);
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 1) throw new RangeError(`${label} must be finite and between 0 and 1.`);
    return number === 0 ? 0 : number;
  }

  function formatResult(value) {
    if (value === null) return 'Undefined';
    if (!Number.isFinite(value)) throw new RangeError('Only finite or explicitly undefined results can be formatted.');
    return value === 0 ? '0' : value === 1 ? '1' : value.toPrecision(12);
  }

  function conditionalProbabilities(raw) {
    const a = validateProbability(raw.a, 'P(A)'), b = validateProbability(raw.b, 'P(B)');
    const joint = validateProbability(raw.joint, 'P(A ∩ B)');
    const lower = Math.max(0, a + b - 1), upper = Math.min(a, b);
    // The upper bound uses no arithmetic, so compare it exactly. Only the
    // subtracted lower boundary has an explicit floating-point error allowance.
    const tolerance = 4 * Number.EPSILON * Math.max(a, b);
    if (joint > upper || joint < lower - tolerance) {
      throw new RangeError(`Fréchet bounds require ${formatResult(lower)} ≤ P(A ∩ B) ≤ ${formatResult(upper)}.`);
    }
    let neither = (1 - a) - (b - joint);
    const roundingAdjusted = neither < 0 && neither >= -tolerance;
    if (roundingAdjusted) neither = 0; // Only a certified boundary-rounding residual.
    if (neither < 0) throw new RangeError('The event probabilities violate the Fréchet lower bound.');
    return { a, b, joint, givenB: b === 0 ? null : joint / b, givenA: a === 0 ? null : joint / a,
      lower, upper, roundingAdjusted, atoms: [
        { label: 'A ∩ B', value: joint }, { label: 'A only', value: a - joint },
        { label: 'B only', value: b - joint }, { label: 'Neither A nor B', value: neither }
      ] };
  }

  function evidenceProbability(priorValue, hValue, notHValue) {
    const prior = validateProbability(priorValue, 'Prior P(H)');
    const h = validateProbability(hValue, 'P(E | H)'), notH = validateProbability(notHValue, 'P(E | not H)');
    const logH = prior > 0 && h > 0 ? Math.log(prior) + Math.log(h) : -Infinity;
    const logNotH = prior < 1 && notH > 0 ? Math.log1p(-prior) + Math.log(notH) : -Infinity;
    const impossible = logH === -Infinity && logNotH === -Infinity;
    // Scale likelihoods first: two subnormal weighted terms can round to zero
    // separately even when their sum is representable (e.g. equal tiny likelihoods).
    const scale = Math.max(h, notH);
    const value = scale === 0 ? 0 : scale * ((h / scale) * prior + (notH / scale) * (1 - prior));
    const max = Math.max(logH, logNotH), min = Math.min(logH, logNotH);
    return { value, impossible, underflow: value === 0 && !impossible,
      logValue: impossible ? -Infinity : max + Math.log1p(Math.exp(min - max)), logH, logNotH };
  }

  function bayes(raw) {
    const prior = validateProbability(raw.prior, 'Prior P(H)');
    const likelihoodH = validateProbability(raw.likelihoodH, 'P(E | H)');
    const likelihoodNotH = validateProbability(raw.likelihoodNotH, 'P(E | not H)');
    const evidence = evidenceProbability(prior, likelihoodH, likelihoodNotH);
    let posterior = null;
    if (!evidence.impossible) {
      if (evidence.logH === -Infinity) posterior = 0;
      else if (evidence.logNotH === -Infinity) posterior = 1;
      else {
        const difference = evidence.logNotH - evidence.logH;
        // Stable normalization of the two weights, without clipping to [0,1].
        if (difference >= 0) {
          const ratio = Math.exp(-difference);
          posterior = ratio / (1 + ratio);
        } else posterior = 1 / (1 + Math.exp(difference));
      }
    }
    const bayesFactor = likelihoodNotH === 0 ? null : likelihoodH / likelihoodNotH;
    return { prior, likelihoodH, likelihoodNotH, evidence, posterior, bayesFactor,
      factorOverflow: bayesFactor !== null && !Number.isFinite(bayesFactor),
      posteriorUnderflow: posterior === 0 && evidence.logH !== -Infinity && !evidence.impossible };
  }

  function priorPosteriorCurve(likelihoodH, likelihoodNotH, selectedPrior) {
    const selected = bayes({ prior: selectedPrior, likelihoodH, likelihoodNotH });
    const points = Array.from({ length: 201 }, (_, i) => {
      const prior = i / 200;
      return { x: prior, y: bayes({ prior, likelihoodH: selected.likelihoodH,
        likelihoodNotH: selected.likelihoodNotH }).posterior };
    });
    return { points, selected: { x: selected.prior, y: selected.posterior } };
  }

  function priorSummary(h, notH) {
    h = validateProbability(h); notH = validateProbability(notH);
    if (h === 0 && notH === 0) return 'The evidence is impossible for every prior; no posterior is defined.';
    if (h === 0) return 'For every prior below 1, this evidence rules out H and the posterior is 0. At prior 1, the evidence is impossible.';
    if (notH === 0) return 'For every positive prior, this evidence rules out not H and the posterior is 1. At prior 0, the evidence is impossible.';
    if (h === notH) return 'The likelihoods are equal: this evidence does not change the prior, so posterior = prior.';
    return `The evidence favors ${h > notH ? 'H' : 'not H'}. With these positive likelihoods held fixed, increasing the prior increases the posterior. `
      + 'The posterior depends on both the prior and the relative likelihoods, not sensitivity alone.';
  }

  return Object.freeze({ diagnostic, validateProbability, formatResult, conditionalProbabilities,
    evidenceProbability, bayes, priorPosteriorCurve, priorSummary });
})();

if (typeof document !== 'undefined' && document.getElementById('conditional-form')) initializeEventProbabilityUI();

function initializeEventProbabilityUI() {
  const api = EventProbabilityCalculators, byId = id => document.getElementById(id);
  let priorChart = null;
  const conditionalForm = byId('conditional-form'), bayesForm = byId('bayes-event-form');

  function addResult(container, label, value) {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = value; container.append(dt, dd);
  }

  function clearConditional(message) {
    byId('conditional-results').replaceChildren();
    byId('conditional-visual').replaceChildren();
    byId('conditional-feedback').textContent = message;
  }

  function clearBayes(message) {
    priorChart?.destroy(); priorChart = null;
    if (typeof Chart !== 'undefined' && Chart.getChart) Chart.getChart('bayes-prior-chart')?.destroy();
    byId('bayes-event-results').replaceChildren();
    byId('bayes-prior-summary').textContent = '';
    byId('bayes-event-chart-warning').textContent = '';
    byId('bayes-event-feedback').textContent = message;
  }

  function calculateConditional(event) {
    event?.preventDefault();
    clearConditional('');
    try {
      const r = api.conditionalProbabilities({ a: byId('conditional-a').value,
        b: byId('conditional-b').value, joint: byId('conditional-joint').value });
      const out = byId('conditional-results');
      addResult(out, 'Input P(A)', api.formatResult(r.a));
      addResult(out, 'Input P(B)', api.formatResult(r.b));
      addResult(out, 'P(A ∩ B)', api.formatResult(r.joint));
      addResult(out, 'P(A | B)', r.givenB === null ? 'Undefined: P(B) = 0.' : api.formatResult(r.givenB));
      addResult(out, 'P(B | A)', r.givenA === null ? 'Undefined: P(A) = 0.' : api.formatResult(r.givenA));
      for (const atom of r.atoms) {
        const p = document.createElement('p'), meter = document.createElement('meter');
        p.textContent = `${atom.label}: ${api.formatResult(atom.value)}`;
        meter.min = 0; meter.max = 1; meter.value = atom.value;
        meter.setAttribute('aria-label', atom.label); meter.textContent = api.formatResult(atom.value);
        p.append(meter); byId('conditional-visual').append(p);
      }
      byId('conditional-feedback').textContent = 'Conditional probabilities calculated.'
        + (r.roundingAdjusted ? ' A boundary rounding residual was resolved within floating-point tolerance.' : '');
    } catch (error) { clearConditional(error.message); }
  }

  function drawPriorCurve(curve) {
    if (typeof Chart === 'undefined') {
      byId('bayes-event-chart-warning').textContent = 'Chart.js is unavailable. The calculator and numerical results remain operational; calculate again when charts are available.';
      return;
    }
    try {
      priorChart = new Chart(byId('bayes-prior-chart'), { type: 'line', data: { datasets: [
        { label: 'Posterior P(H | E)', data: curve.points, borderColor: '#174ea6',
          borderWidth: 2, pointRadius: 0, spanGaps: false },
        { label: 'Selected prior and posterior', data: [curve.selected], borderColor: '#c2410c',
          backgroundColor: '#c2410c', pointRadius: 6, showLine: false }
      ] }, options: { responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
        scales: { x: { type: 'linear', min: 0, max: 1, title: { display: true, text: 'Prior P(H)' } },
          y: { min: 0, max: 1, title: { display: true, text: 'Posterior P(H | E)' } } },
        plugins: { legend: { labels: { boxWidth: 12, font: { size: 10 } } } }
      } });
    } catch {
      priorChart?.destroy(); priorChart = null;
      if (Chart.getChart) Chart.getChart('bayes-prior-chart')?.destroy();
      byId('bayes-event-chart-warning').textContent = 'The prior/posterior chart could not be rendered. Numerical results remain available.';
    }
  }

  function calculateBayes(event) {
    event?.preventDefault();
    clearBayes('');
    try {
      const r = api.bayes({ prior: byId('bayes-prior').value, likelihoodH: byId('bayes-likelihood-h').value,
        likelihoodNotH: byId('bayes-likelihood-not-h').value });
      const out = byId('bayes-event-results');
      addResult(out, 'Prior P(H)', api.formatResult(r.prior));
      addResult(out, 'Likelihood P(E | H)', api.formatResult(r.likelihoodH));
      addResult(out, 'Likelihood P(E | not H)', api.formatResult(r.likelihoodNotH));
      addResult(out, 'Evidence probability P(E)', r.evidence.underflow
        ? 'Positive, below floating-point range (underflow); evidence is not impossible.' : api.formatResult(r.evidence.value));
      addResult(out, 'Posterior P(H | E)', r.posterior === null ? 'Undefined: P(E) = 0; the evidence is impossible under this model.'
        : api.formatResult(r.posterior) + (r.posteriorUnderflow ? ' (positive value below floating-point range)' : ` (${api.formatResult(100 * r.posterior)}%).`));
      addResult(out, 'Bayes factor P(E | H) / P(E | not H)', r.bayesFactor === null
        ? 'Undefined: P(E | not H) = 0.' : r.factorOverflow ? 'Defined, but exceeds the finite floating-point range.' : api.formatResult(r.bayesFactor));
      byId('bayes-prior-summary').textContent = api.priorSummary(r.likelihoodH, r.likelihoodNotH)
        + (r.posterior === null ? ' The selected prior has no defined posterior, so no selected marker is drawn.'
          : ` Selected prior: ${api.formatResult(r.prior)}; posterior: ${api.formatResult(r.posterior)}.`);
      drawPriorCurve(api.priorPosteriorCurve(r.likelihoodH, r.likelihoodNotH, r.prior));
      byId('bayes-event-feedback').textContent = r.posterior === null ? 'Inputs are valid; the posterior is undefined because P(E) = 0.'
        : 'Bayesian event update calculated from the supplied probabilities.';
    } catch (error) { clearBayes(error.message); }
  }

  conditionalForm.addEventListener('submit', calculateConditional);
  bayesForm.addEventListener('submit', calculateBayes);
  for (const event of ['input', 'change']) {
    conditionalForm.addEventListener(event, () => clearConditional('Inputs changed. Calculate again to update the results.'));
    bayesForm.addEventListener(event, () => clearBayes('Inputs changed. Calculate again to update the results and curve.'));
  }
  byId('reset-conditional').addEventListener('click', () => { conditionalForm.reset(); clearConditional('Reset complete. No conditional probabilities have been calculated.'); });
  byId('reset-bayes-event').addEventListener('click', () => { bayesForm.reset(); clearBayes('Reset complete. No Bayesian update has been calculated.'); });
  byId('bayes-diagnostic-preset').addEventListener('click', () => {
    byId('bayes-prior').value = api.diagnostic.prior;
    byId('bayes-likelihood-h').value = api.diagnostic.likelihoodH;
    byId('bayes-likelihood-not-h').value = api.diagnostic.likelihoodNotH;
    calculateBayes();
  });
}

// Step 5: conjugate parameter inference, separate from the event calculators.
const BetaBernoulliInference = (() => {
  const defaults = Object.freeze({ a: 2, b: 2, successes: 8, failures: 2 });
  const plotMinimum = 1e-6, plotMaximum = 1 - plotMinimum;

  function number(value, label) {
    if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))) {
      throw new RangeError(`${label} must be finite; empty values are not allowed.`);
    }
    return Number(value);
  }

  function validateBeta(a, b) {
    a = number(a, 'Shape a'); b = number(b, 'Shape b');
    if (a <= 0 || b <= 0 || a > 22000 || b > 22000) throw new RangeError('Beta shapes must be positive and at most 22,000 in the numerical API.');
    return { a, b };
  }

  function validateCounts(successes, failures) {
    successes = number(successes, 'Successes'); failures = number(failures, 'Failures');
    for (const count of [successes, failures]) {
      if (!Number.isInteger(count) || count < 0 || count > 10000) throw new RangeError('Successes and failures must each be integers from 0 to 10,000.');
    }
    return { successes, failures, n: successes + failures };
  }

  function validateParameters(raw) {
    const p = { ...validateBeta(raw.a, raw.b), ...validateCounts(raw.successes, raw.failures) };
    if (p.a < 0.001 || p.b < 0.001 || p.a > 1000 || p.b > 1000) throw new RangeError('Interactive prior shapes must be between 0.001 and 1,000.');
    return p;
  }

  function moments(a, b) {
    ({ a, b } = validateBeta(a, b));
    const total = a + b, mean = a / total;
    // Algebraically equivalent to ab / ((a+b)^2 (a+b+1)), without ab underflow.
    return { mean, variance: mean * (b / total) / (total + 1) };
  }

  function posteriorParameters(a, b, successes, failures) {
    ({ a, b } = validateBeta(a, b));
    const counts = validateCounts(successes, failures);
    return validateBeta(a + counts.successes, b + counts.failures);
  }

  function stirlingCorrection(x) {
    const inverse = 1 / x, q = inverse * inverse;
    return inverse * (1 / 12 + q * (-1 / 360 + q * (1 / 1260 + q * (-1 / 1680
      + q * (1 / 1188 + q * (-691 / 360360 + q * (7 / 1092)))))));
  }

  function logBeta(a, b) {
    ({ a, b } = validateBeta(a, b));
    if (a === 1) return -Math.log(b);
    if (b === 1) return -Math.log(a);
    if (a > b) [a, b] = [b, a];
    let shift = 0;
    // B(a,b) = (a+b)/a * B(a+1,b), and the analogous identity for b.
    while (a < 8) { shift += Math.log(a + b) - Math.log(a); a++; }
    while (b < 8) { shift += Math.log(a + b) - Math.log(b); b++; }
    const total = a + b;
    // Combine Stirling terms as log ratios rather than subtracting three large
    // log-gamma values. For x>=8 the next correction term is below 9e-16;
    // floating-point rounding, especially at large shapes, is tested separately.
    return shift + 0.5 * Math.log(2 * Math.PI) - 0.5 * Math.log(total)
      + (a - 0.5) * Math.log(a / total) + (b - 0.5) * Math.log1p(-a / total)
      + stirlingCorrection(a) + stirlingCorrection(b) - stirlingCorrection(total);
  }

  function thetaValue(theta) {
    theta = number(theta, 'θ');
    if (theta < 0 || theta > 1) throw new RangeError('θ must be between 0 and 1.');
    return theta;
  }

  function logDensity(theta, a, b) {
    theta = thetaValue(theta); ({ a, b } = validateBeta(a, b));
    if (theta === 0) return a < 1 ? Infinity : a > 1 ? -Infinity : Math.log(b);
    if (theta === 1) return b < 1 ? Infinity : b > 1 ? -Infinity : Math.log(a);
    return (a - 1) * Math.log(theta) + (b - 1) * Math.log1p(-theta) - logBeta(a, b);
  }

  function density(theta, a, b) {
    const logarithm = logDensity(theta, a, b), value = Math.exp(logarithm);
    if (Number.isFinite(logarithm) && !Number.isFinite(value)) throw new RangeError('Finite density exceeds floating-point range; use logDensity instead.');
    return value;
  }

  function logLikelihood(theta, successes, failures) {
    theta = thetaValue(theta);
    ({ successes, failures } = validateCounts(successes, failures));
    // Omit theta-independent binomial coefficients; 0^0 is the empty factor 1.
    if (theta === 0) return successes === 0 ? 0 : -Infinity;
    if (theta === 1) return failures === 0 ? 0 : -Infinity;
    return successes * Math.log(theta) + failures * Math.log1p(-theta);
  }

  function likelihoodGrid(grid, successes, failures) {
    validateCounts(successes, failures);
    return grid.map(theta => ({ x: thetaValue(theta), y: Math.exp(logLikelihood(theta, successes, failures)) }));
  }

  function plottingGrid(shapes) {
    const points = new Set([plotMinimum, plotMaximum, 0.5]);
    for (let i = 1; i < 1000; i++) points.add(i / 1000);
    for (let i = 0; i <= 120; i++) {
      const x = plotMinimum * (0.5 / plotMinimum) ** (i / 120);
      points.add(x); points.add(1 - x);
    }
    for (const { a, b } of shapes) {
      const { mean, variance } = moments(a, b), sd = Math.sqrt(variance);
      points.add(mean);
      if (a > 1 && b > 1) points.add((a - 1) / (a + b - 2));
      for (let i = -80; i <= 80; i++) points.add(mean + i * sd / 10);
    }
    return [...points].filter(x => x >= plotMinimum && x <= plotMaximum).sort((x, y) => x - y);
  }

  function analyze(raw) {
    const p = validateParameters(raw);
    const posterior = posteriorParameters(p.a, p.b, p.successes, p.failures);
    const shapes = [{ a: p.a, b: p.b }, { a: p.successes + 1, b: p.failures + 1 }, posterior];
    const grid = plottingGrid(shapes);
    let underflowCount = 0;
    const curves = shapes.map(({ a, b }) => {
      const normalization = logBeta(a, b);
      return grid.map(x => {
        const logY = (a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) - normalization;
        const y = Math.exp(logY);
        if (!Number.isFinite(y)) throw new RangeError('An interior density exceeded the supported finite numerical range.');
        if (y === 0 && Number.isFinite(logY)) underflowCount++;
        return { x, y };
      });
    });
    return { parameters: p, posterior, priorMoments: moments(p.a, p.b),
      posteriorMoments: moments(posterior.a, posterior.b), sampleProportion: p.n === 0 ? null : p.successes / p.n,
      curves, underflowCount, boundaries: shapes.map(({ a, b }) => ({ atZero: density(0, a, b), atOne: density(1, a, b) })) };
  }

  return Object.freeze({ defaults, validateBeta, validateCounts, validateParameters, moments,
    posteriorParameters, logBeta, logDensity, density, logLikelihood, likelihoodGrid, plottingGrid, analyze });
})();

if (typeof document !== 'undefined' && document.getElementById('beta-form')) initializeBetaInferenceUI();

function initializeBetaInferenceUI() {
  const api = BetaBernoulliInference, byId = id => document.getElementById(id), form = byId('beta-form');
  let chart = null;
  const format = value => value === null ? 'Undefined: no observations (n = 0).' : value === Infinity
    ? '∞ (theoretical endpoint singularity)' : EventProbabilityCalculators.formatResult(value);

  function clear(message) {
    chart?.destroy(); chart = null;
    if (typeof Chart !== 'undefined' && Chart.getChart) Chart.getChart('beta-density-chart')?.destroy();
    for (const id of ['beta-data-results', 'beta-table-container', 'beta-boundary-results']) byId(id).replaceChildren();
    byId('beta-update-note').textContent = '';
    byId('beta-chart-warning').textContent = '';
    byId('beta-feedback').textContent = message;
  }

  function add(container, label, value) {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = value; container.append(dt, dd);
  }

  form.addEventListener('submit', event => {
    event.preventDefault(); clear('');
    try {
      const r = api.analyze({ a: byId('beta-a').value, b: byId('beta-b').value,
        successes: byId('beta-successes').value, failures: byId('beta-failures').value });
      const p = r.parameters;
      add(byId('beta-data-results'), 'Observed data', `s = ${p.successes}; f = ${p.failures}; n = ${p.n}.`);
      add(byId('beta-data-results'), 'Sample proportion s/n', format(r.sampleProportion));
      const table = document.createElement('table'); table.id = 'beta-table';
      table.createCaption().textContent = 'Theoretical moments of the parameter distributions';
      const header = table.createTHead().insertRow();
      for (const text of ['Quantity', 'Prior', 'Posterior']) {
        const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = text; header.append(cell);
      }
      const body = table.createTBody();
      for (const values of [
        ['Distribution', `Beta(${p.a}, ${p.b})`, `Beta(${r.posterior.a}, ${r.posterior.b})`],
        ['Mean', format(r.priorMoments.mean), format(r.posteriorMoments.mean)],
        ['Variance', format(r.priorMoments.variance), format(r.posteriorMoments.variance)]
      ]) {
        const row = body.insertRow();
        values.forEach((text, i) => {
          const cell = document.createElement(i ? 'td' : 'th');
          if (!i) cell.scope = 'row';
          else cell.dataset.label = i === 1 ? 'Prior' : 'Posterior';
          cell.textContent = text; row.append(cell);
        });
      }
      byId('beta-table-container').append(table);
      byId('beta-update-note').textContent = p.n === 0 ? 'With no observations, the posterior equals the prior; the likelihood is constant.'
        : `Adding ${p.successes} successes to a and ${p.failures} failures to b gives the posterior. `
          + `The prior weight in the posterior mean is ${format((p.a + p.b) / (p.a + p.b + p.n))}.`;
      ['Prior', 'Normalized likelihood', 'Posterior'].forEach((label, i) => add(byId('beta-boundary-results'),
        `${label} — exact endpoint densities`, `θ = 0: ${format(r.boundaries[i].atZero)}; θ = 1: ${format(r.boundaries[i].atOne)}.`));
      byId('beta-feedback').textContent = 'Posterior updated from the supplied prior and counts.'
        + (r.underflowCount ? ` ${r.underflowCount} very small interior density values underflowed to zero; no infinite endpoints were plotted.` : '');
      if (typeof Chart === 'undefined') {
        byId('beta-chart-warning').textContent = 'Chart.js is unavailable. The posterior, moments and endpoint results remain operational; update again when charts are available.';
        return;
      }
      try {
        chart = new Chart(byId('beta-density-chart'), { type: 'line', data: { datasets: r.curves.map((data, i) => ({
          label: ['Prior density', 'Normalized likelihood (shape only)', 'Posterior density'][i], data,
          borderColor: ['#174ea6', '#047857', '#c2410c'][i], borderWidth: 2, pointRadius: 0,
          borderDash: i === 1 ? [6, 4] : [], spanGaps: false
        })) }, options: { animation: false, responsive: true, maintainAspectRatio: false, parsing: false,
          scales: { x: { type: 'linear', min: 0, max: 1, title: { display: true, text: 'Bernoulli parameter θ' } },
            y: { min: 0, title: { display: true, text: 'Density (full-domain normalization)' } } },
          plugins: { legend: { labels: { boxWidth: 12, font: { size: 10 } } } }
        } });
      } catch {
        chart?.destroy(); chart = null;
        if (Chart.getChart) Chart.getChart('beta-density-chart')?.destroy();
        byId('beta-chart-warning').textContent = 'The density chart could not be rendered. Numerical results remain available.';
      }
    } catch (error) { clear(error.message); }
  });
  for (const event of ['input', 'change']) form.addEventListener(event, () => clear('Inputs changed. Update Posterior to compute new results.'));
  byId('reset-beta').addEventListener('click', () => { form.reset(); clear('Reset complete. No parameter posterior has been calculated.'); });
}

// Step 6 composes the verified Beta API; no density or update algorithm is repeated.
const BayesianSensitivityExperiments = (() => {
  const beta = BetaBernoulliInference;
  const scenarios = Object.freeze([
    { id: 'A', name: 'Uniform prior', a: 1, b: 1, successes: 8, failures: 2 },
    { id: 'B', name: 'Symmetric informative prior', a: 20, b: 20, successes: 8, failures: 2 },
    { id: 'C', name: 'Prior favoring success', a: 8, b: 2, successes: 8, failures: 2 },
    { id: 'D', name: 'More observations', a: 20, b: 20, successes: 80, failures: 20 }
  ].map(Object.freeze));
  const sampleSizes = Object.freeze([10, 50, 100, 500]);

  function getScenario(id) {
    const scenario = scenarios.find(s => s.id === id);
    if (!scenario) throw new RangeError('Select scenario A, B, C or D.');
    return scenario;
  }

  function updateSummary(input) {
    const parameters = beta.validateParameters(input);
    const posterior = beta.posteriorParameters(parameters.a, parameters.b, parameters.successes, parameters.failures);
    return { parameters, posterior, priorMoments: beta.moments(parameters.a, parameters.b),
      posteriorMoments: beta.moments(posterior.a, posterior.b),
      sampleProportion: parameters.n === 0 ? null : parameters.successes / parameters.n };
  }

  function scenarioResults() {
    return scenarios.map(s => ({ id: s.id, name: s.name, ...updateSummary(s) }));
  }

  function posteriorComparison(rows = scenarioResults()) {
    const sameData = ['A', 'B', 'C'].map(id => rows.find(r => r.id === id));
    const grid = beta.plottingGrid(sameData.map(r => r.posterior));
    return { grid, curves: sameData.map(r => ({ id: r.id, name: r.name,
      points: grid.map(x => ({ x, y: beta.density(x, r.posterior.a, r.posterior.b) })) })) };
  }

  function sampleSizeExperiment(a, b) {
    const prior = beta.validateParameters({ a, b, successes: 0, failures: 0 });
    return sampleSizes.map(n => {
      const row = updateSummary({ a: prior.a, b: prior.b, successes: 4 * (n / 5), failures: n / 5 });
      return { ...row, difference: row.posteriorMoments.mean - row.sampleProportion,
        priorWeight: (prior.a + prior.b) / (prior.a + prior.b + n) };
    });
  }

  return Object.freeze({ scenarios, sampleSizes, getScenario, updateSummary, scenarioResults,
    posteriorComparison, sampleSizeExperiment });
})();

if (typeof document !== 'undefined' && document.getElementById('bayes-growth-form')) initializeBayesianExperimentsUI();

function initializeBayesianExperimentsUI() {
  const api = BayesianSensitivityExperiments, byId = id => document.getElementById(id);
  const betaForm = byId('beta-form'), growthForm = byId('bayes-growth-form');
  const charts = new Map();
  let loadedScenario = null;
  const format = value => value === 0 ? '0' : Math.abs(value) < 0.001 ? value.toExponential(7) : value.toPrecision(8);
  const betaLabel = ({ a, b }) => `Beta(${a}, ${b})`;

  function destroy(id) {
    charts.get(id)?.destroy(); charts.delete(id);
    if (typeof Chart !== 'undefined' && Chart.getChart) Chart.getChart(id)?.destroy();
  }

  function custom(message = 'Custom — current parameters are not attributed to a preset.') {
    loadedScenario = null;
    byId('bayes-scenario-state').textContent = message;
  }

  function table(container, caption, headings, rows) {
    const t = document.createElement('table'); t.className = 'experiment-table';
    t.createCaption().textContent = caption;
    const head = t.createTHead().insertRow();
    for (const label of headings) {
      const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; head.append(cell);
    }
    const body = t.createTBody();
    for (const values of rows) {
      const row = body.insertRow();
      values.forEach((value, i) => {
        const cell = document.createElement(i ? 'td' : 'th');
        if (!i) cell.scope = 'row';
        else cell.dataset.label = headings[i];
        cell.textContent = value; row.append(cell);
      });
    }
    byId(container).replaceChildren(t);
  }

  function series(label, data, color, extra = {}) {
    return { label, data, borderColor: color, backgroundColor: color, pointRadius: 0, borderWidth: 2, ...extra };
  }

  function draw(id, datasets, xLabel, yLabel, warningId, bounded = false) {
    destroy(id);
    if (typeof Chart === 'undefined') {
      byId(warningId).textContent = 'Chart.js is unavailable. Calculated tables and numerical results remain operational; run again when charts are available.';
      return;
    }
    try {
      charts.set(id, new Chart(byId(id), { type: 'line', data: { datasets }, options: {
        responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
        scales: { x: { type: 'linear', title: { display: true, text: xLabel } },
          y: { min: 0, max: bounded ? 1 : undefined, title: { display: true, text: yLabel } } },
        plugins: { legend: { labels: { boxWidth: 12, font: { size: 10 } } } }
      } }));
    } catch {
      destroy(id);
      byId(warningId).textContent = 'A comparison chart could not be rendered. Calculated tables remain available; run again to retry.';
    }
  }

  function renderComparison() {
    byId('bayes-comparison-warning').textContent = '';
    const rows = api.scenarioResults();
    table('bayes-scenarios-table', 'Synthetic scenarios — derived Beta-Bernoulli results',
      ['Scenario', 'Prior a,b', 'Successes', 'Failures', 'Posterior', 'Prior mean', 'Posterior mean', 'Posterior variance', 's/n'],
      rows.map(r => [`${r.id} — ${r.name}`, betaLabel(r.parameters), r.parameters.successes, r.parameters.failures,
        betaLabel(r.posterior), format(r.priorMoments.mean), format(r.posteriorMoments.mean), format(r.posteriorMoments.variance), format(r.sampleProportion)]));
    const comparison = api.posteriorComparison(rows);
    draw('bayes-comparison-chart', comparison.curves.map((c, i) => series(`${c.id} — ${c.name}`, c.points,
      ['#174ea6', '#c2410c', '#047857'][i])), 'Bernoulli parameter θ', 'Posterior density', 'bayes-comparison-warning');
    byId('bayes-experiments-feedback').textContent = 'Comparison calculated: A, B and C use the same data; D uses more observations. All counts are synthetic.';
  }

  function clearGrowth(message) {
    for (const id of ['bayes-growth-mean-chart', 'bayes-growth-variance-chart']) destroy(id);
    byId('bayes-growth-table').replaceChildren();
    byId('bayes-growth-warning').textContent = '';
    byId('bayes-growth-summary').textContent = '';
    byId('bayes-growth-interpretation').textContent = '';
    byId('bayes-growth-feedback').textContent = message;
  }

  byId('compare-bayes-priors').addEventListener('click', renderComparison);
  byId('load-bayes-scenario').addEventListener('click', () => {
    try {
      const scenario = api.getScenario(byId('bayes-scenario').value);
      loadedScenario = scenario.id;
      for (const [id, key] of [['beta-a', 'a'], ['beta-b', 'b'], ['beta-successes', 'successes'], ['beta-failures', 'failures']]) byId(id).value = scenario[key];
      // Delegate calculation and the three-curve update to the Step 5 form.
      betaForm.requestSubmit();
      renderComparison();
    } catch (error) { byId('bayes-experiments-feedback').textContent = error.message; }
  });

  for (const event of ['input', 'change']) betaForm.addEventListener(event, () => custom('Custom — parameters edited. Update Posterior to calculate the current values.'));
  betaForm.addEventListener('submit', () => {
    if (!loadedScenario) { custom(); return; }
    const s = api.getScenario(loadedScenario);
    try {
      const p = BetaBernoulliInference.validateParameters({ a: byId('beta-a').value, b: byId('beta-b').value,
        successes: byId('beta-successes').value, failures: byId('beta-failures').value });
      if (['a', 'b', 'successes', 'failures'].some(key => p[key] !== s[key])) custom();
      else byId('bayes-scenario-state').textContent = `Scenario ${s.id} — ${s.name} (synthetic), loaded in the parameter calculator.`;
    } catch { custom('Custom — invalid parameters; no preset result is attributed to them.'); }
  });
  byId('reset-beta').addEventListener('click', () => custom('Custom — parameter calculator reset; no scenario is loaded.'));

  for (const event of ['input', 'change']) growthForm.addEventListener(event, () => clearGrowth('Prior changed. Run Sample-Size Experiment to calculate new results.'));
  growthForm.addEventListener('submit', event => {
    event.preventDefault(); clearGrowth('');
    try {
      const rows = api.sampleSizeExperiment(byId('bayes-growth-a').value, byId('bayes-growth-b').value);
      const prior = rows[0].parameters;
      byId('bayes-growth-summary').textContent = `Fixed prior: ${betaLabel(prior)}; synthetic observed proportion s/n = 0.8 at every n.`;
      table('bayes-growth-table', 'Fixed prior and synthetic data with constant proportion 0.8',
        ['n', 'Successes', 'Failures', 'Posterior', 'Posterior mean', 'Posterior variance', 'Mean − s/n', 'Prior weight'],
        rows.map(r => [r.parameters.n, r.parameters.successes, r.parameters.failures, betaLabel(r.posterior),
          format(r.posteriorMoments.mean), format(r.posteriorMoments.variance), format(r.difference), format(r.priorWeight)]));
      draw('bayes-growth-mean-chart', [series('Posterior mean', rows.map(r => ({ x: r.parameters.n, y: r.posteriorMoments.mean })), '#174ea6', { pointRadius: 4 }),
        series('Observed proportion 0.8', rows.map(r => ({ x: r.parameters.n, y: r.sampleProportion })), '#c2410c', { borderDash: [6, 4] })],
      'Number of observations n', 'Posterior mean', 'bayes-growth-warning', true);
      draw('bayes-growth-variance-chart', [series('Posterior variance', rows.map(r => ({ x: r.parameters.n, y: r.posteriorMoments.variance })), '#047857', { pointRadius: 4 })],
        'Number of observations n', 'Posterior variance', 'bayes-growth-warning');
      const decreasing = rows.every((r, i) => i === 0 || r.posteriorMoments.variance <= rows[i - 1].posteriorMoments.variance);
      byId('bayes-growth-interpretation').textContent = decreasing
        ? 'For this run the variance decreases across the displayed sample sizes. The posterior mean moves toward 0.8, or stays there if the prior mean is already 0.8. These are computed results for this fixed-prior experiment.'
        : 'The variance is not decreasing at every displayed sample size for this custom prior. The plotted values are unchanged. In this fixed-prior model, concentration is asymptotic; finite comparisons do not establish a universal monotonicity theorem.';
      byId('bayes-growth-feedback').textContent = 'Sample-size experiment calculated with the same fixed prior at every n.';
    } catch (error) { clearGrowth(error.message); }
  });

  byId('reset-bayes-experiments').addEventListener('click', () => {
    growthForm.reset(); clearGrowth('Reset complete. No sample-size experiment has been run.');
    destroy('bayes-comparison-chart'); byId('bayes-scenarios-table').replaceChildren();
    byId('bayes-comparison-warning').textContent = '';
    byId('bayes-experiments-feedback').textContent = 'Reset complete. Run a comparison or load a scenario.';
    byId('bayes-scenario').value = 'A'; byId('reset-beta').click();
  });
}
