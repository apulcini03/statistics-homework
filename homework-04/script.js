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
