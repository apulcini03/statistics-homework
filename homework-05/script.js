
// HW 4 - Welford & Sampling Statistics
// Statistics for Cybersecurity

// Exercise 1 - Interactive Welford Algorithm

// Create the initial state of Welford's algorithm.
function createWelfordState() {
  return {
    count: 0,
    mean: 0,
    M2: 0
  };
}

// Update running statistics with one observation.
function updateWelford(state, x) {
  const count = state.count + 1;

  // Welford's three-line core
  const delta = x - state.mean;
  const mean = state.mean + delta / count;
  const M2 = state.M2 + delta * (x - mean);

  // Commit only representable updates, preserving the last valid state.
  if (![x, delta, mean, M2].every(Number.isFinite)) {
    throw new RangeError(
      "Numeric overflow: observations exceed the supported numeric range."
    );
  }

  state.count = count;
  state.mean = mean;
  state.M2 = M2;

  return {
    count: state.count,
    observation: x,
    delta,
    mean: state.mean,
    M2: state.M2,
    variance: state.count > 1
      ? state.M2 / (state.count - 1)
      : null
  };
}

// Parse and validate the input sequence.
function parseWelfordObservations(text) {
  const values = text.split(",").map(
    value => value.trim()
  );

  if (
    values.length === 0 ||
    values.length > 100 ||
    values.some(value => value === "")
  ) {
    throw new Error(
      "Enter between 1 and 100 " +
      "comma-separated observations."
    );
  }

  const numbers = values.map(Number);

  if (
    numbers.some(value => !Number.isFinite(value))
  ) {
    throw new Error(
      "All observations must be valid numbers. " +
      "Use a dot for decimal values."
    );
  }

  return numbers;
}

// Direct calculation, used only for verification.
function directWelfordStatistics(values) {
  const n = values.length;

  if (n === 0) {
    return null;
  }

  const total = values.reduce(
    (sum, x) => sum + x,
    0
  );

  // Scale before summing only if the ordinary sum overflows.
  const mean = Number.isFinite(total)
    ? total / n
    : values.reduce((sum, x) => sum + x / n, 0);

  const M2 = values.reduce(
    (sum, x) => sum + (x - mean) ** 2,
    0
  );

  return {
    mean,
    M2,
    variance: n > 1 ? M2 / (n - 1) : null
  };
}

// Format values for the interactive tables.
function formatWelfordNumber(value) {
  if (value === null) {
    return "Undefined";
  }

  return Number(value.toFixed(6)).toString();
}

// Compare floating-point results with tolerance.
function welfordAlmostEqual(a, b) {
  if (a === null || b === null) {
    return a === b;
  }

  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return false;
  }

  const tolerance =
    1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

  return Math.abs(a - b) <= tolerance;
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById(
    "welfordObservations"
  );

  const nextButton = document.getElementById(
    "welfordNextBtn"
  );

  const runAllButton = document.getElementById(
    "welfordRunAllBtn"
  );

  const resetButton = document.getElementById(
    "welfordResetBtn"
  );

  const summary = document.getElementById(
    "welfordSummary"
  );

  const tableBody = document.getElementById(
    "welfordStepsBody"
  );

  const verification = document.getElementById(
    "welfordVerification"
  );

  let state = createWelfordState();
  let observations = [];
  let processedValues = [];
  let initialized = false;

  function updateButtons() {
    const finished =
      initialized &&
      state.count >= observations.length;

    nextButton.disabled = finished;
    runAllButton.disabled = finished;
  }

  function resetExperiment() {
    state = createWelfordState();
    observations = [];
    processedValues = [];
    initialized = false;

    tableBody.replaceChildren();

    summary.textContent =
      "Enter a sequence and start the algorithm.";

    verification.textContent =
      "No observations processed yet.";

    nextButton.disabled = false;
    runAllButton.disabled = false;
  }

  function initializeSequence() {
    if (initialized) {
      return true;
    }

    try {
      observations = parseWelfordObservations(
        input.value
      );

      initialized = true;

      summary.textContent =
        `Sequence contains ` +
        `${observations.length} observations.\n` +
        `Ready to process.`;

      return true;

    } catch (error) {
      summary.textContent = error.message;
      return false;
    }
  }

  function addStepToTable(result) {
    const row = document.createElement("tr");

    const values = [
      result.count,
      formatWelfordNumber(result.observation),
      formatWelfordNumber(result.delta),
      formatWelfordNumber(result.mean),
      formatWelfordNumber(result.M2),
      formatWelfordNumber(result.variance)
    ];

    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    }

    tableBody.appendChild(row);
  }

  function updateVerification() {
    const direct = directWelfordStatistics(
      processedValues
    );

    if (![direct.mean, direct.M2, direct.variance].every(
      value => value === null || Number.isFinite(value)
    )) {
      verification.textContent =
        "Verification unavailable: numeric overflow in direct calculation.";
      return;
    }

    const welfordVariance = state.count > 1
      ? state.M2 / (state.count - 1)
      : null;

    const meanMatches = welfordAlmostEqual(
      state.mean,
      direct.mean
    );

    const m2Matches = welfordAlmostEqual(
      state.M2,
      direct.M2
    );

    const varianceMatches = welfordAlmostEqual(
      welfordVariance,
      direct.variance
    );

    const allMatch =
      meanMatches && m2Matches && varianceMatches;

    verification.textContent =
      `Welford vs Direct Calculation\n\n` +
      `Mean:\n` +
      `Welford = ${formatWelfordNumber(state.mean)}\n` +
      `Direct  = ${formatWelfordNumber(direct.mean)}\n\n` +
      `Sum of Squares (M2):\n` +
      `Welford = ${formatWelfordNumber(state.M2)}\n` +
      `Direct  = ${formatWelfordNumber(direct.M2)}\n\n` +
      `Sample Variance:\n` +
      `Welford = ` +
      `${formatWelfordNumber(welfordVariance)}\n` +
      `Direct  = ` +
      `${formatWelfordNumber(direct.variance)}\n\n` +
      `Verification: ` +
      `${allMatch ? "PASS" : "CHECK"}`;
  }

  function processNextObservation() {
    if (!initializeSequence()) {
      return;
    }

    if (state.count >= observations.length) {
      updateButtons();
      return;
    }

    const x = observations[state.count];

    let result;

    try {
      result = updateWelford(state, x);
    } catch (error) {
      summary.textContent =
        `Processing stopped at observation ${state.count + 1}.\n` +
        `${error.message}\n` +
        `Processed observations: ${state.count}/${observations.length}\n` +
        "Last valid state retained. Edit the sequence or Reset to restart.";
      verification.textContent =
        "Verification unavailable: numeric overflow.";
      nextButton.disabled = true;
      runAllButton.disabled = true;
      return false;
    }

    // History is stored only by the demonstration.
    processedValues.push(x);

    addStepToTable(result);

    const remaining =
      observations.length - state.count;

    const variance = state.count > 1
      ? state.M2 / (state.count - 1)
      : null;

    summary.textContent =
      `Processed observations: ` +
      `${state.count}/${observations.length}\n` +
      `Remaining: ${remaining}\n\n` +
      `Latest observation: ` +
      `${formatWelfordNumber(x)}\n` +
      `Running mean: ` +
      `${formatWelfordNumber(state.mean)}\n` +
      `Sum of Squares (M2): ` +
      `${formatWelfordNumber(state.M2)}\n` +
      `Sample variance: ` +
      `${formatWelfordNumber(variance)}\n\n` +
      (
        remaining === 0
          ? "Sequence completed."
          : "Ready for the next observation."
      );

    updateVerification();
    updateButtons();
  }

  nextButton.addEventListener(
    "click",
    processNextObservation
  );

  runAllButton.addEventListener("click", () => {
    if (!initializeSequence()) {
      return;
    }

    while (state.count < observations.length) {
      if (processNextObservation() === false) break;
    }
  });

  resetButton.addEventListener(
    "click",
    resetExperiment
  );

  // Changing input starts a new sequence.
  input.addEventListener("input", resetExperiment);
});



// HW 4 - Exercise 2: Sampling Simulation

const SAMPLING_POPULATION_MEAN = 5;
const SAMPLING_POPULATION_VARIANCE = 10;

let samplingTrajectoriesChartInstance = null;

// Store the latest simulation for later experiments.
window.hw4SamplingSimulation = null;

// Generate an integer score in {0, 1, ..., 10}.
function generatePenetrationScore() {
  return Math.floor(Math.random() * 11);
}

// Simulate m independent hackers, each with n scores.
function simulateSamplingExperiment(n, m) {
  const hackers = [];
  const displayedTrajectories = [];

  const displayedCount = Math.min(10, m);

  for (let hacker = 0; hacker < m; hacker++) {
    const state = createWelfordState();

    // Store individual scores only for
    // the hackers displayed in the graph.
    const trajectory = hacker < displayedCount
      ? []
      : null;

    for (let system = 1; system <= n; system++) {
      const score = generatePenetrationScore();

      // Reuse the Exercise 1 implementation.
      updateWelford(state, score);

      if (trajectory !== null) {
        trajectory.push({
          x: system,
          y: score
        });
      }
    }

    // n >= 2: unbiased sample variance.
    const sampleVariance = state.M2 / (n - 1);

    hackers.push({
      id: hacker + 1,
      mean: state.mean,
      variance: sampleVariance
    });

    if (trajectory !== null) {
      displayedTrajectories.push(trajectory);
    }
  }

  return {
    n,
    m,
    totalAttempts: n * m,
    populationMean: SAMPLING_POPULATION_MEAN,
    populationVariance: SAMPLING_POPULATION_VARIANCE,
    hackers,
    displayedTrajectories
  };
}

function drawSamplingTrajectories(simulation) {
  if (samplingTrajectoriesChartInstance) {
    samplingTrajectoriesChartInstance.destroy();
  }

  const datasets = simulation.displayedTrajectories.map(
    (trajectory, index) => ({
      label: `Hacker ${index + 1}`,
      data: trajectory,
      borderColor:
        `hsl(${index * 360 / 10}, 65%, 45%)`,
      borderWidth: 1.3,
      pointRadius: simulation.n <= 30 ? 2 : 0,
      tension: 0
    })
  );

  samplingTrajectoriesChartInstance = new Chart(
    document.getElementById(
      "samplingTrajectoriesChart"
    ),
    {
      type: "line",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        plugins: {
          title: {
            display: true,
            text: "Penetration Scores by Hacker"
          },
          legend: {
            display: true,
            position: "bottom"
          }
        },
        scales: {
          x: {
            type: "linear",
            title: {
              display: true,
              text: "System Number"
            }
          },
          y: {
            min: 0,
            max: 10,
            ticks: {
              stepSize: 1
            },
            title: {
              display: true,
              text: "Penetration Score"
            }
          }
        }
      }
    }
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const nInput = document.getElementById(
    "samplingSystems"
  );

  const mInput = document.getElementById(
    "samplingHackers"
  );

  const button = document.getElementById(
    "runSamplingSimulationBtn"
  );

  const summary = document.getElementById(
    "samplingSimulationSummary"
  );

  const tableBody = document.getElementById(
    "samplingHackersTableBody"
  );

  button.addEventListener("click", () => {
    const rawN = nInput.value.trim();
    const rawM = mInput.value.trim();

    const n = Number(rawN);
    const m = Number(rawM);

    if (
      rawN === "" ||
      rawM === "" ||
      !Number.isInteger(n) ||
      !Number.isInteger(m) ||
      n < 2 || n > 1000 ||
      m < 1 || m > 1000
    ) {
      summary.textContent =
        "Enter an integer n between 2 and 1000 " +
        "and an integer m between 1 and 1000.";
      return;
    }

    button.disabled = true;
    summary.textContent =
      "Generating penetration scores...";

    try {
      const simulation = simulateSamplingExperiment(
        n, m
      );

      // Make the complete set of estimates
      // available to the next experiments.
      window.hw4SamplingSimulation = simulation;

      summary.textContent =
        `Distribution: Discrete Uniform {0,...,10}\n` +
        `Theoretical mean (mu): ` +
        `${simulation.populationMean}\n` +
        `Theoretical variance (sigma²): ` +
        `${simulation.populationVariance}\n\n` +
        `Systems per hacker (n): ${n}\n` +
        `Hackers (m): ${m}\n` +
        `Total penetration attempts: ` +
        `${simulation.totalAttempts}\n\n` +
        `Sample means calculated: ${m}\n` +
        `Sample variances calculated: ${m}\n` +
        `Algorithm: Welford's recurrence formulas\n` +
        `Sample variance denominator: n - 1`;

      // First 10 hackers in the table.
      tableBody.replaceChildren();

      for (const hacker of simulation.hackers.slice(0, 10)) {
        const row = document.createElement("tr");

        const values = [
          hacker.id,
          n,
          hacker.mean.toFixed(4),
          hacker.variance.toFixed(4)
        ];

        for (const value of values) {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.appendChild(cell);
        }

        tableBody.appendChild(row);
      }

      drawSamplingTrajectories(simulation);

    } catch (error) {
      window.hw4SamplingSimulation = null;

      summary.textContent =
        "Sampling simulation failed. " +
        "Check the browser console.";

      console.error(error);

    } finally {
      button.disabled = false;
    }
  });
});



// HW 4 - Exercise 2: Sampling Statistics Analysis

const samplingAnalysisCharts = {
  means: null,
  variances: null
};

// Descriptive mean of the m hacker estimates.
function samplingAverage(values) {
  return values.reduce((sum, x) => sum + x, 0) /
    values.length;
}

// Descriptive standard deviation across hackers.
function samplingStandardDeviation(values) {
  const mean = samplingAverage(values);

  const variance = values.reduce(
    (sum, x) => sum + (x - mean) ** 2,
    0
  ) / values.length;

  return Math.sqrt(variance);
}

// Analyze the estimates produced by Welford.
function analyzeSamplingStatistics(simulation) {
  const sampleMeans = simulation.hackers.map(
    hacker => hacker.mean
  );

  const sampleVariances = simulation.hackers.map(
    hacker => hacker.variance
  );

  const averageMean = samplingAverage(sampleMeans);
  const averageVariance = samplingAverage(
    sampleVariances
  );

  const mu = simulation.populationMean;
  const sigma2 = simulation.populationVariance;

  return {
    n: simulation.n,
    m: simulation.m,
    sampleMeans,
    sampleVariances,
    averageMean,
    averageVariance,
    meanAbsoluteError: Math.abs(averageMean - mu),
    varianceAbsoluteError: Math.abs(
      averageVariance - sigma2
    ),
    meanEstimatorSD:
      samplingStandardDeviation(sampleMeans),
    varianceEstimatorSD:
      samplingStandardDeviation(sampleVariances),
    theoreticalMeanSD: Math.sqrt(
      sigma2 / simulation.n
    ),
    mu,
    sigma2
  };
}

// Construct equal-width frequency histogram bins.
function buildSamplingHistogram(
  values,
  minimum,
  maximum,
  binCount = 20
) {
  const width = (maximum - minimum) / binCount;
  const frequencies = Array(binCount).fill(0);

  for (const value of values) {
    const index = Math.min(
      binCount - 1,
      Math.max(
        0,
        Math.floor((value - minimum) / width)
      )
    );

    frequencies[index]++;
  }

  const centers = Array.from(
    { length: binCount },
    (_, i) => minimum + (i + 0.5) * width
  );

  return {
    centers,
    frequencies
  };
}

// Chart.js plugin: vertical theoretical reference line.
const samplingReferenceLinePlugin = {
  id: "samplingReferenceLine",

  afterDatasetsDraw(chart, args, options) {
    const xScale = chart.scales.x;
    const area = chart.chartArea;

    if (!xScale || !area) {
      return;
    }

    const x = xScale.getPixelForValue(options.value);

    if (!Number.isFinite(x)) {
      return;
    }

    const ctx = chart.ctx;

    ctx.save();
    ctx.beginPath();
    ctx.rect(
      area.left,
      area.top,
      area.right - area.left,
      area.bottom - area.top
    );
    ctx.clip();

    ctx.beginPath();
    ctx.moveTo(x, area.top);
    ctx.lineTo(x, area.bottom);

    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 5]);
    ctx.stroke();

    ctx.restore();
  }
};

// Draw a frequency histogram and theoretical reference.
function drawSamplingHistogram(
  canvasId,
  chartKey,
  values,
  theoreticalValue,
  title,
  minimum,
  maximum
) {
  if (samplingAnalysisCharts[chartKey]) {
    samplingAnalysisCharts[chartKey].destroy();
  }

  const histogram = buildSamplingHistogram(
    values,
    minimum,
    maximum
  );

  samplingAnalysisCharts[chartKey] = new Chart(
    document.getElementById(canvasId),
    {
      type: "bar",

      data: {
        datasets: [{
          label: "Hacker Estimates",
          data: histogram.centers.map(
            (center, index) => ({
              x: center,
              y: histogram.frequencies[index]
            })
          ),
          backgroundColor: "#2563eb",
          hoverBackgroundColor: "#1d4ed8",
          barPercentage: 1,
          categoryPercentage: 1
        }]
      },

      plugins: [samplingReferenceLinePlugin],

      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,

        plugins: {
          title: {
            display: true,
            text: title
          },

          samplingReferenceLine: {
            value: theoreticalValue
          }
        },

        scales: {
          x: {
            type: "linear",
            min: minimum,
            max: maximum,
            title: {
              display: true,
              text: chartKey === "means"
                ? "Sample Mean"
                : "Sample Variance"
            }
          },

          y: {
            beginAtZero: true,
            ticks: {
              precision: 0
            },
            title: {
              display: true,
              text: "Number of Hackers"
            }
          }
        }
      }
    }
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById(
    "analyzeSamplingBtn"
  );

  const summary = document.getElementById(
    "samplingAnalysisSummary"
  );

  const tableBody = document.getElementById(
    "samplingAnalysisTableBody"
  );

  // Clear outdated analysis when a new simulation runs.
  document.getElementById(
    "runSamplingSimulationBtn"
  ).addEventListener("click", () => {
    summary.textContent =
      "Run Analyze Sampling Statistics " +
      "to inspect the latest simulation.";

    tableBody.replaceChildren();

    for (const key of ["means", "variances"]) {
      if (samplingAnalysisCharts[key]) {
        samplingAnalysisCharts[key].destroy();
        samplingAnalysisCharts[key] = null;
      }
    }
  });

  button.addEventListener("click", () => {
    const simulation = window.hw4SamplingSimulation;

    if (!simulation) {
      summary.textContent =
        "Run the Sampling Simulation first.";
      return;
    }

    const result = analyzeSamplingStatistics(
      simulation
    );

    summary.textContent =
      `Distribution: Discrete Uniform {0,...,10}\n` +
      `Systems per hacker (n): ${result.n}\n` +
      `Hackers (m): ${result.m}\n\n` +

      `AVERAGE OF SAMPLE MEANS\n` +
      `Empirical: ${result.averageMean.toFixed(6)}\n` +
      `Theoretical mu: ${result.mu.toFixed(6)}\n` +
      `Absolute error: ` +
      `${result.meanAbsoluteError.toFixed(6)}\n` +
      `Empirical SD across hackers: ` +
      `${result.meanEstimatorSD.toFixed(6)}\n` +
      `Theoretical SD of sample mean: ` +
      `${result.theoreticalMeanSD.toFixed(6)}\n\n` +

      `AVERAGE OF SAMPLE VARIANCES\n` +
      `Empirical: ` +
      `${result.averageVariance.toFixed(6)}\n` +
      `Theoretical sigma²: ` +
      `${result.sigma2.toFixed(6)}\n` +
      `Absolute error: ` +
      `${result.varianceAbsoluteError.toFixed(6)}\n` +
      `Empirical SD across hackers: ` +
      `${result.varianceEstimatorSD.toFixed(6)}`;

    // Comparison table
    tableBody.replaceChildren();

    const rows = [
      [
        "Sample Mean",
        result.averageMean,
        result.mu,
        result.meanAbsoluteError,
        result.meanEstimatorSD
      ],
      [
        "Sample Variance",
        result.averageVariance,
        result.sigma2,
        result.varianceAbsoluteError,
        result.varianceEstimatorSD
      ]
    ];

    for (const values of rows) {
      const tr = document.createElement("tr");

      for (const value of values) {
        const td = document.createElement("td");

        td.textContent = typeof value === "number"
          ? value.toFixed(6)
          : value;

        tr.appendChild(td);
      }

      tableBody.appendChild(tr);
    }

    // Sample means lie between 0 and 10.
    drawSamplingHistogram(
      "samplingMeansChart",
      "means",
      result.sampleMeans,
      result.mu,
      "Sampling Distribution of the Mean",
      0,
      10
    );

    // Sample variances are non-negative.
    // Expand the axis if small samples yield
    // unusually large variance estimates.
    const maximumVariance = Math.max(
      20,
      result.sigma2 * 1.2,
      ...result.sampleVariances
    );

    drawSamplingHistogram(
      "samplingVariancesChart",
      "variances",
      result.sampleVariances,
      result.sigma2,
      "Sampling Distribution of the Variance",
      0,
      maximumVariance * 1.05
    );
  });
});


// HW 4 - Effect of Sample Size

const SAMPLE_SIZE_VALUES = [
  2, 5, 10, 20, 50, 100, 200, 500, 1000
];

const SAMPLING_FOURTH_CENTRAL_MOMENT = 178;

const sampleSizeChartInstances = {
  means: null,
  variances: null
};

// Theoretical SD of the sample mean.
function theoreticalSampleMeanSD(n) {
  return Math.sqrt(SAMPLING_POPULATION_VARIANCE / n);
}

// Theoretical SD of the unbiased sample variance.
// Valid for IID observations with finite 4th moment.
function theoreticalSampleVarianceSD(n) {
  const sigma2 = SAMPLING_POPULATION_VARIANCE;
  const sigma4 = sigma2 * sigma2;
  const mu4 = SAMPLING_FOURTH_CENTRAL_MOMENT;

  const variance = (
    mu4 - ((n - 3) / (n - 1)) * sigma4
  ) / n;

  return Math.sqrt(variance);
}

// Generate nested samples for all tested n.
function simulateSampleSizeExperiment(m) {
  const checkpoints = new Set(SAMPLE_SIZE_VALUES);

  const estimatesByN = new Map(
    SAMPLE_SIZE_VALUES.map(n => [
      n,
      { means: [], variances: [] }
    ])
  );

  const maxN = Math.max(...SAMPLE_SIZE_VALUES);

  for (let hacker = 0; hacker < m; hacker++) {
    const state = createWelfordState();

    for (let system = 1; system <= maxN; system++) {
      const score = generatePenetrationScore();

      updateWelford(state, score);

      if (checkpoints.has(system)) {
        const estimates = estimatesByN.get(system);

        estimates.means.push(state.mean);

        estimates.variances.push(
          state.M2 / (system - 1)
        );
      }
    }
  }

  return SAMPLE_SIZE_VALUES.map(n => {
    const estimates = estimatesByN.get(n);

    return {
      n,

      averageMean: samplingAverage(estimates.means),

      averageVariance:
        samplingAverage(estimates.variances),

      meanSDEmpirical:
        samplingStandardDeviation(estimates.means),

      meanSDTheoretical:
        theoreticalSampleMeanSD(n),

      varianceSDEmpirical:
        samplingStandardDeviation(estimates.variances),

      varianceSDTheoretical:
        theoreticalSampleVarianceSD(n)
    };
  });
}

// Compare empirical and theoretical SD curves.
function drawSampleSizeChart(
  canvasId,
  chartKey,
  rows,
  empiricalKey,
  theoreticalKey,
  title
) {
  if (sampleSizeChartInstances[chartKey]) {
    sampleSizeChartInstances[chartKey].destroy();
  }

  sampleSizeChartInstances[chartKey] = new Chart(
    document.getElementById(canvasId),
    {
      type: "line",

      data: {
        datasets: [
          {
            label: "Empirical SD",
            data: rows.map(row => ({
              x: row.n,
              y: row[empiricalKey]
            })),
            borderColor: "#2563eb",
            backgroundColor: "#2563eb",
            pointRadius: 5,
            tension: 0.15
          },
          {
            label: "Theoretical SD",
            data: rows.map(row => ({
              x: row.n,
              y: row[theoreticalKey]
            })),
            borderColor: "#f59e0b",
            borderDash: [7, 5],
            pointRadius: 3,
            tension: 0
          }
        ]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,

        plugins: {
          title: {
            display: true,
            text: title
          }
        },

        scales: {
          x: {
            type: "linear",
            title: {
              display: true,
              text: "Number of Systems (n)"
            }
          },

          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Standard Deviation"
            }
          }
        }
      }
    }
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const mInput = document.getElementById(
    "sampleSizeHackers"
  );

  const button = document.getElementById(
    "runSampleSizeExperimentBtn"
  );

  const summary = document.getElementById(
    "sampleSizeSummary"
  );

  const tableBody = document.getElementById(
    "sampleSizeResultsTableBody"
  );

  button.addEventListener("click", () => {
    const raw = mInput.value.trim();
    const m = Number(raw);

    if (
      raw === "" ||
      !Number.isInteger(m) ||
      m < 50 ||
      m > 1000
    ) {
      summary.textContent =
        "Enter an integer number of hackers " +
        "between 50 and 1000.";
      return;
    }

    button.disabled = true;

    summary.textContent =
      "Simulating repeated samples...";

    try {
      const rows = simulateSampleSizeExperiment(m);

      tableBody.replaceChildren();

      for (const result of rows) {
        const tr = document.createElement("tr");

        const values = [
          result.n,
          result.averageMean.toFixed(4),
          result.averageVariance.toFixed(4),
          result.meanSDEmpirical.toFixed(6),
          result.meanSDTheoretical.toFixed(6),
          result.varianceSDEmpirical.toFixed(6),
          result.varianceSDTheoretical.toFixed(6)
        ];

        for (const value of values) {
          const td = document.createElement("td");
          td.textContent = value;
          tr.appendChild(td);
        }

        tableBody.appendChild(tr);
      }

      drawSampleSizeChart(
        "sampleSizeMeansChart",
        "means",
        rows,
        "meanSDEmpirical",
        "meanSDTheoretical",
        "Variability of Sample Means"
      );

      drawSampleSizeChart(
        "sampleSizeVariancesChart",
        "variances",
        rows,
        "varianceSDEmpirical",
        "varianceSDTheoretical",
        "Variability of Sample Variances"
      );

      const first = rows[0];
      const last = rows[rows.length - 1];

      summary.textContent =
        `Distribution: Discrete Uniform {0,...,10}\n` +
        `Theoretical mean: 5\n` +
        `Theoretical variance: 10\n` +
        `Fourth central moment: 178\n\n` +

        `Hackers per sample size (m): ${m}\n` +
        `Sample sizes: ${SAMPLE_SIZE_VALUES.join(", ")}\n` +
        `Total generated scores: ${m * 1000}\n\n` +

        `SMALLEST SAMPLE (n = ${first.n})\n` +
        `Average sample mean: ` +
        `${first.averageMean.toFixed(4)}\n` +
        `Average sample variance: ` +
        `${first.averageVariance.toFixed(4)}\n` +
        `SD of sample means: ` +
        `${first.meanSDEmpirical.toFixed(6)}\n` +
        `SD of sample variances: ` +
        `${first.varianceSDEmpirical.toFixed(6)}\n\n` +

        `LARGEST SAMPLE (n = ${last.n})\n` +
        `Average sample mean: ` +
        `${last.averageMean.toFixed(4)}\n` +
        `Average sample variance: ` +
        `${last.averageVariance.toFixed(4)}\n` +
        `SD of sample means: ` +
        `${last.meanSDEmpirical.toFixed(6)}\n` +
        `SD of sample variances: ` +
        `${last.varianceSDEmpirical.toFixed(6)}\n\n` +

        `Estimator variability should decrease ` +
        `as n increases.`;

    } catch (error) {
      summary.textContent =
        "Sample size experiment failed. " +
        "Check the browser console.";

      console.error(error);

    } finally {
      button.disabled = false;
    }
  });
});
