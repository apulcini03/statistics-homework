
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
