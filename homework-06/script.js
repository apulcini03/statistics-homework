
// HW 5 - Riemann, Lebesgue & Normal CDF
// Statistics for Cybersecurity

// Exercise 1:
// - Function definitions and reference integrals
// - Riemann sums: left, right, midpoint
// - Lebesgue-inspired range discretization
// - Preimage-measure approximations
// - Accuracy, convergence and performance
// - Dirichlet and Thomae function analysis

// Exercise 2:
// - Standard normal PDF and CDF
// - Trapezoidal and Simpson integration
// - Error function power series
// - Numerically stable CDF evaluation
// - Reference-value comparisons
// - Accuracy and efficiency experiments

"use strict";

const RIEMANN_MAX_INTERVALS = 10000;
const RIEMANN_MAX_RECTANGLES = 200;
const RIEMANN_METHODS = {
  left: { label: "Left Riemann Sum", offset: 0 },
  right: { label: "Right Riemann Sum", offset: 1 },
  midpoint: { label: "Midpoint Riemann Sum", offset: 0.5 }
};

const RIEMANN_FUNCTIONS = {
  sin: { label: "sin(x)", a: 0, b: Math.PI, reference: 2, evaluate: Math.sin },
  square: { label: "x²", a: 0, b: 1, reference: 1 / 3, evaluate: x => x * x },
  step: {
    label: "1 if x < 0.5, else 3", a: 0, b: 1, reference: 2,
    evaluate: x => x < 0.5 ? 1 : 3, jump: 0.5
  },
  absolute: {
    label: "abs(x - 0.5)", a: 0, b: 1, reference: 0.25,
    evaluate: x => Math.abs(x - 0.5)
  },
  inverseSqrt: {
    label: "1/sqrt(x)", a: 0, b: 1, reference: 2,
    evaluate: x => {
      if (!(x > 0)) throw new RangeError("1/sqrt(x) requires x > 0.");
      return 1 / Math.sqrt(x);
    },
    firstPanelIntegral: (a, b) => 2 * (Math.sqrt(b) - Math.sqrt(a))
  },
  indicator: {
    label: "1 if x < 0.5, else 0", a: 0, b: 1, reference: 0.5,
    evaluate: x => x < 0.5 ? 1 : 0, jump: 0.5
  },
  sinc: {
    label: "sin(x)/x", a: 0, b: Math.PI, reference: 1.851937051982466,
    evaluate: x => x === 0 ? 1 : Math.sin(x) / x
  }
};

function validateRiemannIntervals(n) {
  if (!Number.isInteger(n) || n < 1 || n > RIEMANN_MAX_INTERVALS) {
    throw new RangeError("Enter an integer number of subintervals between 1 and 10000.");
  }
  return n;
}

function parseRiemannIntervals(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new RangeError("Enter an integer number of subintervals between 1 and 10000.");
  }
  return validateRiemannIntervals(Number(raw));
}

// Uniform partitions; an optional exact first panel avoids singular endpoints.
function riemannSum(evaluate, a, b, n, method, firstPanelIntegral = null) {
  validateRiemannIntervals(n);
  if (!Object.hasOwn(RIEMANN_METHODS, method)) {
    throw new RangeError("Select a supported Riemann method.");
  }
  if (typeof evaluate !== "function" || !Number.isFinite(a) ||
      !Number.isFinite(b) || !(b > a)) {
    throw new RangeError("A finite increasing interval and a function are required.");
  }

  const width = (b - a) / n;
  const offset = RIEMANN_METHODS[method].offset;
  const rectangles = [];
  let approximation = 0;
  let evaluations = 0;

  for (let i = 0; i < n; i++) {
    const left = a + i * width;
    const right = i === n - 1 ? b : a + (i + 1) * width;
    const corrected = i === 0 && firstPanelIntegral !== null;
    const sample = corrected ? null
      : offset === 1 ? right : left + offset * width;
    let area;
    let height;

    if (corrected) {
      area = firstPanelIntegral(left, right);
      height = area / width;
    } else {
      height = evaluate(sample);
      evaluations++;
      area = height * width;
    }
    if (!Number.isFinite(height) || !Number.isFinite(area)) {
      throw new RangeError("The selected quadrature produced a non-finite value.");
    }
    approximation += area;
    rectangles.push({ left, right, sample, height, corrected });
  }
  if (!Number.isFinite(approximation)) {
    throw new RangeError("The selected quadrature exceeded the numeric range.");
  }
  return { approximation, evaluations, rectangles, width, n, method, a, b };
}

function calculateRiemann(functionId, n, method) {
  if (!Object.hasOwn(RIEMANN_FUNCTIONS, functionId)) {
    throw new RangeError("Select a supported function.");
  }
  const definition = RIEMANN_FUNCTIONS[functionId];
  const result = riemannSum(definition.evaluate, definition.a, definition.b,
    n, method, definition.firstPanelIntegral);
  return {
    ...result, functionId, reference: definition.reference,
    absoluteError: Math.abs(result.approximation - definition.reference),
    improper: Boolean(definition.firstPanelIntegral)
  };
}

function displayedRiemannRectangles(rectangles) {
  const count = Math.min(rectangles.length, RIEMANN_MAX_RECTANGLES);
  return Array.from({ length: count }, (_, i) =>
    rectangles[count === 1 ? 0 : Math.floor(i * (rectangles.length - 1) / (count - 1))]);
}

function riemannCurvePoints(result) {
  const definition = RIEMANN_FUNCTIONS[result.functionId];
  const start = result.improper ? Math.min(result.width / 10, 0.001) : result.a;
  const points = Array.from({ length: 501 }, (_, i) => {
    const x = i === 500 ? result.b : start + i * (result.b - start) / 500;
    return { x, y: definition.evaluate(x) };
  });
  if (definition.jump !== undefined) {
    const jump = definition.jump;
    // Replace the ordinary sample at the jump with its two one-sided values.
    return points.filter(p => p.x !== jump)
      .concat([{ x: jump, y: definition.evaluate(jump - Number.EPSILON) },
        { x: jump, y: definition.evaluate(jump) }])
      .sort((p, q) => p.x - q.x);
  }
  return points;
}

function riemannRectanglesPlugin(rectangles) {
  return {
    id: "riemannRectangles",
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      ctx.save();
      ctx.beginPath();
      ctx.rect(chartArea.left, chartArea.top,
        chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
      ctx.clip();
      for (const rectangle of rectangles) {
        const x = scales.x.getPixelForValue(rectangle.left);
        const right = scales.x.getPixelForValue(rectangle.right);
        const y = scales.y.getPixelForValue(rectangle.height);
        const bottom = scales.y.getPixelForValue(0);
        ctx.fillStyle = rectangle.corrected ? "rgba(245,158,11,0.3)" : "rgba(37,99,235,0.18)";
        ctx.strokeStyle = rectangle.corrected ? "#d97706" : "#2563eb";
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, right - x, bottom - y);
        ctx.strokeRect(x, y, right - x, bottom - y);
      }
      ctx.restore();
    }
  };
}

let riemannChartInstance = null;

function drawRiemannChart(result) {
  const definition = RIEMANN_FUNCTIONS[result.functionId];
  const rectangles = displayedRiemannRectangles(result.rectangles);
  const curve = riemannCurvePoints(result);
  if (riemannChartInstance) riemannChartInstance.destroy();
  riemannChartInstance = new Chart(document.getElementById("riemannChart"), {
    type: "line",
    data: { datasets: [
      {
        label: definition.label, data: curve,
        borderColor: "#16803c", borderWidth: 2, pointRadius: 0, tension: 0
      },
      {
        type: "scatter", label: "Sample points",
        data: rectangles.filter(r => !r.corrected).map(r => ({ x: r.sample, y: r.height })),
        backgroundColor: "#2563eb", pointRadius: result.n > 200 ? 1 : 3
      }
    ] },
    plugins: [riemannRectanglesPlugin(rectangles)],
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
      plugins: { title: { display: true, text: result.improper
        ? ["Improper quadrature", RIEMANN_METHODS[result.method].label,
          "Exact first-panel correction"]
        : RIEMANN_METHODS[result.method].label } },
      scales: {
        x: { type: "linear", min: result.a, max: result.b,
          title: { display: true, text: "x" } },
        y: { beginAtZero: true, suggestedMax: Math.max(...rectangles.map(r => r.height)),
          title: { display: true, text: "Function value / rectangle height" } }
      }
    }
  });
  return { displayed: rectangles.length, curveStart: curve[0].x };
}

document.addEventListener("DOMContentLoaded", () => {
  const summary = document.getElementById("riemannResults");
  const note = document.getElementById("riemannPlotNote");
  const button = document.getElementById("calculateRiemannBtn");
  button.addEventListener("click", () => {
    try {
      const n = parseRiemannIntervals(document.getElementById("riemannIntervals").value);
      const result = calculateRiemann(document.getElementById("riemannFunction").value,
        n, document.getElementById("riemannMethod").value);
      const definition = RIEMANN_FUNCTIONS[result.functionId];
      summary.textContent =
        `Function: ${definition.label}\n` +
        `Method: ${RIEMANN_METHODS[result.method].label}` +
        (result.improper ? " + exact first-panel correction (adapted quadrature)" : "") + "\n" +
        `Subintervals: ${result.n}\n` +
        `Approximation: ${result.approximation.toPrecision(12)}\n` +
        `Reference integral: ${result.reference.toPrecision(12)}\n` +
        `Absolute error: ${result.absoluteError.toPrecision(6)}\n` +
        `Quadrature function evaluations: ${result.evaluations} (plot samples excluded)`;
      if (typeof Chart !== "function") {
        note.textContent = "Plot unavailable: Chart.js could not be loaded.";
        return;
      }
      const plot = drawRiemannChart(result);
      note.textContent = result.n > plot.displayed
        ? `Simplified visualization: ${plot.displayed} of ${result.n} actual rectangles shown; ` +
          `all ${result.n} subintervals are used in the calculation.`
        : `All ${result.n} rectangles shown.`;
      if (result.improper) {
        note.textContent += " Improper integral: the first subinterval is integrated exactly; " +
          "the selected rule applies only to the remaining intervals. " +
          "The orange rectangle shows the first interval's average height, not a sample at zero. " +
          `The function curve starts at x = ${plot.curveStart.toPrecision(4)}; x = 0 is omitted.`;
      }
    } catch (error) {
      summary.textContent = error.message;
      note.textContent = riemannChartInstance ? "Plot from the last successful calculation retained." : "";
    }
  });
});

// Step 3/8 - Histogram-based, Lebesgue-inspired approximation.
// Both simulators share the existing function definitions and reference values.
const INTEGRATION_FUNCTIONS = RIEMANN_FUNCTIONS;
const LEBESGUE_MAX_LEVELS = 10000;
const LEBESGUE_MAX_SAMPLES = 100000;
const LEBESGUE_MAX_BARS = 200;
const LEBESGUE_DELTA = 0.01;
const LEBESGUE_METHODS = {
  lower: "Lower Simple-Function Approximation",
  upper: "Upper Simple-Function Approximation",
  midpoint: "Mid-Level Approximation"
};

function validateLebesgueResolution(K, M) {
  if (!Number.isInteger(K) || K < 1 || K > LEBESGUE_MAX_LEVELS) {
    throw new RangeError("Enter an integer K between 1 and 10000.");
  }
  if (!Number.isInteger(M) || M < 1 || M > LEBESGUE_MAX_SAMPLES) {
    throw new RangeError("Enter an integer M between 1 and 100000.");
  }
}

function parseLebesgueResolution(rawK, rawM) {
  if (typeof rawK !== "string" || rawK.trim() === "") {
    throw new RangeError("Enter an integer K between 1 and 10000.");
  }
  if (typeof rawM !== "string" || rawM.trim() === "") {
    throw new RangeError("Enter an integer M between 1 and 100000.");
  }
  const K = Number(rawK);
  const M = Number(rawM);
  validateLebesgueResolution(K, M);
  return { K, M };
}

// Two linear passes over stored midpoint values; no resampling per level.
function lebesgueLevelEstimates(evaluate, a, b, K, M) {
  validateLebesgueResolution(K, M);
  const length = b - a;
  const cellWidth = length / M;
  if (typeof evaluate !== "function" || !Number.isFinite(a) ||
      !Number.isFinite(b) || !Number.isFinite(length) || !(cellWidth > 0)) {
    throw new RangeError("A finite increasing interval and a function are required.");
  }

  const samples = new Float64Array(M);
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let i = 0; i < M; i++) {
    const x = a + (i + 0.5) * cellWidth;
    const value = evaluate(x);
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError("Level approximation requires finite, non-negative function values.");
    }
    samples[i] = value;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }

  const span = maximum - minimum;
  const levelCount = span === 0 ? 1 : K;
  const counts = new Uint32Array(levelCount);
  // Observed extrema protect the sample-wise ordering against rounding at edges.
  const observedMinimum = new Float64Array(levelCount).fill(Infinity);
  const observedMaximum = new Float64Array(levelCount).fill(-Infinity);
  for (const value of samples) {
    let index = span === 0 ? 0 : Math.min(levelCount - 1,
      Math.max(0, Math.floor(((value - minimum) / span) * levelCount)));
    // Resolve an adjacent-bin rounding error using the actual computed edges.
    if (index > 0 && value < minimum + span * (index / levelCount)) {
      index--;
    } else if (index < levelCount - 1 &&
        value >= minimum + span * ((index + 1) / levelCount)) {
      index++;
    }
    counts[index]++;
    observedMinimum[index] = Math.min(observedMinimum[index], value);
    observedMaximum[index] = Math.max(observedMaximum[index], value);
  }

  const estimates = { lower: 0, upper: 0, midpoint: 0 };
  let measureSum = 0;
  const levels = Array.from({ length: levelCount }, (_, index) => {
    let lower = minimum + span * (index / levelCount);
    let upper = index === levelCount - 1 ? maximum
      : minimum + span * ((index + 1) / levelCount);
    if (counts[index] > 0) {
      lower = Math.min(lower, observedMinimum[index]);
      upper = Math.max(upper, observedMaximum[index]);
    }
    const midpoint = lower + (upper - lower) / 2;
    const measure = (counts[index] / M) * length;
    const contributions = {
      lower: lower * measure, upper: upper * measure, midpoint: midpoint * measure
    };
    for (const method of Object.keys(estimates)) estimates[method] += contributions[method];
    measureSum += measure;
    return { index, lower, upper, midpoint, count: counts[index], measure, contributions };
  });
  if (![measureSum, ...Object.values(estimates)].every(Number.isFinite)) {
    throw new RangeError("Level approximation exceeded the numeric range.");
  }
  return {
    requestedK: K, K: levelCount, M, a, b, domainLength: length,
    minimum, maximum, levels, estimates, measureSum, evaluations: M
  };
}

function calculateLebesgue(functionId, K, M, method) {
  if (!Object.hasOwn(INTEGRATION_FUNCTIONS, functionId)) {
    throw new RangeError("Select a supported function.");
  }
  if (!Object.hasOwn(LEBESGUE_METHODS, method)) {
    throw new RangeError("Select a supported level approximation.");
  }
  const definition = INTEGRATION_FUNCTIONS[functionId];
  const improper = Boolean(definition.firstPanelIntegral);
  const sampleA = improper ? LEBESGUE_DELTA : definition.a;
  const analyticContribution = improper
    ? definition.firstPanelIntegral(definition.a, sampleA) : 0;
  const result = lebesgueLevelEstimates(definition.evaluate, sampleA, definition.b, K, M);
  const estimates = Object.fromEntries(Object.entries(result.estimates)
    .map(([name, value]) => [name, value + analyticContribution]));
  const approximation = estimates[method];
  if (!Number.isFinite(approximation)) {
    throw new RangeError("Level approximation exceeded the numeric range.");
  }
  return {
    ...result, functionId, method, improper, analyticContribution,
    analyticDomainLength: sampleA - definition.a,
    originalA: definition.a, originalB: definition.b,
    approximation, numericalContribution: result.estimates[method],
    totalEstimates: estimates, reference: definition.reference,
    absoluteError: Math.abs(approximation - definition.reference),
    accountedMeasure: result.measureSum + sampleA - definition.a
  };
}

// Group contiguous levels only for rendering; preserve their measures/contributions.
function displayedLebesgueLevels(levels, method) {
  const size = Math.ceil(levels.length / LEBESGUE_MAX_BARS);
  const groups = [];
  for (let i = 0; i < levels.length; i += size) {
    const end = Math.min(i + size, levels.length);
    let measure = 0;
    let contribution = 0;
    let count = 0;
    for (let j = i; j < end; j++) {
      measure += levels[j].measure;
      contribution += levels[j].contributions[method];
      count += levels[j].count;
    }
    groups.push({ lower: levels[i].lower, upper: levels[end - 1].upper,
      first: i, last: end - 1, measure, contribution, count });
  }
  return groups;
}

const lebesgueChartInstances = { measures: null, contributions: null };

function drawLebesgueCharts(result) {
  const groups = displayedLebesgueLevels(result.levels, result.method);
  const labels = groups.map(group =>
    `${group.lower.toPrecision(4)}–${group.upper.toPrecision(4)}`);
  const configurations = [
    { key: "measures", canvas: "lebesgueMeasuresChart", field: "measure",
      label: "Estimated measure", color: "#2563eb", title: "Estimated preimage measures" },
    { key: "contributions", canvas: "lebesgueContributionsChart", field: "contribution",
      label: "Level contribution", color: "#f59e0b", title: "Level contributions" }
  ];
  for (const config of configurations) {
    if (lebesgueChartInstances[config.key]) lebesgueChartInstances[config.key].destroy();
    lebesgueChartInstances[config.key] = new Chart(document.getElementById(config.canvas), {
      type: "bar",
      data: { labels, datasets: [{ label: config.label,
        data: groups.map(group => group[config.field]), backgroundColor: config.color }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
          title: { display: true, text: [config.title,
            result.method === "midpoint" ? "Mid-Level" : result.method === "lower" ? "Lower" : "Upper"] },
          legend: { display: false },
          tooltip: { callbacks: {
            title: items => `Value range: ${labels[items[0].dataIndex]}`,
            afterLabel: item => {
              const group = groups[item.dataIndex];
              return [`Levels: ${group.first + 1}–${group.last + 1}`,
                `Samples: ${group.count}`, `Estimated measure: ${group.measure.toPrecision(6)}`,
                `Contribution: ${group.contribution.toPrecision(6)}`];
            }
          } }
        },
        scales: {
          x: { title: { display: true, text: "Function-value range" },
            ticks: { maxTicksLimit: 5, maxRotation: 0 } },
          y: { beginAtZero: true, title: { display: true, text: config.label } }
        }
      }
    });
  }
  return groups.length;
}

function integrationEndpoint(value) {
  return value === Math.PI ? "π" : String(value);
}

document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("lebesgueFunction");
  for (const [id, definition] of Object.entries(INTEGRATION_FUNCTIONS)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = `${definition.label} on ${definition.firstPanelIntegral ? "(" : "["}` +
      `${integrationEndpoint(definition.a)}, ${integrationEndpoint(definition.b)}]`;
    select.appendChild(option);
  }
  const summary = document.getElementById("lebesgueResults");
  const note = document.getElementById("lebesguePlotNote");
  document.getElementById("calculateLebesgueBtn").addEventListener("click", () => {
    try {
      const { K, M } = parseLebesgueResolution(document.getElementById("lebesgueLevels").value,
        document.getElementById("lebesgueSamples").value);
      const result = calculateLebesgue(select.value, K, M,
        document.getElementById("lebesgueMethod").value);
      const definition = INTEGRATION_FUNCTIONS[result.functionId];
      summary.textContent =
        `Function: ${definition.label}\n` +
        `Domain: ${result.improper ? "(" : "["}${integrationEndpoint(result.originalA)}, ` +
        `${integrationEndpoint(result.originalB)}]\n` +
        `Method: ${LEBESGUE_METHODS[result.method]}${result.improper ? " (hybrid)" : ""}\n` +
        `Requested levels K: ${result.requestedK}\nLevels used: ${result.K}\n` +
        `Domain midpoint samples M: ${result.M}\n` +
        `Sampled value range: [${result.minimum.toPrecision(8)}, ${result.maximum.toPrecision(8)}]\n` +
        `Approximation: ${result.approximation.toPrecision(12)}\n` +
        `Reference integral: ${result.reference.toPrecision(12)}\n` +
        `Absolute error: ${result.absoluteError.toPrecision(6)}\n` +
        `Sum of estimated preimage measures: ${result.measureSum.toPrecision(12)}\n` +
        `Sampled domain length: ${result.domainLength.toPrecision(12)}\n` +
        `Function evaluations: ${result.evaluations}\n`;
      if (result.K !== result.requestedK) {
        summary.textContent += "Degenerate sampled range: one effective level.\n";
      }
      if (result.improper) {
        summary.textContent += `Analytic interval: (0, ${LEBESGUE_DELTA}]\n` +
          `Analytic contribution: ${result.analyticContribution.toPrecision(12)}\n` +
          `Level-discretized interval: [${result.a}, ${result.b}]\n` +
          `Numerical contribution: ${result.numericalContribution.toPrecision(12)}\n` +
          `Total accounted domain measure: ${result.accountedMeasure.toPrecision(12)}\n`;
      }
      summary.textContent += "Lower/upper refer to sampled values and estimated preimage measures; " +
        "they are not rigorous bounds on the exact integral.";
      if (typeof Chart !== "function") {
        note.textContent = "Plots unavailable: Chart.js could not be loaded.";
        return;
      }
      const bars = drawLebesgueCharts(result);
      note.textContent = bars < result.K
        ? `Grouped visualization: ${bars} bars for ${result.K} levels. All levels and all ` +
          `${result.M} samples are used; grouped measures and contributions are summed.`
        : `All ${result.K} effective levels shown; ${result.M} domain samples used.`;
      if (result.improper) {
        note.textContent += ` Charts show only [${result.a}, ${result.b}]; ` +
          "the analytic contribution is reported separately and is not part of the level histograms.";
      }
    } catch (error) {
      summary.textContent = error.message;
      note.textContent = Object.values(lebesgueChartInstances).some(Boolean)
        ? "Plots from the last successful calculation retained." : "";
    }
  });
});

// Step 4/8 - Comparisons and explicitly constructed pathological examples.
const COMPARISON_METHODS = [
  { id: "r-left", family: "riemann", method: "left", label: "Riemann Left", color: "#2563eb" },
  { id: "r-right", family: "riemann", method: "right", label: "Riemann Right", color: "#0891b2" },
  { id: "r-mid", family: "riemann", method: "midpoint", label: "Riemann Midpoint", color: "#16803c" },
  { id: "l-lower", family: "lebesgue", method: "lower", label: "Lebesgue Lower", color: "#d97706" },
  { id: "l-upper", family: "lebesgue", method: "upper", label: "Lebesgue Upper", color: "#dc2626" },
  { id: "l-mid", family: "lebesgue", method: "midpoint", label: "Lebesgue Mid-Level", color: "#9333ea" }
];
const COMPARISON_RESOLUTIONS = [10, 20, 50, 100, 200, 500, 1000]
  .map(n => ({ n, K: n, M: n * 20 }));
const PATHOLOGY_MAX_POINTS = 1000;

function step4Integer(raw, minimum, maximum, label) {
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if ((typeof raw === "string" && raw.trim() === "") ||
      !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`Enter an integer ${label} between ${minimum} and ${maximum}.`);
  }
  return value;
}

function comparisonClock() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now() : null;
}

function benchmarkIntegration(run, repeats, now = comparisonClock) {
  repeats = step4Integer(repeats, 3, 9, "repetition count");
  run(); // Unmeasured warm-up. Only the integration call is inside each timed interval.
  let result;
  const times = [];
  for (let i = 0; i < repeats; i++) {
    const start = now();
    result = run();
    const end = now();
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) times.push(end - start);
  }
  times.sort((a, b) => a - b);
  const middle = Math.floor(times.length / 2);
  const timingComplete = times.length === repeats;
  const median = !timingComplete ? null : times.length % 2
    ? times[middle] : (times[middle - 1] + times[middle]) / 2;
  return { result, repeats, warmups: 1, medianMs: median,
    minimumMs: timingComplete ? times[0] : null,
    maximumMs: timingComplete ? times[times.length - 1] : null };
}

function comparisonRunner(functionId, parameters, descriptor) {
  return descriptor.family === "riemann"
    ? () => calculateRiemann(functionId, parameters.n, descriptor.method)
    : () => calculateLebesgue(functionId, parameters.K, parameters.M, descriptor.method);
}

function comparisonMetrics(result, descriptor, parameters) {
  const riemann = descriptor.family === "riemann";
  const analyticContribution = riemann
    ? result.improper ? result.rectangles[0].height * result.width : 0
    : result.analyticContribution;
  return {
    id: descriptor.id, label: descriptor.label, family: descriptor.family,
    approximation: result.approximation, reference: result.reference,
    absoluteError: result.absoluteError, evaluations: result.evaluations,
    n: riemann ? result.n : null, K: riemann ? null : result.K,
    requestedK: riemann ? null : parameters.K, M: riemann ? null : result.M,
    improper: result.improper, analyticContribution,
    analyticEnd: result.improper ? riemann ? result.a + result.width : result.a : null,
    timeComplexity: riemann ? "O(n)" : "O(M+K)",
    spaceComplexity: riemann ? "O(n)" : "O(M+K)"
  };
}

function validateComparison(functionId, parameters) {
  if (!Object.hasOwn(INTEGRATION_FUNCTIONS, functionId)) throw new RangeError("Select a supported function.");
  validateRiemannIntervals(parameters.n);
  validateLebesgueResolution(parameters.K, parameters.M);
}

function compareIntegrationMethods(functionId, n, K, M, repeats = 5, now = comparisonClock) {
  const parameters = { n, K, M };
  validateComparison(functionId, parameters);
  repeats = step4Integer(repeats, 3, 9, "repetition count");
  return COMPARISON_METHODS.map(descriptor => {
    const benchmark = benchmarkIntegration(comparisonRunner(functionId, parameters, descriptor), repeats, now);
    const row = comparisonMetrics(benchmark.result, descriptor, parameters);
    return { ...row, repeats, warmups: benchmark.warmups, medianMs: benchmark.medianMs,
      minimumMs: benchmark.minimumMs, maximumMs: benchmark.maximumMs,
      benchmarkEvaluations: row.evaluations * (repeats + benchmark.warmups) };
  });
}

function runIntegrationConvergence(functionId) {
  return COMPARISON_RESOLUTIONS.map((parameters, index) => {
    validateComparison(functionId, parameters);
    return { stage: index + 1, ...parameters, rows: COMPARISON_METHODS.map(descriptor =>
      comparisonMetrics(comparisonRunner(functionId, parameters, descriptor)(), descriptor, parameters)) };
  });
}

function convergenceLogData(configurations, costAxis = false) {
  let smallestPositive = Infinity;
  for (const config of configurations) for (const row of config.rows) {
    if (!Number.isFinite(row.absoluteError) || row.absoluteError < 0) throw new RangeError("Invalid absolute error.");
    if (row.absoluteError > 0) smallestPositive = Math.min(smallestPositive, row.absoluteError);
  }
  const floor = Math.max(Number.MIN_VALUE, Math.min(1e-16, smallestPositive / 10));
  return { floor, datasets: COMPARISON_METHODS.map(descriptor => ({
    label: descriptor.label, borderColor: descriptor.color, backgroundColor: descriptor.color,
    tension: 0, pointRadius: 3,
    pointStyle: context => context.raw?.actualError === 0 ? "triangle" : "circle",
    data: configurations.map(config => {
      const row = config.rows.find(candidate => candidate.id === descriptor.id);
      return { x: costAxis ? row.evaluations : config.stage,
        y: row.absoluteError === 0 ? floor : row.absoluteError,
        actualError: row.absoluteError, evaluations: row.evaluations,
        n: config.n, K: config.K, M: config.M };
    })
  })) };
}

function exactNonnegativeInteger(value, label) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an exact non-negative integer; use decimal text for large values.`);
  }
  if (!["string", "number", "bigint"].includes(typeof value)) throw new RangeError(`Invalid ${label}.`);
  const text = String(value).trim();
  if (text.length === 0 || text.length > 100 || /[^0-9]/.test(text)) {
    throw new RangeError(`${label} must contain 1–100 decimal digits.`);
  }
  return BigInt(text);
}

function exactGcd(a, b) {
  if (typeof a !== "bigint" || typeof b !== "bigint" || a < 0n || b < 0n) {
    throw new RangeError("GCD requires non-negative exact integers.");
  }
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function reduceExactFraction(numerator, denominator) {
  const p = exactNonnegativeInteger(numerator, "Numerator");
  const q = exactNonnegativeInteger(denominator, "Denominator");
  if (q === 0n || p > q) throw new RangeError("Require denominator > 0 and 0 ≤ numerator ≤ denominator.");
  const divisor = exactGcd(p, q);
  return { numerator: p / divisor, denominator: q / divisor };
}

function thomaeRational(numerator, denominator) {
  const fraction = reduceExactFraction(numerator, denominator);
  return { numerator: String(fraction.numerator), denominator: String(fraction.denominator),
    x: Number(fraction.numerator) / Number(fraction.denominator), value: 1 / Number(fraction.denominator) };
}

function constructedIrrationalTag(index, n) {
  return { x: (index + Math.SQRT2 / 2) / n, kind: "irrational",
    index, n, tag: `(${index} + √2/2)/${n}` };
}

function runDirichletExperiment(n, sampling = "both") {
  n = step4Integer(n, 1, 1000, "Dirichlet n");
  if (!["both", "rational", "irrational"].includes(sampling)) throw new RangeError("Select a constructed sampling mode.");
  const rational = [];
  const irrational = [];
  for (let i = 0; i < n; i++) {
    if (sampling !== "irrational") {
      const fraction = reduceExactFraction(BigInt(2 * i + 1), BigInt(2 * n));
      const p = String(fraction.numerator), q = String(fraction.denominator);
      rational.push({ x: Number(p) / Number(q), y: 1, kind: "rational", numerator: p, denominator: q, tag: `${p}/${q}` });
    }
    if (sampling !== "rational") {
      // The symbolic construction is irrational; Number is used only for plotting.
      irrational.push({ ...constructedIrrationalTag(i, n), y: 0 });
    }
  }
  return { n, sampling, rational, irrational,
    rationalTagSum: rational.length ? rational.reduce((sum, point) => sum + point.y, 0) / n : null,
    irrationalTagSum: irrational.length ? irrational.reduce((sum, point) => sum + point.y, 0) / n : null,
    darbouxLower: 0, darbouxUpper: 1, lebesgueIntegral: 0, riemannIntegral: null };
}

function thomaeTaggedSum(n, method = "midpoint") {
  n = step4Integer(n, 1, 2000, "Thomae n");
  if (!Object.hasOwn(RIEMANN_METHODS, method)) throw new RangeError("Select a rational-tag method.");
  let total = 0;
  for (let i = 0; i < n; i++) {
    const p = method === "midpoint" ? 2 * i + 1 : method === "right" ? i + 1 : i;
    const q = method === "midpoint" ? 2 * n : n;
    total += thomaeRational(BigInt(p), BigInt(q)).value;
  }
  return total / n;
}

function runThomaeExperiment(Q, n, method, numerator, denominator) {
  Q = step4Integer(Q, 1, 200, "maximum denominator Q");
  n = step4Integer(n, 1, 2000, "Thomae n");
  const selected = thomaeRational(numerator, denominator);
  const taggedSum = thomaeTaggedSum(n, method);
  const points = [];
  for (let q = 1; q <= Q; q++) for (let p = 0; p <= q; p++) {
    const point = thomaeRational(BigInt(p), BigInt(q));
    if (point.denominator === String(q)) points.push({ ...point, y: point.value, tag: `${point.numerator}/${point.denominator}` });
  }
  points.sort((a, b) => a.x - b.x);
  const denominators = Array.from({ length: Q }, (_, i) => ({ x: i + 1, y: thomaeRational(1n, BigInt(i + 1)).value }));
  return { Q, n, method, selected, taggedSum, points, denominators,
    irrational: { ...constructedIrrationalTag(0, 1), y: 0 },
    riemannIntegral: 0, lebesgueIntegral: 0, endpointZero: thomaeRational(0n, 1n).value,
    endpointOne: thomaeRational(1n, 1n).value };
}

function displayedPathologicalPoints(points, limit = PATHOLOGY_MAX_POINTS) {
  const count = Math.min(points.length, limit);
  return Array.from({ length: count }, (_, i) => points[count === 1 ? 0
    : Math.floor(i * (points.length - 1) / (count - 1))]);
}

const step4Charts = { resolution: null, cost: null, dirichlet: null, thomae: null, denominators: null };
function replaceStep4Chart(key, canvas, configuration) {
  if (step4Charts[key]) step4Charts[key].destroy();
  step4Charts[key] = new Chart(document.getElementById(canvas), configuration);
}

function drawIntegrationConvergence(configurations) {
  for (const [key, canvas, costAxis] of [["resolution", "convergenceResolutionChart", false], ["cost", "convergenceCostChart", true]]) {
    const plot = convergenceLogData(configurations, costAxis);
    replaceStep4Chart(key, canvas, { type: "line", data: { datasets: plot.datasets }, options: {
      responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
      plugins: { title: { display: true, text: costAxis ? "Error by evaluation cost" : "Error by resolution" },
        legend: { labels: { boxWidth: 10, font: { size: 10 } } },
        tooltip: { callbacks: { label: item => {
          const p = item.raw;
          return [`${item.dataset.label}: error ${p.actualError === 0 ? "0 (triangle at display floor)" : p.actualError.toPrecision(6)}`,
            `n=${p.n}; K=${p.K}; M=${p.M}; evaluations=${p.evaluations}`];
        } } } },
      scales: { x: { type: "linear", min: costAxis ? 0 : 1,
        max: costAxis ? undefined : configurations.length,
        title: { display: true, text: costAxis ? "Function evaluations / run" : "Resolution configuration (see list)" },
        ticks: { maxTicksLimit: 4, precision: 0, stepSize: costAxis ? undefined : 1 } },
      y: { type: "logarithmic", min: plot.floor,
        ticks: { maxTicksLimit: 5, callback: value => Number(value).toExponential(0) },
        title: { display: true, text: "Absolute error (log scale)" } } }
    } });
  }
}

function drawDirichletExperiment(result) {
  const datasets = [[result.rational, "Constructed rational", "#2563eb"],
    [result.irrational, "Constructed irrational", "#d97706"]]
    .filter(([points]) => points.length).map(([points, label, color]) => ({
      label, data: displayedPathologicalPoints(points, 200), backgroundColor: color, pointRadius: 3
    }));
  replaceStep4Chart("dirichlet", "dirichletChart", { type: "scatter", data: { datasets }, options: {
    responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
    plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } },
      tooltip: { callbacks: { label: item => `${item.raw.tag}: D = ${item.raw.y}` } } },
    scales: { x: { type: "linear", min: 0, max: 1, title: { display: true, text: "Constructed tag (plotted coordinate)" } },
      y: { min: -0.1, max: 1.1, title: { display: true, text: "Dirichlet value" } } }
  } });
}

function drawThomaeExperiment(result) {
  const displayed = displayedPathologicalPoints(result.points);
  replaceStep4Chart("thomae", "thomaePointsChart", { type: "scatter", data: { datasets: [
    { label: "Reduced rationals", data: displayed, backgroundColor: "#2563eb", pointRadius: 2 },
    { label: "Selected rational", data: [{ ...result.selected, y: result.selected.value,
      tag: `${result.selected.numerator}/${result.selected.denominator}` }], backgroundColor: "#d97706", pointRadius: 5 },
    { label: "Constructed irrational", data: [result.irrational], backgroundColor: "#16803c", pointRadius: 4 }
  ] }, options: { responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
    plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: {
      label: item => `${item.raw.tag}: T = ${item.raw.y.toPrecision(6)}` } } },
    scales: { x: { type: "linear", min: 0, max: 1, title: { display: true, text: "Rational p/q (plotted coordinate)" } },
      y: { min: 0, max: 1.05, title: { display: true, text: "Thomae value" } } }
  } });
  replaceStep4Chart("denominators", "thomaeDenominatorsChart", { type: "line",
    data: { datasets: [{ label: "Height 1/q", data: result.denominators, borderColor: "#16803c", pointRadius: 2, tension: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
      scales: { x: { type: "linear", min: 1, title: { display: true, text: "Reduced denominator q" }, ticks: { precision: 0 } },
        y: { beginAtZero: true, title: { display: true, text: "Thomae value 1/q" } } } }
  });
  return displayed.length;
}

function comparisonTimeText(value) {
  return value === null ? "unavailable" : value === 0 ? "below timer resolution" : value.toFixed(4);
}

function appendComparisonRows(rows) {
  const body = document.getElementById("comparisonTableBody");
  body.replaceChildren();
  for (const row of rows) {
    const parameters = row.family === "riemann" ? `n=${row.n}` : `K=${row.K} (requested ${row.requestedK}); M=${row.M}`;
    const values = [row.label, row.approximation.toPrecision(12), row.reference.toPrecision(12),
      row.absoluteError.toPrecision(6), row.evaluations, parameters, comparisonTimeText(row.medianMs),
      `${comparisonTimeText(row.minimumMs)} – ${comparisonTimeText(row.maximumMs)}`,
      `${row.timeComplexity} / ${row.spaceComplexity}`, row.benchmarkEvaluations,
      row.improper ? `${row.analyticContribution.toPrecision(8)} on (0, ${row.analyticEnd}]` : "none"];
    const tr = document.createElement("tr");
    for (const value of values) { const td = document.createElement("td"); td.textContent = value; tr.appendChild(td); }
    body.appendChild(tr);
  }
}

function step4PlotAvailable(summary) {
  if (typeof Chart === "function") return true;
  summary.textContent += "\nPlots unavailable: Chart.js could not be loaded.";
  return false;
}

document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("comparisonFunction");
  for (const [id, definition] of Object.entries(INTEGRATION_FUNCTIONS)) {
    const option = document.createElement("option"); option.value = id; option.textContent = definition.label;
    select.appendChild(option);
  }
  const comparisonSummary = document.getElementById("comparisonSummary");
  document.getElementById("runComparisonBtn").addEventListener("click", () => {
    try {
      const n = parseRiemannIntervals(document.getElementById("comparisonIntervals").value);
      const { K, M } = parseLebesgueResolution(document.getElementById("comparisonLevels").value,
        document.getElementById("comparisonSamples").value);
      const repeats = step4Integer(document.getElementById("comparisonRepeats").value, 3, 9, "repetition count");
      const rows = compareIntegrationMethods(select.value, n, K, M, repeats);
      appendComparisonRows(rows);
      comparisonSummary.textContent = `Function: ${INTEGRATION_FUNCTIONS[select.value].label}\n` +
        `n=${n}; K=${K}; M=${M}. Costs are per standalone method call; K is not a domain-sample count.\n` +
        `One warm-up and ${repeats} measured runs per method. Median/min/max time the algorithm only, including its result arrays. Rendering is excluded.\n` +
        "Zero timings are below timer resolution. Browser timing and allocation/GC noise are not universal speed rankings.\n" +
        "Lebesgue lower/upper use estimated preimage measures, not rigorous integral bounds.";
      if (rows[0].improper) comparisonSummary.textContent += "\nAdapted methods: Riemann integrates its first cell analytically; Lebesgue adds the analytic (0,0.01] contribution. Cutoffs differ; see each row.";
    } catch (error) { comparisonSummary.textContent = `${error.message}\nPrevious comparison table, if any, retained.`; }
  });
  const convergenceSummary = document.getElementById("convergenceSummary");
  document.getElementById("runConvergenceBtn").addEventListener("click", () => {
    try {
      const configurations = runIntegrationConvergence(select.value);
      const floor = convergenceLogData(configurations).floor;
      convergenceSummary.textContent = `Function: ${INTEGRATION_FUNCTIONS[select.value].label}\n` +
        configurations.map(c => `${c.stage}: n=${c.n}; K=${c.K}; M=${c.M}`).join("\n") + "\n" +
        `Exactly zero errors appear as triangles at display floor ${floor.toExponential(2)}; raw errors remain zero in tooltips.\n` +
        "Evaluation costs are per algorithm run. Increasing K and M together does not isolate either effect. These examples do not establish a universal convergence ranking.";
      if (INTEGRATION_FUNCTIONS[select.value].firstPanelIntegral) convergenceSummary.textContent += "\nBoth families are adapted: Riemann uses cutoff 1/n; Lebesgue uses fixed cutoff 0.01, with separate analytic contributions.";
      if (step4PlotAvailable(convergenceSummary)) drawIntegrationConvergence(configurations);
    } catch (error) { convergenceSummary.textContent = error.message; }
  });
  const dirichletSummary = document.getElementById("dirichletSummary");
  document.getElementById("runDirichletBtn").addEventListener("click", () => {
    try {
      const n = step4Integer(document.getElementById("dirichletIntervals").value, 1, 1000, "Dirichlet n");
      const result = runDirichletExperiment(n, document.getElementById("dirichletSampling").value);
      dirichletSummary.textContent = `Uniform subintervals: ${n}\nMathematical Lebesgue integral: 0\nRiemann integral: does not exist\n` +
        "Exact Darboux lower sum: 0; exact upper sum: 1, for every partition of [0,1].\n" +
        `Constructed rational tags: ${result.rational.length}; tagged-sum diagnostic: ${result.rationalTagSum ?? "not selected"}\n` +
        `Constructed irrational tags: ${result.irrational.length}; tagged-sum diagnostic: ${result.irrationalTagSum ?? "not selected"}\n` +
        "Rational tags: (2i+1)/(2n), reduced with integer GCD. Irrational tags: (i + √2/2)/n.\n" +
        "These are constructed tags, not random real draws. Coordinates are rounded only for plotting. A tagged sum of 0 or 1 is not a Riemann integral.\n" +
        `At most 200 points per selected construction are displayed; diagnostics use all ${n} tags per construction.`;
      if (step4PlotAvailable(dirichletSummary)) drawDirichletExperiment(result);
    } catch (error) { dirichletSummary.textContent = error.message; }
  });
  const thomaeSummary = document.getElementById("thomaeSummary");
  document.getElementById("runThomaeBtn").addEventListener("click", () => {
    try {
      const Q = step4Integer(document.getElementById("thomaeMaximumDenominator").value, 1, 200, "maximum denominator Q");
      const n = step4Integer(document.getElementById("thomaeIntervals").value, 1, 2000, "Thomae n");
      const result = runThomaeExperiment(Q, n, document.getElementById("thomaeTagMethod").value,
        document.getElementById("thomaeNumerator").value, document.getElementById("thomaeDenominator").value);
      const displayed = Math.min(result.points.length, PATHOLOGY_MAX_POINTS);
      thomaeSummary.textContent = "Theoretical Riemann integral: 0\nTheoretical Lebesgue integral: 0\n" +
        `Selected fraction in lowest terms: ${result.selected.numerator}/${result.selected.denominator}\n` +
        `T(p/q) = 1/q: ${result.selected.value.toPrecision(10)}\nT(0)=1; T(1)=1; constructed irrational tag √2/2 has value 0.\n` +
        `Distinct reduced rationals with denominator ≤ ${Q}: ${result.points.length}\n` +
        `Displayed cloud points: ${displayed}/${result.points.length}; selected fraction shown separately.\n` +
        `Uniform rational ${result.method} tags, n=${n}: tagged sum ${result.taggedSum.toPrecision(10)}\n` +
        "The finite tagged sum depends on tag choice; it is not the exact integral. Q limits only the cloud, not the uniform-tag denominators.\n" +
        "Fractions and GCD use exact integers; only plotted coordinates and heights are rounded. No finite-search suprema are presented as exact Darboux sums.";
      if (step4PlotAvailable(thomaeSummary)) drawThomaeExperiment(result);
    } catch (error) { thomaeSummary.textContent = error.message; }
  });
});

// Step 6/8 - Normal CDF algorithms and UI, isolated from Exercise 1.
const NormalCdf = (() => {
  const source = Object.freeze({
    title: "NIST/SEMATECH e-Handbook, section 1.3.6.7.1: Standard Normal Table",
    url: "https://www.itl.nist.gov/div898/handbook/eda/section3/eda3671.htm",
    decimalPlaces: 5,
    displayResolution: 1e-5,
    comparisonTolerance: 1e-5,
    limitation: "Five published decimal places, not a certified error bound. No interpolation. " +
      "Tail-relative accuracy is limited; this table cannot validate errors below its display resolution."
  });
  // NIST publishes the area from 0 to |x|, to five decimal places.
  // These literals are 0.5 +/- the published areas (symmetry per NIST's instructions),
  // not values generated by a CDF/erf algorithm. No extra digits are asserted.
  const references = Object.freeze([
    { x: -4, cdf: 0.00003 }, { x: -3, cdf: 0.00135 },
    { x: -2, cdf: 0.02275 }, { x: -1.96, cdf: 0.02500 },
    { x: -1, cdf: 0.15866 }, { x: -0.5, cdf: 0.30854 },
    { x: 0, cdf: 0.50000 }, { x: 0.5, cdf: 0.69146 },
    { x: 1, cdf: 0.84134 }, { x: 1.96, cdf: 0.97500 },
    { x: 2, cdf: 0.97725 }, { x: 3, cdf: 0.99865 },
    { x: 4, cdf: 0.99997 }
  ].map(Object.freeze));
  const methods = Object.freeze([
    { id: "trapezoidal", label: "Trapezoidal integration", available: true, compute: trapezoidal,
      parameter: { label: "Subintervals", defaultValue: 1000, minimum: 2, maximum: 100000, step: 1 } },
    { id: "simpson", label: "Simpson integration", available: true, compute: simpson,
      parameter: { label: "Subintervals (even)", defaultValue: 1000, minimum: 2, maximum: 100000, step: 2 } },
    { id: "erf-series", label: "Error-function power series", available: true, compute: erfSeries,
      parameter: { label: "Maximum terms", defaultValue: 100, minimum: 1, maximum: 1000, step: 1 } }
  ].map(method => Object.freeze({ ...method, parameter: Object.freeze(method.parameter) })));

  const state = { x: null, error: null, results: [] };
  const settings = { quadrature: "1000", terms: "100" };
  const charts = { density: null, errors: null };
  const canvasIds = { density: "normalCdfDensityChart", errors: "normalCdfErrorChart" };

  function methodById(id) {
    const method = methods.find(candidate => candidate.id === id);
    if (!method) throw new RangeError("Select a supported Normal CDF method.");
    return method;
  }

  function validateX(x) {
    if (!Number.isFinite(x)) throw new RangeError("Enter a finite real value for x.");
    return x;
  }

  function parseNumericInput(raw, label) {
    if (typeof raw !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim())) {
      throw new RangeError(`Enter a finite real value for ${label}.`);
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new RangeError(`Enter a finite real value for ${label}.`);
    if (value === 0 && /[1-9]/.test(raw.trim().split(/e/i)[0])) {
      throw new RangeError(`${label} is below the supported numeric range.`);
    }
    return value;
  }

  function parseX(raw) {
    return validateX(parseNumericInput(raw, "x"));
  }

  function validateParameter(methodId, raw) {
    const { parameter } = methodById(methodId);
    const value = parseNumericInput(raw, parameter.label);
    if (!Number.isSafeInteger(value) || value < parameter.minimum || value > parameter.maximum ||
        value % parameter.step !== 0) {
      throw new RangeError(`${parameter.label}: enter an integer from ${parameter.minimum} to ` +
        `${parameter.maximum}${parameter.step === 2 ? " (even only)" : ""}.`);
    }
    return value;
  }

  function referenceAt(x) {
    validateX(x);
    return references.find(reference => reference.x === x) ?? null;
  }

  function createPendingResult(methodId, x) {
    methodById(methodId);
    validateX(x);
    const reference = referenceAt(x);
    return Object.freeze({
      methodId, x, status: "pending", approximation: null, absoluteError: null,
      evaluations: null, iterations: null, elapsedMs: null,
      reference: reference?.cdf ?? null,
      referenceTolerance: reference ? source.comparisonTolerance : null
    });
  }

  function formatNumber(value) {
    if (value === null || value === undefined) return "Unavailable";
    if (!Number.isFinite(value)) return "Invalid numeric value";
    return Number(value.toPrecision(15)).toString();
  }

  function formatReference(value) {
    return value === null ? "Not tabulated" : Number.isFinite(value)
      ? value.toFixed(source.decimalPlaces) : "Invalid reference";
  }

  const CUTOFF = 12;
  // Cached once, outside measured calculations and their density-evaluation counts.
  const OMITTED_TAIL_BOUND = Math.exp(-72) / Math.sqrt(2 * Math.PI) / CUTOFF;
  function density(x) {
    validateX(x);
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }
  function validateTolerance(tolerance) {
    if (!Number.isFinite(tolerance) || tolerance < 1e-15 || tolerance > 1e-3) {
      throw new RangeError("Erf tolerance must be between 1e-15 and 1e-3 (absolute CDF term criterion).");
    }
    return tolerance;
  }
  function quadrature(methodId, x, n) {
    validateX(x);
    if (typeof n !== "number") throw new RangeError("Subintervals must be numeric.");
    validateParameter(methodId, String(n));
    if (Math.abs(x) > 10) throw new RangeError("Quadrature supports |x| <= 10; no result computed outside this range.");
    const common = { parameterUsed: `n=${n}`, evaluations: 0, iterations: 0,
      converged: null, status: "completed", message: "Fixed resolution; refine n to check discretization error.",
      cutoff: null, tailBound: 0, discretizationBound: 0 };
    if (x === 0) return { ...common, approximation: 0.5, strategy: "Exact symmetry at x=0." };
    const left = Math.abs(x), right = CUTOFF;
    const h = (right - left) / n;
    let sum = 0, correction = 0;
    for (let i = 0; i <= n; i++) {
      const weight = i === 0 || i === n ? 1 : methodId === "simpson" ? (i % 2 ? 4 : 2) : 2;
      const adjusted = weight * density(left + i * h) - correction;
      const next = sum + adjusted;
      correction = (next - sum) - adjusted;
      sum = next;
    }
    let integral = sum * h / (methodId === "simpson" ? 3 : 2);
    // The tail cannot exceed 0.5. Only repair a tiny rounding overshoot;
    // substantial violations are errors, never clamped into a valid probability.
    const roundingAdjustment = integral > 0.5 && integral <= 0.5 + 8 * Number.EPSILON
      ? integral - 0.5 : 0;
    if (roundingAdjustment) integral = 0.5;
    const approximation = x < 0 ? integral : 1 - integral;
    if (!Number.isFinite(approximation) || approximation < 0 || approximation > 1 || integral > 0.5) {
      throw new RangeError("Numerical result is invalid at this resolution; increase the subinterval count.");
    }
    // Conservative global derivative bounds: |second derivative| <= 1 and
    // |fourth derivative| <= 10. Classical bounds exclude floating-point error.
    // Tail truncation uses the Mills inequality Q(c) < phi(c)/c.
    const length = right - left;
    return { ...common, approximation, evaluations: n + 1, iterations: n,
      tailProbability: integral, roundingAdjustment,
      cutoff: CUTOFF, tailBound: OMITTED_TAIL_BOUND,
      discretizationBound: methodId === "simpson" ? 10 * length ** 5 / (180 * n ** 4)
        : length ** 3 / (12 * n ** 2),
      strategy: "Integrate positive tail [|x|, 12]; omitted tail < phi(12)/12. Negative tails avoid cancellation.",
      message: common.message + (roundingAdjustment ? " Tiny tail overshoot rounded to 0.5 (within 8 machine epsilons)." : "") + (approximation === 1 ? " Positive CDF rounded to 1 in binary64; the computed tail remains available." : "") };
  }
  function trapezoidal(x, n = 1000) { return quadrature("trapezoidal", x, n); }
  function simpson(x, n = 1000) { return quadrature("simpson", x, n); }

  function erfSeries(x, maxTerms = 100, tolerance = 1e-12) {
    validateX(x);
    if (typeof maxTerms !== "number") throw new RangeError("Maximum terms must be numeric.");
    validateParameter("erf-series", String(maxTerms));
    validateTolerance(tolerance);
    if (Math.abs(x) > 4) throw new RangeError("Erf power series supports |x| <= 4 to limit cancellation; use quadrature for larger |x|.");
    const common = { parameterUsed: `max terms=${maxTerms}; tolerance=${tolerance}`,
      evaluations: 0, iterations: 0, cutoff: null, tailBound: 0,
      strategy: "Erf alternating power series, compensated sum; |x| <= 4. Tolerance controls the first omitted CDF term, not total floating-point error." };
    if (x === 0) return { ...common, approximation: 0.5, status: "converged", converged: true,
      remainderBound: 0, roundoffEstimate: 0, message: "Exact symmetry at x=0." };
    const z = Math.abs(x) / Math.SQRT2;
    let term = z, sum = 0, correction = 0, absoluteSum = 0;
    for (let i = 0; i < maxTerms; i++) {
      const adjusted = term - correction;
      const nextSum = sum + adjusted;
      correction = (nextSum - sum) - adjusted;
      sum = nextSum;
      absoluteSum += Math.abs(term);
      // NIST DLMF 7.6.1: recurrence avoids factorials and repeated powers.
      const ratio = -z * z * (2 * i + 1) / ((i + 1) * (2 * i + 3));
      const next = term * ratio;
      if (![sum, absoluteSum, next].every(Number.isFinite)) throw new RangeError("Non-finite erf series operation.");
      const remainderBound = Math.abs(next) / Math.sqrt(Math.PI);
      if (Math.abs(ratio) <= 1 && remainderBound <= tolerance) {
        const approximation = 0.5 + Math.sign(x) * sum / Math.sqrt(Math.PI);
        if (!Number.isFinite(approximation) || approximation < 0 || approximation > 1) {
          throw new RangeError("Erf series produced an invalid probability; use quadrature.");
        }
        // Deliberately conservative rounding-risk estimate, not a certified
        // bound on libm operations; kept separate from the truncation criterion.
        const roundoffEstimate = Number.EPSILON * (8 * (i + 1) + 4) * absoluteSum / Math.sqrt(Math.PI);
        const warning = roundoffEstimate > tolerance;
        return { ...common, approximation, iterations: i + 1, converged: true,
          status: warning ? "accuracy-warning" : "converged", remainderBound, roundoffEstimate,
          message: warning ? "Term criterion met; cancellation/roundoff may exceed the requested tolerance. Use Simpson for a precision check."
            : "Term criterion met; tolerance is not a guarantee of total floating-point accuracy." };
      }
      term = next;
    }
    return { ...common, approximation: null, iterations: maxTerms, converged: false,
      status: "not-converged", message: "Maximum terms reached before the term criterion was met. Increase maximum terms." };
  }

  function calculate(methodId, x, parameter, tolerance = 1e-12) {
    const method = methodById(methodId);
    validateX(x);
    const pending = createPendingResult(methodId, x);
    const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
    const start = now();
    let result;
    try { result = method.compute(x, parameter, tolerance); }
    catch (error) {
      result = { approximation: null, status: "error", converged: false, message: error.message,
        parameterUsed: `${parameter}${methodId === "erf-series" ? `; tolerance=${tolerance}` : ""}` };
    }
    const elapsedMs = now() - start; // Excludes DOM, graphs and reference lookup.
    return Object.freeze({ ...pending, ...result, elapsedMs,
      absoluteError: result.approximation !== null && pending.reference !== null
        ? Math.abs(result.approximation - pending.reference) : null });
  }

  function renderTable(results) {
    const body = document.getElementById("normalCdfTableBody");
    body.replaceChildren();
    for (const result of results) {
      const row = document.createElement("tr");
      const values = [methodById(result.methodId).label,
        result.status === "pending" ? "Not computed" : `${result.status}: ${result.message}`,
        formatReference(result.reference), formatNumber(result.approximation), formatNumber(result.absoluteError),
        formatNumber(result.evaluations), formatNumber(result.iterations), result.elapsedMs === null ? "Unavailable" : result.elapsedMs.toFixed(3),
        result.parameterUsed ?? "Unavailable"];
      for (const value of values) {
        const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell);
      }
      body.appendChild(row);
    }
  }

  // Replace only this module's charts; null clears an existing instance.
  function updateCharts(configurations = {}) {
    for (const key of Object.keys(configurations)) {
      if (!Object.hasOwn(canvasIds, key)) throw new RangeError("Unknown Normal CDF plot.");
    }
    for (const key of Object.keys(canvasIds)) {
      const configuration = configurations[key] ?? null;
      if (configuration !== null && typeof Chart !== "function") {
        throw new Error("Normal CDF plots require Chart.js.");
      }
      if (charts[key]) charts[key].destroy();
      charts[key] = null;
      if (configuration !== null) charts[key] = new Chart(document.getElementById(canvasIds[key]), configuration);
    }
  }

  function refreshInput() {
    updateCharts();
    document.getElementById("normalCdfPlotNote").textContent = "Calculate to display the density and cumulative area.";
    document.getElementById("normalCdfErrorNote").textContent = "Errors use only stored five-decimal NIST references.";
    const summary = document.getElementById("normalCdfSummary");
    try {
      state.x = parseX(document.getElementById("normalCdfX").value);
      state.error = null;
      state.results = methods.map(method => createPendingResult(method.id, state.x));
      const reference = referenceAt(state.x);
      summary.textContent = `Ready — no numerical approximation has been computed.\nx: ${state.x}\n` +
        `Tabulated reference Φ(x): ${formatReference(reference?.cdf ?? null)}\n` +
        (reference ? "Published precision: five decimal places."
          : "No stored reference for this exact x; no interpolation is performed.");
    } catch (error) {
      state.x = null; state.error = error.message; state.results = []; summary.textContent = error.message;
    }
    renderTable(state.results);
  }
  function plotResults() {
    if (!state.results.some(result => Number.isFinite(result.approximation))) { updateCharts(); return; }
    const x = state.x, extent = Math.max(6, Math.abs(x) + 1);
    const positions = Array.from({ length: 801 }, (_, i) => -extent + 2 * extent * i / 800);
    positions.push(x); positions.sort((a, b) => a - b);
    const points = positions.map(t => ({ x: t, y: density(t) }));
    const options = { responsive: true, maintainAspectRatio: false, animation: false,
      scales: { x: { type: "linear", min: -extent, max: extent, ticks: { maxTicksLimit: 5 },
        title: { display: true, text: "x" } }, y: { beginAtZero: true } },
      plugins: { legend: { labels: { boxWidth: 10 } } } };
    const densityPlot = { type: "line", data: { datasets: [
      { label: "Normal density", data: points, borderColor: "#2471a3", borderWidth: 2, pointRadius: 0, fill: false },
      { label: "Cumulative area", data: points.filter(point => point.x <= x), borderWidth: 0,
        pointRadius: 0, backgroundColor: "rgba(36,113,163,0.25)", fill: "origin" },
      { label: `x = ${x}`, data: [{ x, y: 0 }, { x, y: density(0) }],
        borderColor: "#c0392b", borderWidth: 2, pointRadius: 0, fill: false }
    ] }, options };
    const compared = state.results.filter(result => Number.isFinite(result.absoluteError));
    const errors = compared.length ? { type: "bar", data: {
      labels: compared.map(result => methodById(result.methodId).label),
      datasets: [{ label: "Difference from NIST (5 d.p.)",
        data: compared.map(result => result.absoluteError), backgroundColor: "#2471a3" }]
    }, options: { ...options, scales: { y: { beginAtZero: true } } } } : null;
    updateCharts({ density: densityPlot, errors });
    document.getElementById("normalCdfPlotNote").textContent =
      `Density plot truncated to [${-extent}, ${extent}]; shaded area omits the left tail (< ${formatNumber(density(extent) / extent)}). Rendering is excluded from algorithm time.`;
    document.getElementById("normalCdfErrorNote").textContent = compared.length
      ? "Absolute differences from the rounded NIST table; differences below 1e-5 do not certify algorithm accuracy."
      : "No NIST reference for this exact x; error chart unavailable (no interpolation).";
  }
  function rememberParameter() {
    const id = document.getElementById("normalCdfMethod").value;
    settings[id === "erf-series" ? "terms" : "quadrature"] = document.getElementById("normalCdfParameter").value;
    refreshInput();
  }
  function updateParameterControl() {
    const method = methodById(document.getElementById("normalCdfMethod").value);
    const input = document.getElementById("normalCdfParameter");
    input.value = settings[method.id === "erf-series" ? "terms" : "quadrature"];
    input.min = method.parameter.minimum; input.max = method.parameter.maximum; input.step = method.parameter.step;
    input.disabled = false;
    document.getElementById("normalCdfParameterLabel").textContent = `${method.parameter.label}:`;
    refreshInput();
  }
  function run(compareAll) {
    refreshInput();
    if (state.x === null) return;
    const selected = document.getElementById("normalCdfMethod").value;
    settings[selected === "erf-series" ? "terms" : "quadrature"] = document.getElementById("normalCdfParameter").value;
    state.results = methods.map(method => {
      if (!compareAll && method.id !== selected) return createPendingResult(method.id, state.x);
      const raw = settings[method.id === "erf-series" ? "terms" : "quadrature"];
      try {
        const parameter = validateParameter(method.id, raw);
        const tolerance = method.id === "erf-series"
          ? validateTolerance(parseNumericInput(document.getElementById("normalCdfTolerance").value, "erf tolerance")) : 1e-12;
        return calculate(method.id, state.x, parameter, tolerance);
      } catch (error) {
        return { ...createPendingResult(method.id, state.x), status: "error", converged: false,
          parameterUsed: raw, message: error.message };
      }
    });
    renderTable(state.results);
    const result = state.results.find(value => value.methodId === selected);
    state.error = result.approximation === null ? result.message : null;
    document.getElementById("normalCdfSummary").textContent =
      `x: ${state.x}\nMethod: ${methodById(selected).label}\nStatus: ${result.status}\n${result.message}\n` +
      `Approximation Φ(x): ${formatNumber(result.approximation)}\nNIST reference: ${formatReference(result.reference)}\n` +
      `Absolute difference from rounded NIST: ${formatNumber(result.absoluteError)}\n` +
      `Parameters used: ${result.parameterUsed}\nDensity evaluations: ${formatNumber(result.evaluations)}; iterations / series terms: ${formatNumber(result.iterations)}\n` +
      `Algorithm time (ms): ${result.elapsedMs === null ? "Unavailable" : result.elapsedMs.toFixed(3)}\nConvergence: ${result.converged === null ? "fixed resolution" : result.converged ? "term criterion met" : "not achieved"}\n` +
      (result.strategy ?? "") +
      (result.discretizationBound !== undefined ? `\nConservative discretization bound (excludes rounding): ${formatNumber(result.discretizationBound)}; omitted-tail bound: ${formatNumber(result.tailBound)}` : "") +
      (result.remainderBound !== undefined ? `\nSeries remainder bound (exact arithmetic): ${formatNumber(result.remainderBound)}; rounding-risk estimate (not certified): ${formatNumber(result.roundoffEstimate)}` : "");
    plotResults();
  }
  function calculateSelected() { run(false); }
  function compareMethods() { run(true); }
  function initialize() {
    const select = document.getElementById("normalCdfMethod");
    select.replaceChildren();
    for (const method of methods) {
      const option = document.createElement("option"); option.value = method.id; option.textContent = method.label;
      select.appendChild(option);
    }
    select.disabled = false;
    document.getElementById("calculateNormalCdfBtn").disabled = false;
    updateParameterControl();
    document.getElementById("normalCdfX").addEventListener("input", refreshInput);
    document.getElementById("normalCdfParameter").addEventListener("input", rememberParameter);
    document.getElementById("normalCdfTolerance").addEventListener("input", refreshInput);
    select.addEventListener("change", updateParameterControl);
    document.getElementById("calculateNormalCdfBtn").addEventListener("click", calculateSelected);
    document.getElementById("compareNormalCdfBtn").addEventListener("click", compareMethods);
    initializeExperiments();
  }
  // Step 7: independent reference literals, experiments and batch timing only.
  // Reproduction: CPython 3.10.7/macOS libm, for each x:
  // (.5*math.erfc(-x/math.sqrt(2)), .5*math.erfc(x/math.sqrt(2))).
  // https://docs.python.org/3.10/library/math.html#math.erfc
  // Binary64 vectors, NOT certified arbitrary-precision values. Survival is
  // computed independently, never reconstructed from an already rounded CDF.
  const numericSource = Object.freeze({
    title: "Independent CPython 3.10.7 / macOS libm erfc vectors (binary64)",
    url: "https://docs.python.org/3.10/library/math.html#math.erfc",
    limitation: "Stored double-precision values; differences near their rounding scale cannot certify total algorithm accuracy. No interpolation."
  });
  const numericReferences = Object.freeze([
    [-10,7.619853024160593e-24,1], [-8,6.22096057427182e-16,.9999999999999993],
    [-6,9.865876450377014e-10,.9999999990134123], [-4,3.167124183311996e-5,.9999683287581669],
    [-3,.0013498980316300957,.9986501019683699], [-2,.022750131948179216,.9772498680518208],
    [-1.96,.02499789514822043,.9750021048517795], [-1,.15865525393145705,.8413447460685429],
    [-.5,.30853753872598694,.691462461274013], [0,.5,.5], [.5,.691462461274013,.30853753872598694],
    [1,.8413447460685429,.15865525393145705], [1.96,.9750021048517795,.02499789514822043],
    [2,.9772498680518208,.022750131948179216], [3,.9986501019683699,.0013498980316300957],
    [4,.9999683287581669,3.167124183311996e-5], [6,.9999999990134123,9.865876450377014e-10],
    [8,.9999999999999993,6.22096057427182e-16], [10,1,7.619853024160593e-24]
  ].map(([x, cdf, survival]) => Object.freeze({ x, cdf, survival })));
  const resolutions = Object.freeze([20,50,100,200,500,1000,2000,5000,10000]);
  const tolerances = Object.freeze([1e-3,1e-5,1e-7,1e-9,1e-11,1e-13,1e-15]);
  const tailXs = Object.freeze([-10,-8,-6,-4,4,6,8,10]);

  function experimentOptions(options = {}) {
    const normalized = { n: 1000, maxTerms: 100, tolerance: 1e-12, referenceKind: "erfc", repeats: 5, ...options };
    if (typeof normalized.n !== "number" || typeof normalized.maxTerms !== "number") {
      throw new RangeError("Experiment resolutions must be numeric integers.");
    }
    validateParameter("simpson", String(normalized.n));
    validateParameter("erf-series", String(normalized.maxTerms));
    validateTolerance(normalized.tolerance);
    if (!["erfc", "nist"].includes(normalized.referenceKind)) throw new RangeError("Select a supported reference source.");
    if (!Number.isSafeInteger(normalized.repeats) || normalized.repeats < 3 || normalized.repeats > 15) {
      throw new RangeError("Benchmark repetitions must be an integer from 3 to 15.");
    }
    return normalized;
  }

  function experimentCase(methodId, x, options = {}) {
    const config = experimentOptions(options);
    methodById(methodId); validateX(x);
    const parameter = methodId === "erf-series" ? config.maxTerms : config.n;
    const supported = Math.abs(x) <= (methodId === "erf-series" ? 4 : 10);
    const result = supported ? calculate(methodId, x, parameter, config.tolerance)
      : { ...createPendingResult(methodId,x), status: "unsupported", converged: false,
        parameterUsed: methodId === "erf-series" ? `max terms=${parameter}; tolerance=${config.tolerance}` : `n=${parameter}`,
        message: `Unsupported: |x| must be <= ${methodId === "erf-series" ? 4 : 10}.`, evaluations: 0, iterations: 0 };
    const numeric = numericReferences.find(reference => reference.x === x) ?? null;
    const valid = Number.isFinite(result.approximation);
    const survival = !valid ? null : x === 0 ? 0.5
      : x > 0 && methodId !== "erf-series" ? result.tailProbability : 1 - result.approximation;
    const smallTail = !valid ? null : x <= 0 ? result.approximation : survival;
    const expectedTail = numeric ? Math.min(numeric.cdf,numeric.survival) : null;
    const numericError = valid && numeric ? Math.abs(result.approximation - numeric.cdf) : null;
    const referenceValue = config.referenceKind === "nist" ? result.reference : numeric?.cdf ?? null;
    const error = valid && referenceValue !== null ? Math.abs(result.approximation - referenceValue) : null;
    const errorClass = error === null ? "Unavailable" : error === 0 ? "Zero at stored reference precision"
      : config.referenceKind === "nist" ? (error < source.displayResolution ? "Below NIST display resolution" : "Difference from rounded NIST")
      : error <= 4 * Number.EPSILON * Math.abs(referenceValue) ? "Near binary64 reference rounding scale" : "Resolved difference";
    return Object.freeze({ ...result, n: methodId === "erf-series" ? null : config.n,
      maxTerms: methodId === "erf-series" ? config.maxTerms : null,
      tolerance: methodId === "erf-series" ? config.tolerance : null,
      numericReference: numeric?.cdf ?? null, numericError, referenceKind: config.referenceKind, referenceValue,
      error, errorClass, survival, survivalReference: numeric?.survival ?? null,
      survivalError: valid && numeric ? Math.abs(survival - numeric.survival) : null,
      survivalSource: methodId !== "erf-series" && x > 0 ? "Direct quadrature tail" : "CDF complement / symmetry",
      smallTailRelativeError: smallTail !== null && expectedTail !== null ? Math.abs(smallTail - expectedTail) / expectedTail : null,
      cost: valid ? methodId === "erf-series" ? result.iterations : result.evaluations : null });
  }

  function accuracyExperiment(options = {}) {
    const config = experimentOptions(options);
    return references.map(reference => ({ x: reference.x, nist: reference.cdf,
      numeric: numericReferences.find(value => value.x === reference.x).cdf,
      results: methods.map(method => experimentCase(method.id,reference.x,config)) }));
  }
  function convergenceExperiment(x, options = {}) {
    validateX(x); const config = experimentOptions(options);
    return methods.map(method => ({ methodId: method.id,
      rows: (method.id === "erf-series" ? tolerances : resolutions).map(resolution => ({
        ...experimentCase(method.id,x,{ ...config, ...(method.id === "erf-series" ? { tolerance: resolution } : { n: resolution }) }),
        resolution
      })) }));
  }
  function tailExperiment(options = {}) {
    const config = experimentOptions(options);
    return tailXs.flatMap(x => methods.map(method => experimentCase(method.id,x,config)));
  }

  // Zero errors are deliberately omitted from logarithmic data, never replaced
  // by epsilon. Their exact counts and locations remain in the table/summary.
  function logPoints(rows, axis) {
    return rows.filter(row => Number.isFinite(row.error) && row.error > 0 && Number.isFinite(row[axis]) && row[axis] > 0)
      .map(row => ({ x: row[axis], y: row.error }));
  }
  function timingStatistics(samples) {
    if (!Array.isArray(samples) || !samples.length || samples.some(value => !Number.isFinite(value) || value < 0)) {
      throw new RangeError("Timing samples must be non-negative finite numbers.");
    }
    const sorted = samples.slice().sort((a,b) => a-b), middle = Math.floor(sorted.length/2);
    return { minimumMs: sorted[0], medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2,
      maximumMs: sorted[sorted.length-1] };
  }
  function timerResolution(now) {
    let previous = now(), smallest = Infinity;
    for (let i=0; i<2048; i++) {
      const current = now();
      if (!Number.isFinite(current) || !Number.isFinite(previous) || current < previous) throw new RangeError("Invalid monotonic timer.");
      if (current > previous) smallest = Math.min(smallest,current-previous);
      previous = current;
    }
    return Number.isFinite(smallest) ? smallest : null;
  }
  function checkCancellation(runtime) {
    if (runtime.isCancelled?.()) { const error = new Error("Benchmark cancelled: inputs changed."); error.name="AbortError"; throw error; }
  }
  async function benchmarkMethod(methodId, x, options = {}, runtime = {}) {
    const config = experimentOptions(options), result = experimentCase(methodId,x,config);
    if (!Number.isFinite(result.approximation)) return { ...result, benchmarkStatus: "Skipped: no valid approximation",
      minimumMs: null, medianMs: null, maximumMs: null, batches: [], warmupCalls: 0, calibrationCalls: 0 };
    const now = runtime.now ?? (() => performance.now());
    const pause = runtime.pause ?? (() => new Promise(resolve => setTimeout(resolve,0)));
    const resolution = timerResolution(now);
    const compute = methodById(methodId).compute;
    const invoke = () => compute(x, methodId === "erf-series" ? config.maxTerms : config.n,config.tolerance);
    checkCancellation(runtime);
    for (let i=0;i<3;i++) { checkCancellation(runtime); invoke(); await pause(); }
    function batch(requested) {
      checkCancellation(runtime);
      const wallStart = Date.now(), start = now();
      let calls=0;
      while (calls < requested) {
        invoke(); calls++;
        // Bound each synchronous slice even with a coarse/frozen performance clock.
        if (Date.now()-wallStart >= 20) break;
      }
      const elapsed = now()-start;
      if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError("Invalid benchmark duration.");
      return { calls, elapsedMs: elapsed, meanMs: elapsed/calls };
    }
    const targetMs = Math.max(8, Math.min(20,20*(resolution ?? 0)));
    let batchSize=1, calibrationCalls=0;
    while (true) {
      const measured=batch(batchSize); calibrationCalls+=measured.calls;
      await pause(); checkCancellation(runtime);
      if (measured.elapsedMs >= targetMs || measured.calls < batchSize || batchSize >= 65536) break;
      batchSize*=2;
    }
    const batches=[];
    for(let i=0;i<config.repeats;i++) {
      batches.push(batch(batchSize)); await pause(); checkCancellation(runtime);
    }
    // The calibration target is a planning goal, not the timer's resolution.
    // Judge resolution on aggregate durations (at least 20 observed ticks),
    // rather than comparing the amortized per-call time with a single tick.
    const limited = resolution === null || batches.some(value => value.elapsedMs <= 0 || value.elapsedMs < 20*resolution);
    return { ...result, ...timingStatistics(batches.map(value => value.meanMs)), batches,
      timerResolutionMs: resolution, targetBatchMs: targetMs, warmupCalls: 3, calibrationCalls,
      measuredCalls: batches.reduce((sum,value)=>sum+value.calls,0), batchSize,
      benchmarkStatus: limited ? "Timer/batch limit: timings are indicative only" : "Resolved batches; observed timing only" };
  }
  async function benchmarkExperiment(x, options = {}, runtime = {}) {
    validateX(x); const config = experimentOptions(options), rows=[];
    for(const method of methods) {
      checkCancellation(runtime);
      runtime.onProgress?.(method.label);
      rows.push(await benchmarkMethod(method.id,x,config,runtime));
    }
    return rows;
  }

  const experimentState = { accuracy: null, convergence: null, tails: null, benchmark: null };
  const experimentCharts = {};
  let benchmarkGeneration=0;
  function clearExperimentCharts() {
    for(const id of Object.keys(experimentCharts)) { experimentCharts[id]?.destroy(); delete experimentCharts[id]; }
  }
  function invalidateExperiments() {
    benchmarkGeneration++;
    clearExperimentCharts();
    for(const key of Object.keys(experimentState)) experimentState[key]=null;
    for(const id of ["cdfAccuracyBody","cdfConvergenceBody","cdfTailBody","cdfBenchmarkBody"]) document.getElementById(id).replaceChildren();
    document.getElementById("cdfAccuracySummary").textContent="No results. Editing experiment settings clears previous results and cancels a running benchmark.";
    document.getElementById("cdfBenchmarkSummary").textContent="Benchmark not run.";
    document.getElementById("cdfConvergenceSummary").textContent="Run convergence to display errors and cost.";
    document.getElementById("runCdfBenchmarkBtn").disabled=false;
  }
  function readExperimentOptions() {
    return experimentOptions({ n: parseNumericInput(document.getElementById("cdfExperimentN").value,"subintervals"),
      maxTerms: parseNumericInput(document.getElementById("cdfExperimentTerms").value,"maximum terms"),
      tolerance: parseNumericInput(document.getElementById("cdfExperimentTolerance").value,"erf tolerance"),
      referenceKind: document.getElementById("cdfReferenceKind").value,
      repeats: parseNumericInput(document.getElementById("cdfBenchmarkRepeats").value,"benchmark repetitions") });
  }
  function experimentRows(id, rows) {
    const body = document.getElementById(id); body.replaceChildren();
    for(const values of rows) {
      const row=document.createElement("tr");
      for(const value of values) { const cell=document.createElement("td"); cell.textContent=String(value); row.appendChild(cell); }
      body.appendChild(row);
    }
  }
  function resultStatus(row) { return `${row.status}: ${row.message}`; }
  function runAccuracyUI() {
    experimentState.accuracy=null; experimentState.tails=null;
    experimentRows("cdfAccuracyBody",[]); experimentRows("cdfTailBody",[]);
    try {
      const config=readExperimentOptions(), rows=accuracyExperiment(config);
      experimentState.accuracy=rows;
      experimentRows("cdfAccuracyBody",rows.map(row=>[row.x,formatReference(row.nist),formatNumber(row.numeric),
        ...row.results.flatMap(result=>[formatNumber(result.approximation),formatNumber(result.absoluteError),formatNumber(result.numericError),resultStatus(result)])]));
      const tails=tailExperiment(config); experimentState.tails=tails;
      experimentRows("cdfTailBody",tails.map(row=>[row.x,methodById(row.methodId).label,formatNumber(row.approximation),
        formatNumber(row.numericReference),formatNumber(row.numericError),formatNumber(row.survival),formatNumber(row.survivalReference),
        formatNumber(row.survivalError),formatNumber(row.smallTailRelativeError),row.survivalSource,resultStatus(row)]));
      document.getElementById("cdfAccuracySummary").textContent=
        `13 x values, both reference sources; 8 tail x values. n=${config.n}, max terms=${config.maxTerms}, tolerance=${config.tolerance}. `+
        "A zero difference means equality at stored reference precision; a CDF rounded to 1 is not mathematically exact for finite x.";
    } catch(error) { document.getElementById("cdfAccuracySummary").textContent=error.message; }
  }
  function drawConvergence(groups) {
    clearExperimentCharts();
    const colors=["#2471a3","#c0392b","#148f77"];
    const label=groups[0].rows[0].referenceKind === "nist" ? "Difference from NIST (5 d.p.)" : "Difference from erfc (binary64)";
    function draw(id,datasets,xTitle,reverse=false) {
      experimentCharts[id]=new Chart(document.getElementById(id),{ type:"line",data:{datasets},options:{
        responsive:true,maintainAspectRatio:false,animation:false,
        scales:{x:{type:"logarithmic",reverse,title:{display:true,text:xTitle},
          ticks:{maxTicksLimit:5,callback:value=>Number(value).toExponential(0)}},
          y:{type:"logarithmic",title:{display:true,text:label},
            ticks:{maxTicksLimit:6,callback:value=>Number(value).toExponential(0)}}},
        plugins:{legend:{labels:{boxWidth:10}}}
      }});
    }
    groups.forEach((group,i)=>draw(["cdfTrapezoidalConvergenceChart","cdfSimpsonConvergenceChart","cdfSeriesConvergenceChart"][i],
      [{label:methodById(group.methodId).label,data:logPoints(group.rows,"resolution"),borderColor:colors[i],pointRadius:3}],
      group.methodId === "erf-series" ? "Erf tolerance (tighter to the right)" : "Subintervals n",group.methodId === "erf-series"));
    draw("cdfCostConvergenceChart",groups.map((group,i)=>({label:methodById(group.methodId).label,
      data:logPoints(group.rows,"cost"),borderColor:colors[i],pointRadius:3})),"Density evaluations / series terms (different work units)");
  }
  function runConvergenceUI() {
    clearExperimentCharts(); experimentState.convergence=null; experimentRows("cdfConvergenceBody",[]);
    try {
      const x=parseX(document.getElementById("cdfExperimentX").value), groups=convergenceExperiment(x,readExperimentOptions());
      experimentState.convergence=groups;
      const all=groups.flatMap(group=>group.rows);
      experimentRows("cdfConvergenceBody",all.map(row=>[methodById(row.methodId).label,row.x,row.parameterUsed,
        formatNumber(row.approximation),formatNumber(row.referenceValue),formatNumber(row.error),row.errorClass,
        formatNumber(row.evaluations),formatNumber(row.iterations),resultStatus(row)]));
      drawConvergence(groups);
      document.getElementById("cdfConvergenceSummary").textContent=
        `x=${x}. Zero errors omitted from log charts: ${all.filter(row=>row.error===0).length}. `+
        `Unavailable/failed points: ${all.filter(row=>row.error===null).length}. `+
        "Zero locations and precision warnings remain in the table. Kinds of work are not equivalent costs; tighter series tolerances may reach a rounding plateau.";
    } catch(error) { document.getElementById("cdfConvergenceSummary").textContent=error.message; }
  }
  async function runBenchmarkUI() {
    const token=++benchmarkGeneration, button=document.getElementById("runCdfBenchmarkBtn"), summary=document.getElementById("cdfBenchmarkSummary");
    button.disabled=true; experimentRows("cdfBenchmarkBody",[]); experimentState.benchmark=null;
    try {
      const x=parseX(document.getElementById("cdfExperimentX").value), config=readExperimentOptions();
      const rows=await benchmarkExperiment(x,config,{isCancelled:()=>token!==benchmarkGeneration,
        onProgress:label=>{summary.textContent=`Warming up / benchmarking ${label}…`;}});
      if(token!==benchmarkGeneration)return;
      experimentState.benchmark=rows;
      experimentRows("cdfBenchmarkBody",rows.map(row=>[methodById(row.methodId).label,row.x,row.parameterUsed,
        formatNumber(row.approximation),formatNumber(row.error),row.referenceKind,formatNumber(row.evaluations),formatNumber(row.iterations),
        formatNumber(row.medianMs),formatNumber(row.minimumMs),formatNumber(row.maximumMs),row.batches.length,
        row.warmupCalls,row.calibrationCalls,formatNumber(row.measuredCalls),formatNumber(row.timerResolutionMs),
        resultStatus(row),row.benchmarkStatus]));
      summary.textContent=`${config.repeats} measured batches per available method; 3 warm-up calls, adaptive calibration, target 8–20 ms/batch, cap 65536 calls. `+
        "Times are median/min/max of batch means (ms/call), include loop/clock overhead, exclude all rendering, reference lookup and warm-up. " +
        "Observed clock tick is empirical, not guaranteed timer resolution; short or unresolved batches are flagged. No universal speed ranking is implied.";
    } catch(error) { if(token===benchmarkGeneration) summary.textContent=error.message; }
    finally { if(token===benchmarkGeneration)button.disabled=false; }
  }
  function initializeExperiments() {
    invalidateExperiments();
    for(const id of ["cdfExperimentN","cdfExperimentTerms","cdfExperimentTolerance","cdfReferenceKind","cdfExperimentX","cdfBenchmarkRepeats"]) {
      document.getElementById(id).addEventListener("input",invalidateExperiments);
    }
    document.getElementById("runCdfAccuracyBtn").addEventListener("click",runAccuracyUI);
    document.getElementById("runCdfConvergenceBtn").addEventListener("click",runConvergenceUI);
    document.getElementById("runCdfBenchmarkBtn").addEventListener("click",runBenchmarkUI);
  }
  const experiments=Object.freeze({ numericSource,numericReferences,resolutions,tolerances,tailXs,
    validateOptions:experimentOptions,calculate:experimentCase,accuracy:accuracyExperiment,convergence:convergenceExperiment,tails:tailExperiment,
    logPoints,timingStatistics,timerResolution,benchmarkMethod,benchmark:benchmarkExperiment,
    getState:()=>({...experimentState}) });
  return Object.freeze({ source, references, methods, validateX, parseX, validateParameter, validateTolerance,
    referenceAt, createPendingResult, formatNumber, formatReference, renderTable, updateCharts, initialize,
    density, trapezoidal, simpson, erfSeries, calculate, experiments,
    getState: () => ({ x: state.x, error: state.error, results: state.results.slice() }) });
})();

document.addEventListener("DOMContentLoaded", NormalCdf.initialize);
