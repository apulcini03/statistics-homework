// HW 3 - Stochastic Penetration Processes
// Bernoulli and Rademacher stochastic simulator

let stochasticTrajectoriesChartInstance = null;

// Shared simulation data for subsequent experiments
window.hw3Simulation = null;

// Generate one stochastic increment
function generateIncrement(model, p) {
  const u = Math.random();

  if (model === "bernoulli") {
    return u < p ? 1 : 0;
  }

  return u < 0.5 ? 1 : -1;
}

// Simulate m independent attacker trajectories
function simulateStochasticProcess(n, m, model, p) {
  const trajectories = [];
  const finalScores = [];
  const finalAverages = [];
  const finalNormalizedScores = [];

  for (let attacker = 0; attacker < m; attacker++) {
    let score = 0;

    // Each trajectory starts at S(0) = 0
    const trajectory = [0];

    for (let step = 1; step <= n; step++) {
      const increment = generateIncrement(model, p);

      score += increment;
      trajectory.push(score);
    }

    trajectories.push(trajectory);
    finalScores.push(score);
    finalAverages.push(score / n);
    finalNormalizedScores.push(score / Math.sqrt(n));
  }

  return {
    n,
    m,
    model,
    p,
    trajectories,
    finalScores,
    finalAverages,
    finalNormalizedScores
  };
}

// Basic descriptive statistics
function stochasticMean(values) {
  return values.reduce((a, b) => a + b, 0)
    / values.length;
}

function stochasticVariance(values) {
  const mean = stochasticMean(values);

  return values.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0
  ) / values.length;
}

// Mathematical expectation and variance
function stochasticParameters(model, p) {
  if (model === "bernoulli") {
    return {
      mean: p,
      variance: p * (1 - p)
    };
  }

  return {
    mean: 0,
    variance: 1
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const modelInput = document.getElementById(
    "stochasticModel"
  );

  const systemsInput = document.getElementById(
    "stochasticSystems"
  );

  const attackersInput = document.getElementById(
    "stochasticAttackers"
  );

  const probabilityInput = document.getElementById(
    "stochasticProbability"
  );

  const probabilityGroup = document.getElementById(
    "bernoulliProbabilityGroup"
  );

  const button = document.getElementById(
    "runStochasticSimulationBtn"
  );

  const summary = document.getElementById(
    "stochasticSimulationSummary"
  );

  function updateProbabilityVisibility() {
    probabilityGroup.hidden =
      modelInput.value !== "bernoulli";

    probabilityInput.disabled =
      modelInput.value !== "bernoulli";
  }

  modelInput.addEventListener(
    "change",
    updateProbabilityVisibility
  );

  updateProbabilityVisibility();

  button.addEventListener("click", () => {
    const n = Number(systemsInput.value);
    const m = Number(attackersInput.value);
    const model = modelInput.value;
    const p = Number(probabilityInput.value);

    const validN =
      systemsInput.value.trim() !== "" &&
      Number.isInteger(n) &&
      n >= 1 && n <= 1000;

    const validM =
      attackersInput.value.trim() !== "" &&
      Number.isInteger(m) &&
      m >= 1 && m <= 2000;

    const validP =
      probabilityInput.value.trim() !== "" &&
      Number.isFinite(p) &&
      p >= 0 && p <= 1;

    if (
      !validN ||
      !validM ||
      (model === "bernoulli" && !validP)
    ) {
      summary.textContent =
        "Invalid parameters. Use n = 1–1000, " +
        "m = 1–2000 and Bernoulli p = 0–1.";
      return;
    }

    button.disabled = true;
    summary.textContent = "Generating trajectories...";

    try {
      const effectiveP =
        model === "rademacher" ? 0.5 : p;

      const simulation = simulateStochasticProcess(
        n, m, model, effectiveP
      );

      // Data shared by all subsequent analyses
      window.hw3Simulation = simulation;

      const parameters = stochasticParameters(
        model, effectiveP
      );

      const meanTotal = stochasticMean(
        simulation.finalScores
      );

      const varianceTotal = stochasticVariance(
        simulation.finalScores
      );

      const meanAverage = stochasticMean(
        simulation.finalAverages
      );

      const meanNormalized = stochasticMean(
        simulation.finalNormalizedScores
      );

      const expectedTotal = n * parameters.mean;
      const expectedVariance = n * parameters.variance;

      summary.textContent =
        `Model: ${model}\n` +
        `Systems (n): ${n}\n` +
        `Attackers (m): ${m}\n` +
        `Success probability: ${effectiveP}\n\n` +
        `Expected increment E[X]: ${parameters.mean.toFixed(4)}\n` +
        `Expected increment Var(X): ${parameters.variance.toFixed(4)}\n\n` +
        `Empirical mean of S(n): ${meanTotal.toFixed(4)}\n` +
        `Theoretical E[S(n)]: ${expectedTotal.toFixed(4)}\n\n` +
        `Empirical variance of S(n): ${varianceTotal.toFixed(4)}\n` +
        `Theoretical Var(S(n)): ${expectedVariance.toFixed(4)}\n\n` +
        `Empirical mean of S(n)/n: ${meanAverage.toFixed(4)}\n` +
        `Empirical mean of S(n)/sqrt(n): ` +
        `${meanNormalized.toFixed(4)}`;

      // Show up to 30 trajectories.
      // Choose evenly spaced attacker indices.
      const visible = Math.min(m, 30);
      const datasets = [];

      for (let j = 0; j < visible; j++) {
        const index = Math.floor(j * m / visible);

        const hue = Math.round(j * 360 / visible);

        datasets.push({
          label: `Attacker ${index + 1}`,
          data: simulation.trajectories[index],
          borderColor: `hsl(${hue}, 65%, 48%)`,
          borderWidth: 1.6,
          pointRadius: 0,
          tension: 0,
          fill: false
        });
      }

      // Replace previous chart safely
      if (stochasticTrajectoriesChartInstance) {
        stochasticTrajectoriesChartInstance.destroy();
      }

      stochasticTrajectoriesChartInstance = new Chart(
        document.getElementById(
          "stochasticTrajectoriesChart"
        ),
        {
          type: "line",
          data: {
            labels: Array.from(
              { length: n + 1 },
              (_, i) => i
            ),
            datasets
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
              mode: "nearest",
              intersect: false
            },
            plugins: {
              title: {
                display: true,
                text: "Cumulative Penetration Score"
              },
              legend: {
                display: false
              },
              tooltip: {
                enabled: true
              }
            },
            scales: {
              x: {
                title: {
                  display: true,
                  text: "Systems / Steps"
                },
                ticks: {
                  maxTicksLimit: 11
                }
              },
              y: {
                title: {
                  display: true,
                  text: "Cumulative Score S(k)"
                }
              }
            }
          }
        }
      );

    } catch (error) {
      summary.textContent =
        "Simulation failed. Check the console.";
      console.error(error);

    } finally {
      button.disabled = false;
    }
  });
});



// HW 3 - Score Distribution Analysis

const scoreDistributionCharts = {
  total: null,
  average: null,
  normalized: null
};

// Construct common bins from the integer total scores
function buildScoreHistogram(scores) {
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  const range = max - min + 1;
  const binCount = Math.min(20, range);
  const binWidth = range / binCount;

  const frequencies = Array(binCount).fill(0);

  for (const score of scores) {
    const index = Math.min(
      binCount - 1,
      Math.floor((score - min) / binWidth)
    );

    frequencies[index]++;
  }

  // Centers of the intervals on the total-score scale
  const centers = Array.from(
    { length: binCount },
    (_, i) => min + (i + 0.5) * binWidth
  );

  return { frequencies, centers };
}

// Draw one histogram for the chosen score normalization
function drawScoreHistogram(canvasId, chartKey, data) {
  if (scoreDistributionCharts[chartKey]) {
    scoreDistributionCharts[chartKey].destroy();
  }

  scoreDistributionCharts[chartKey] = new Chart(
    document.getElementById(canvasId),
    {
      type: "bar",
      data: {
        labels: data.labels,
        datasets: [{
          label: "Number of Attackers",
          data: data.frequencies,
          backgroundColor: data.color,
          hoverBackgroundColor: "#1d4ed8",
          barPercentage: 1,
          categoryPercentage: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          title: {
            display: true,
            text: data.title
          },
          tooltip: {
            enabled: true
          },
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: data.xTitle
            },
            ticks: {
              maxTicksLimit: 10,
              maxRotation: 45
            }
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Number of Attackers"
            },
            ticks: {
              precision: 0
            }
          }
        }
      }
    }
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById(
    "analyzeScoreDistributionsBtn"
  );

  const summary = document.getElementById(
    "scoreDistributionSummary"
  );

  const tableBody = document.getElementById(
    "scoreDistributionTableBody"
  );

  button.addEventListener("click", () => {
    const simulation = window.hw3Simulation;

    if (!simulation) {
      summary.textContent =
        "Run the stochastic simulation first.";
      return;
    }

    button.disabled = true;

    try {
      const {
        n, m, model, p,
        finalScores,
        finalAverages,
        finalNormalizedScores
      } = simulation;

      const { mean: mu, variance: sigma2 } =
        stochasticParameters(model, p);

      const quantities = [
        {
          name: "S(n)",
          values: finalScores,
          expectedMean: n * mu,
          expectedVariance: n * sigma2
        },
        {
          name: "S(n)/n",
          values: finalAverages,
          expectedMean: mu,
          expectedVariance: sigma2 / n
        },
        {
          name: "S(n)/sqrt(n)",
          values: finalNormalizedScores,
          expectedMean: Math.sqrt(n) * mu,
          expectedVariance: sigma2
        }
      ];

      summary.textContent =
        `Model: ${model}\n` +
        `Systems (n): ${n}\n` +
        `Attackers (m): ${m}\n` +
        `Probability p: ${p}\n\n` +
        `All three histograms use the same ` +
        `${m} simulated attacker outcomes.`;

      // Populate statistics table
      tableBody.replaceChildren();

      for (const quantity of quantities) {
        const row = document.createElement("tr");

        const cells = [
          quantity.name,
          stochasticMean(quantity.values).toFixed(4),
          quantity.expectedMean.toFixed(4),
          stochasticVariance(quantity.values).toFixed(4),
          quantity.expectedVariance.toFixed(4)
        ];

        for (const value of cells) {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.appendChild(cell);
        }

        tableBody.appendChild(row);
      }

      // Common bins based on S(n)
      const { frequencies, centers } =
        buildScoreHistogram(finalScores);

      // Histogram 1: total score
      drawScoreHistogram(
        "totalScoreDistributionChart",
        "total",
        {
          labels: centers.map(x => x.toFixed(1)),
          frequencies,
          color: "#2563eb",
          title: "Total Score Distribution",
          xTitle: "Total Score S(n)"
        }
      );

      // Histogram 2: average score
      drawScoreHistogram(
        "averageScoreDistributionChart",
        "average",
        {
          labels: centers.map(
            x => (x / n).toFixed(3)
          ),
          frequencies,
          color: "#0d9488",
          title: "Average Score Distribution",
          xTitle: "Average Score S(n)/n"
        }
      );

      // Histogram 3: normalized total
      drawScoreHistogram(
        "normalizedScoreDistributionChart",
        "normalized",
        {
          labels: centers.map(
            x => (x / Math.sqrt(n)).toFixed(2)
          ),
          frequencies,
          color: "#9333ea",
          title: "Normalized Total Score Distribution",
          xTitle: "Normalized Score S(n)/sqrt(n)"
        }
      );

    } catch (error) {
      summary.textContent =
        "Distribution analysis failed.";
      console.error(error);

    } finally {
      button.disabled = false;
    }
  });
});



// HW 3 - Law of Large Numbers Experiment

let llnTrajectoriesChartInstance = null;
let llnProbabilityChartInstance = null;

function llnCheckpoints(maxN) {
  const proposed = [
    10, 25, 50, 100, 250, 500,
    750, 1000, 1500, 2000
  ];

  return [...new Set([
    ...proposed.filter(n => n <= maxN),
    maxN
  ])].sort((a, b) => a - b);
}

function runLlnSimulation(maxN, m, model, p, epsilon) {
  const checkpoints = llnCheckpoints(maxN);
  const checkpointSet = new Set(checkpoints);

  const averagesByN = new Map(
    checkpoints.map(n => [n, []])
  );

  const displayedTrajectories = [];
  const mu = stochasticParameters(model, p).mean;

  for (let attacker = 0; attacker < m; attacker++) {
    let total = 0;

    const showTrajectory = attacker < 15;
    const trajectory = showTrajectory
      ? [{ x: 1, y: null }]
      : null;

    for (let step = 1; step <= maxN; step++) {
      total += generateIncrement(model, p);

      const average = total / step;

      if (showTrajectory) {
        trajectory.push({
          x: step,
          y: average
        });
      }

      if (checkpointSet.has(step)) {
        averagesByN.get(step).push(average);
      }
    }

    if (showTrajectory) {
      // Remove the placeholder point.
      displayedTrajectories.push(
        trajectory.slice(1)
      );
    }
  }

  const sigma2 =
    stochasticParameters(model, p).variance;

  const results = checkpoints.map(n => {
    const averages = averagesByN.get(n);

    const deviations = averages.filter(
      average => Math.abs(average - mu) > epsilon
    ).length;

    const theoreticalVariance = sigma2 / n;

    const chebyshevBound = Math.min(
      1,
      theoreticalVariance / (epsilon ** 2)
    );

    return {
      n,
      empiricalMean: stochasticMean(averages),
      empiricalVariance: stochasticVariance(averages),
      theoreticalVariance,
      deviationRate: deviations / m,
      chebyshevBound
    };
  });

  return {
    model,
    p,
    mu,
    maxN,
    m,
    epsilon,
    results,
    displayedTrajectories
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const nInput = document.getElementById("llnMaxSystems");
  const mInput = document.getElementById("llnAttackers");
  const epsilonInput = document.getElementById("llnEpsilon");

  const button = document.getElementById(
    "runLlnExperimentBtn"
  );

  const summary = document.getElementById(
    "llnSummary"
  );

  const tableBody = document.getElementById(
    "llnTableBody"
  );

  button.addEventListener("click", () => {
    const baseSimulation = window.hw3Simulation;

    if (!baseSimulation) {
      summary.textContent =
        "Run the stochastic simulator first " +
        "to select the probability model.";
      return;
    }

    const n = Number(nInput.value);
    const m = Number(mInput.value);
    const epsilon = Number(epsilonInput.value);

    if (
      nInput.value.trim() === "" ||
      mInput.value.trim() === "" ||
      epsilonInput.value.trim() === "" ||
      !Number.isInteger(n) || n < 100 || n > 2000 ||
      !Number.isInteger(m) || m < 50 || m > 1000 ||
      !Number.isFinite(epsilon) ||
      epsilon < 0.01 || epsilon > 1
    ) {
      summary.textContent =
        "Use n = 100–2000, m = 50–1000, " +
        "and epsilon = 0.01–1.";
      return;
    }

    button.disabled = true;
    summary.textContent =
      "Simulating convergence of sample averages...";

    try {
      const { model, p } = baseSimulation;

      const experiment = runLlnSimulation(
        n, m, model, p, epsilon
      );

      const last = experiment.results.at(-1);

      summary.textContent =
        `Model: ${model}\n` +
        `Probability parameter: ${p}\n` +
        `Maximum systems: ${n}\n` +
        `Attackers: ${m}\n` +
        `Deviation threshold: ${epsilon}\n` +
        `Expected increment E[X]: ` +
        `${experiment.mu.toFixed(4)}\n\n` +
        `At n = ${last.n}:\n` +
        `Empirical mean of averages: ` +
        `${last.empiricalMean.toFixed(4)}\n` +
        `Empirical variance: ` +
        `${last.empiricalVariance.toFixed(6)}\n` +
        `Theoretical variance: ` +
        `${last.theoreticalVariance.toFixed(6)}\n` +
        `Empirical deviation rate: ` +
        `${(last.deviationRate * 100).toFixed(2)}%`;

      // Populate comparison table
      tableBody.replaceChildren();

      for (const row of experiment.results) {
        const tr = document.createElement("tr");

        const values = [
          row.n,
          row.empiricalMean.toFixed(4),
          row.empiricalVariance.toFixed(6),
          row.theoreticalVariance.toFixed(6),
          `${(row.deviationRate * 100).toFixed(2)}%`
        ];

        values.forEach(value => {
          const td = document.createElement("td");
          td.textContent = value;
          tr.appendChild(td);
        });

        tableBody.appendChild(tr);
      }

      // Chart 1 - Running averages
      if (llnTrajectoriesChartInstance) {
        llnTrajectoriesChartInstance.destroy();
      }

      const trajectoryDatasets =
        experiment.displayedTrajectories.map(
          (points, index) => ({
            label: `Attacker ${index + 1}`,
            data: points,
            borderColor:
              `hsl(${index * 360 / 15}, 65%, 45%)`,
            borderWidth: 1.2,
            pointRadius: 0,
            tension: 0
          })
        );

      trajectoryDatasets.push({
        label: "Theoretical mean",
        data: [
          { x: 1, y: experiment.mu },
          { x: n, y: experiment.mu }
        ],
        borderColor: "#f59e0b",
        borderWidth: 3,
        borderDash: [8, 5],
        pointRadius: 0
      });

      llnTrajectoriesChartInstance = new Chart(
        document.getElementById(
          "llnTrajectoriesChart"
        ),
        {
          type: "line",
          data: { datasets: trajectoryDatasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            parsing: false,
            plugins: {
              title: {
                display: true,
                text: "Running Averages S(k)/k"
              },
              legend: {
                display: false
              }
            },
            scales: {
              x: {
                type: "linear",
                title: {
                  display: true,
                  text: "Systems (k)"
                }
              },
              y: {
                title: {
                  display: true,
                  text: "Average Score"
                }
              }
            }
          }
        }
      );

      // Chart 2 - Empirical probability of deviation
      if (llnProbabilityChartInstance) {
        llnProbabilityChartInstance.destroy();
      }

      llnProbabilityChartInstance = new Chart(
        document.getElementById(
          "llnProbabilityChart"
        ),
        {
          type: "line",
          data: {
            datasets: [
              {
                label: "Empirical Deviation Rate",
                data: experiment.results.map(r => ({
                  x: r.n,
                  y: r.deviationRate * 100
                })),
                borderColor: "#2563eb",
                backgroundColor: "#2563eb",
                pointRadius: 5,
                tension: 0.15
              },
              {
                label: "Chebyshev Upper Bound",
                data: experiment.results.map(r => ({
                  x: r.n,
                  y: r.chebyshevBound * 100
                })),
                borderColor: "#f59e0b",
                borderDash: [7, 5],
                pointRadius: 0
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
                text: "Convergence in Probability"
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
                min: 0,
                max: 100,
                title: {
                  display: true,
                  text: "Deviation Probability (%)"
                }
              }
            }
          }
        }
      );

    } catch (error) {
      summary.textContent =
        "LLN experiment failed. Check the console.";
      console.error(error);

    } finally {
      button.disabled = false;
    }
  });
});



// HW 3 - Central Limit Theorem Experiment

const CLT_SYSTEM_VALUES = [
  10, 25, 50, 100, 250, 500, 1000
];

const CLT_BIN_WIDTH = 0.25;
const CLT_MIN = -4;
const CLT_MAX = 4;

let cltExperimentData = null;
let cltDistributionChartInstance = null;

// Standard normal probability density function
function cltNormalPdf(x) {
  return Math.exp(-0.5 * x * x) /
    Math.sqrt(2 * Math.PI);
}

// Generate Rademacher normalized sums
function simulateCltExperiment(m) {
  const results = new Map();

  for (const n of CLT_SYSTEM_VALUES) {
    results.set(n, []);
  }

  // Each attacker follows a single trajectory
  // up to the largest tested number of systems.
  for (let attacker = 0; attacker < m; attacker++) {
    let score = 0;

    for (let step = 1; step <= 1000; step++) {
      score += generateIncrement("rademacher", 0.5);

      if (results.has(step)) {
        results.get(step).push(
          score / Math.sqrt(step)
        );
      }
    }
  }

  return results;
}

// Empirical density histogram for normalized scores
function buildCltHistogram(values) {
  const binCount =
    Math.round((CLT_MAX - CLT_MIN) / CLT_BIN_WIDTH);

  const counts = Array(binCount).fill(0);
  let outsideCount = 0;

  for (const value of values) {
    if (value < CLT_MIN || value >= CLT_MAX) {
      outsideCount++;
      continue;
    }

    const index = Math.floor(
      (value - CLT_MIN) / CLT_BIN_WIDTH
    );

    counts[index]++;
  }

  const centers = Array.from(
    { length: binCount },
    (_, i) => CLT_MIN + (i + 0.5) * CLT_BIN_WIDTH
  );

  // Divide by ALL m observations, not only
  // those inside the displayed interval.
  const density = counts.map(
    count => count / (values.length * CLT_BIN_WIDTH)
  );

  return {
    centers,
    density,
    outsideCount
  };
}

// Summarize a normalized-score sample
function cltStatistics(values) {
  const m = values.length;

  return {
    mean: stochasticMean(values),
    variance: stochasticVariance(values),

    withinOne: values.filter(
      value => Math.abs(value) <= 1
    ).length / m,

    withinTwo: values.filter(
      value => Math.abs(value) <= 2
    ).length / m
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const mInput = document.getElementById(
    "cltAttackers"
  );

  const runButton = document.getElementById(
    "runCltExperimentBtn"
  );

  const nSelect = document.getElementById(
    "cltSelectedN"
  );

  const summary = document.getElementById(
    "cltSummary"
  );

  const tableBody = document.getElementById(
    "cltResultsTableBody"
  );

  function updateCltChart() {
    if (!cltExperimentData) {
      return;
    }

    const n = Number(nSelect.value);
    const values = cltExperimentData.get(n);

    const histogram = buildCltHistogram(values);

    const theoreticalDensity =
      histogram.centers.map(cltNormalPdf);

    if (cltDistributionChartInstance) {
      cltDistributionChartInstance.destroy();
    }

    cltDistributionChartInstance = new Chart(
      document.getElementById(
        "cltDistributionChart"
      ),
      {
        data: {
          labels: histogram.centers.map(
            value => value.toFixed(2)
          ),
          datasets: [
            {
              type: "bar",
              label: "Empirical Density",
              data: histogram.density,
              backgroundColor: "#2563eb",
              hoverBackgroundColor: "#1d4ed8",
              order: 2,
              barPercentage: 1,
              categoryPercentage: 1
            },
            {
              type: "line",
              label: "Standard Normal N(0,1)",
              data: theoreticalDensity,
              borderColor: "#f59e0b",
              backgroundColor: "#f59e0b",
              borderWidth: 3,
              pointRadius: 0,
              tension: 0.25,
              order: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            title: {
              display: true,
              text:
                `Rademacher CLT — n = ${n}, ` +
                `m = ${values.length}`
            },
            tooltip: {
              enabled: true
            }
          },
          scales: {
            x: {
              title: {
                display: true,
                text: "Normalized Score S(n)/sqrt(n)"
              },
              ticks: {
                maxTicksLimit: 9,
                maxRotation: 0
              }
            },
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: "Probability Density"
              }
            }
          }
        }
      }
    );

    const stats = cltStatistics(values);

    summary.textContent =
      `Model: Rademacher\n` +
      `Attackers (m): ${values.length}\n` +
      `Systems currently displayed: ${n}\n\n` +
      `Empirical mean: ${stats.mean.toFixed(4)}\n` +
      `Theoretical mean: 0\n\n` +
      `Empirical variance: ${stats.variance.toFixed(4)}\n` +
      `Theoretical variance: 1\n\n` +
      `P(|Z| <= 1): ${(stats.withinOne * 100).toFixed(2)}%\n` +
      `Normal reference: approximately 68.27%\n\n` +
      `P(|Z| <= 2): ${(stats.withinTwo * 100).toFixed(2)}%\n` +
      `Normal reference: approximately 95.45%\n\n` +
      `Observations outside [-4, 4): ` +
      `${histogram.outsideCount}`;
  }

  runButton.addEventListener("click", () => {
    const raw = mInput.value.trim();
    const m = Number(raw);

    if (
      raw === "" ||
      !Number.isInteger(m) ||
      m < 100 ||
      m > 2000
    ) {
      summary.textContent =
        "Enter an integer number of attackers " +
        "between 100 and 2000.";
      return;
    }

    runButton.disabled = true;
    nSelect.disabled = true;

    summary.textContent =
      "Generating Rademacher trajectories...";

    try {
      cltExperimentData = simulateCltExperiment(m);

      tableBody.replaceChildren();

      for (const n of CLT_SYSTEM_VALUES) {
        const values = cltExperimentData.get(n);
        const stats = cltStatistics(values);

        const row = document.createElement("tr");

        const cells = [
          n,
          stats.mean.toFixed(4),
          stats.variance.toFixed(4),
          `${(stats.withinOne * 100).toFixed(2)}%`,
          `${(stats.withinTwo * 100).toFixed(2)}%`
        ];

        for (const value of cells) {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.appendChild(cell);
        }

        tableBody.appendChild(row);
      }

      nSelect.disabled = false;
      nSelect.value = "1000";

      updateCltChart();

    } catch (error) {
      summary.textContent =
        "CLT experiment failed. Check the console.";
      console.error(error);

    } finally {
      runButton.disabled = false;
    }
  });

  // Change n without generating new samples
  nSelect.addEventListener("change", updateCltChart);
});



// HW 3 - Variance and Scaling Analysis

const VARIANCE_SYSTEM_VALUES = [
  10, 25, 50, 100, 250, 500, 1000
];

const varianceChartInstances = {
  total: null,
  average: null,
  normalized: null
};

// Simulate all tested n using the same
// underlying trajectories for each attacker.
function runVarianceSimulation(m, model, p) {
  const scoresByN = new Map(
    VARIANCE_SYSTEM_VALUES.map(n => [n, []])
  );

  const checkpointSet = new Set(VARIANCE_SYSTEM_VALUES);
  const maxN = Math.max(...VARIANCE_SYSTEM_VALUES);

  for (let attacker = 0; attacker < m; attacker++) {
    let total = 0;

    for (let step = 1; step <= maxN; step++) {
      total += generateIncrement(model, p);

      if (checkpointSet.has(step)) {
        scoresByN.get(step).push(total);
      }
    }
  }

  const sigma2 =
    stochasticParameters(model, p).variance;

  return VARIANCE_SYSTEM_VALUES.map(n => {
    const totals = scoresByN.get(n);

    // Use the same sample of attackers
    // for all three transformations.
    const empiricalTotal = stochasticVariance(totals);

    const theoreticalTotal = n * sigma2;

    return {
      n,

      totalEmpirical: empiricalTotal,
      totalTheoretical: theoreticalTotal,

      averageEmpirical: empiricalTotal / (n * n),
      averageTheoretical: sigma2 / n,

      normalizedEmpirical: empiricalTotal / n,
      normalizedTheoretical: sigma2
    };
  });
}

// Draw empirical and theoretical variance curves
function drawVarianceChart(canvasId, key, rows, config) {
  if (varianceChartInstances[key]) {
    varianceChartInstances[key].destroy();
  }

  varianceChartInstances[key] = new Chart(
    document.getElementById(canvasId),
    {
      type: "line",
      data: {
        datasets: [
          {
            label: "Empirical Variance",
            data: rows.map(row => ({
              x: row.n,
              y: row[config.empiricalKey]
            })),
            borderColor: "#2563eb",
            backgroundColor: "#2563eb",
            pointRadius: 5,
            tension: 0.15
          },
          {
            label: "Theoretical Variance",
            data: rows.map(row => ({
              x: row.n,
              y: row[config.theoreticalKey]
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
            text: config.title
          },
          tooltip: {
            enabled: true
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
              text: "Variance"
            }
          }
        }
      }
    }
  );
}

document.addEventListener("DOMContentLoaded", () => {
  const mInput = document.getElementById(
    "varianceAttackers"
  );

  const button = document.getElementById(
    "runVarianceExperimentBtn"
  );

  const summary = document.getElementById(
    "varianceSummary"
  );

  const tableBody = document.getElementById(
    "varianceResultsTableBody"
  );

  button.addEventListener("click", () => {
    // Reuse model parameters chosen in Part 2.
    const baseSimulation = window.hw3Simulation;

    if (!baseSimulation) {
      summary.textContent =
        "Run the main stochastic simulator first " +
        "to select the model and its parameters.";
      return;
    }

    const raw = mInput.value.trim();
    const m = Number(raw);

    if (
      raw === "" ||
      !Number.isInteger(m) ||
      m < 100 ||
      m > 1500
    ) {
      summary.textContent =
        "Enter an integer number of attackers " +
        "between 100 and 1500.";
      return;
    }

    button.disabled = true;

    summary.textContent =
      "Computing empirical and theoretical variances...";

    try {
      const { model, p } = baseSimulation;

      const parameters = stochasticParameters(model, p);

      const rows = runVarianceSimulation(m, model, p);

      summary.textContent =
        `Model: ${model}\n` +
        `Probability parameter: ${p}\n` +
        `Attackers (m): ${m}\n` +
        `Increment variance sigma²: ` +
        `${parameters.variance.toFixed(4)}\n\n` +
        `Theoretical scaling laws:\n` +
        `Var(S(n)) = n * sigma²\n` +
        `Var(S(n)/n) = sigma² / n\n` +
        `Var(S(n)/sqrt(n)) = sigma²\n\n` +
        `System sizes: ` +
        `${VARIANCE_SYSTEM_VALUES.join(", ")}`;

      // Update the statistics table.
      tableBody.replaceChildren();

      for (const row of rows) {
        const tr = document.createElement("tr");

        const values = [
          row.n,
          row.totalEmpirical.toFixed(6),
          row.totalTheoretical.toFixed(6),
          row.averageEmpirical.toFixed(6),
          row.averageTheoretical.toFixed(6),
          row.normalizedEmpirical.toFixed(6),
          row.normalizedTheoretical.toFixed(6)
        ];

        for (const value of values) {
          const td = document.createElement("td");
          td.textContent = value;
          tr.appendChild(td);
        }

        tableBody.appendChild(tr);
      }

      // Chart 1 - Total score
      drawVarianceChart(
        "varianceTotalChart",
        "total",
        rows,
        {
          empiricalKey: "totalEmpirical",
          theoreticalKey: "totalTheoretical",
          title: "Total Score Variance: n * sigma²"
        }
      );

      // Chart 2 - Average score
      drawVarianceChart(
        "varianceAverageChart",
        "average",
        rows,
        {
          empiricalKey: "averageEmpirical",
          theoreticalKey: "averageTheoretical",
          title: "Average Score Variance: sigma² / n"
        }
      );

      // Chart 3 - Normalized score
      drawVarianceChart(
        "varianceNormalizedChart",
        "normalized",
        rows,
        {
          empiricalKey: "normalizedEmpirical",
          theoreticalKey: "normalizedTheoretical",
          title: "Normalized Total Variance: sigma²"
        }
      );

    } catch (error) {
      summary.textContent =
        "Variance experiment failed. Check the console.";
      console.error(error);

    } finally {
      button.disabled = false;
    }
  });
});
