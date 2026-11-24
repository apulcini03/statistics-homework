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
