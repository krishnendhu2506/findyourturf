(() => {
  const $ = (selector) => document.querySelector(selector);

  const els = {
    csvFile: $("#csvFile"),
    parseCsvBtn: $("#parseCsvBtn"),
    csvStatus: $("#csvStatus"),
    jsonInput: $("#jsonInput"),
    parseJsonBtn: $("#parseJsonBtn"),
    jsonStatus: $("#jsonStatus"),
    loadSampleBtn: $("#loadSampleBtn"),
    resetBtn: $("#resetBtn"),
    summaryCounts: $("#summaryCounts"),
    metricCards: $("#metricCards"),
    confusionMatrix: $("#confusionMatrix"),
    perClassTable: $("#perClassTable"),
    rocChart: $("#rocChart"),
    prChart: $("#prChart"),
    barsChart: $("#barsChart"),
    curveStatus: $("#curveStatus"),
  };

  const fmt = (value, digits = 3) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    if (!Number.isFinite(value)) return "—";
    return Number(value).toFixed(digits);
  };

  const safeStr = (value) => (value === null || value === undefined ? "" : String(value).trim());

  const parseCsvText = (text) => {
    const rows = [];
    let currentField = "";
    let currentRow = [];
    let inQuotes = false;

    const pushField = () => {
      currentRow.push(currentField);
      currentField = "";
    };
    const pushRow = () => {
      if (currentRow.length === 1 && currentRow[0] === "") return;
      rows.push(currentRow);
      currentRow = [];
    };

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          const next = text[i + 1];
          if (next === '"') {
            currentField += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentField += ch;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        pushField();
      } else if (ch === "\r") {
        continue;
      } else if (ch === "\n") {
        pushField();
        pushRow();
      } else {
        currentField += ch;
      }
    }

    pushField();
    pushRow();
    return rows;
  };

  const parseCsvToObjects = (csvText) => {
    const table = parseCsvText(csvText);
    if (table.length < 2) return [];

    const header = table[0].map((h) => safeStr(h));
    const objects = [];
    for (let i = 1; i < table.length; i++) {
      const row = table[i];
      if (!row || row.length === 0) continue;
      const obj = {};
      for (let c = 0; c < header.length; c++) {
        const key = header[c];
        if (!key) continue;
        obj[key] = row[c] ?? "";
      }
      objects.push(obj);
    }
    return objects;
  };

  const normalizeRows = (rawObjects) => {
    const rows = [];
    for (const obj of rawObjects) {
      const y_true = safeStr(obj.y_true);
      const y_pred = safeStr(obj.y_pred);
      if (!y_true || !y_pred) continue;

      const row = { y_true, y_pred, scores: {} };
      for (const [key, value] of Object.entries(obj)) {
        if (!key) continue;
        if (key === "y_true" || key === "y_pred") continue;
        if (key === "y_score") {
          const num = Number(value);
          if (Number.isFinite(num)) row.scores.y_score = num;
          continue;
        }
        if (key.startsWith("y_score_")) {
          const label = safeStr(key.slice("y_score_".length));
          if (!label) continue;
          const num = Number(value);
          if (Number.isFinite(num)) row.scores[label] = num;
        }
      }

      rows.push(row);
    }
    return rows;
  };

  const uniq = (arr) => Array.from(new Set(arr));

  const inferLabels = (rows) => {
    const labels = uniq(
      rows.flatMap((r) => [r.y_true, r.y_pred]).filter((x) => x !== "")
    );
    labels.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    return labels;
  };

  const buildConfusion = (labels, rows) => {
    const index = new Map(labels.map((l, i) => [l, i]));
    const n = labels.length;
    const matrix = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
    let total = 0;
    let correct = 0;

    for (const r of rows) {
      const i = index.get(r.y_true);
      const j = index.get(r.y_pred);
      if (i === undefined || j === undefined) continue;
      matrix[i][j] += 1;
      total += 1;
      if (i === j) correct += 1;
    }
    return { matrix, total, correct };
  };

  const sum = (arr) => arr.reduce((a, b) => a + b, 0);

  const computePerClass = (labels, cm, total) => {
    const n = labels.length;
    const rowSums = cm.map((row) => sum(row));
    const colSums = Array.from({ length: n }, (_, j) => sum(cm.map((row) => row[j])));

    const perClass = labels.map((label, i) => {
      const tp = cm[i][i];
      const fp = colSums[i] - tp;
      const fn = rowSums[i] - tp;
      const tn = total - tp - fp - fn;
      const precision = tp + fp === 0 ? NaN : tp / (tp + fp);
      const recall = tp + fn === 0 ? NaN : tp / (tp + fn);
      const f1 =
        !Number.isFinite(precision) || !Number.isFinite(recall) || precision + recall === 0
          ? NaN
          : (2 * precision * recall) / (precision + recall);
      const support = rowSums[i];
      return { label, tp, fp, fn, tn, precision, recall, f1, support };
    });

    return { perClass, rowSums, colSums };
  };

  const meanFinite = (values) => {
    const finite = values.filter((v) => Number.isFinite(v));
    if (finite.length === 0) return NaN;
    return sum(finite) / finite.length;
  };

  const computeSummary = (labels, rows) => {
    const { matrix: cm, total, correct } = buildConfusion(labels, rows);
    const accuracy = total === 0 ? NaN : correct / total;
    const { perClass } = computePerClass(labels, cm, total);

    const macroPrecision = meanFinite(perClass.map((c) => c.precision));
    const macroRecall = meanFinite(perClass.map((c) => c.recall));
    const macroF1 = meanFinite(perClass.map((c) => c.f1));

    const weightedF1 =
      total === 0
        ? NaN
        : sum(
            perClass.map((c) => (Number.isFinite(c.f1) ? c.f1 * (c.support / total) : 0))
          );

    const totalTp = sum(perClass.map((c) => c.tp));
    const totalFp = sum(perClass.map((c) => c.fp));
    const totalFn = sum(perClass.map((c) => c.fn));
    const microPrecision = totalTp + totalFp === 0 ? NaN : totalTp / (totalTp + totalFp);
    const microRecall = totalTp + totalFn === 0 ? NaN : totalTp / (totalTp + totalFn);
    const microF1 =
      !Number.isFinite(microPrecision) || !Number.isFinite(microRecall) || microPrecision + microRecall === 0
        ? NaN
        : (2 * microPrecision * microRecall) / (microPrecision + microRecall);

    return {
      labels,
      cm,
      total,
      correct,
      accuracy,
      macroPrecision,
      macroRecall,
      macroF1,
      microPrecision,
      microRecall,
      microF1,
      weightedF1,
      perClass,
    };
  };

  const choosePositiveLabel = (labels) => {
    if (labels.length !== 2) return null;
    const lower = (s) => s.toLowerCase();
    const candidates = ["1", "true", "yes", "positive", "pos", "spam", "fraud"];
    for (const c of candidates) {
      const match = labels.find((l) => lower(l) === c);
      if (match) return match;
    }
    return labels[1];
  };

  const computeBinaryCurves = (rows, labels) => {
    if (labels.length !== 2) return { ok: false, reason: "ROC/PR shown for binary classification only." };
    const positiveLabel = choosePositiveLabel(labels);
    if (!positiveLabel) return { ok: false, reason: "Unable to determine positive label." };

    const filtered = rows
      .map((r) => ({
        y: r.y_true === positiveLabel ? 1 : 0,
        score: Number.isFinite(r.scores?.y_score) ? r.scores.y_score : NaN,
      }))
      .filter((r) => Number.isFinite(r.score));

    const hasPos = filtered.some((r) => r.y === 1);
    const hasNeg = filtered.some((r) => r.y === 0);
    if (!hasPos || !hasNeg) return { ok: false, reason: "Need both classes + valid y_score values." };
    if (filtered.length < 2) return { ok: false, reason: "Not enough scored rows." };

    filtered.sort((a, b) => b.score - a.score);

    const P = filtered.filter((r) => r.y === 1).length;
    const N = filtered.length - P;

    let tp = 0;
    let fp = 0;
    let lastScore = filtered[0].score;
    const rocPoints = [{ x: 0, y: 0 }];
    const prPoints = [{ x: 0, y: 1 }];

    const step = () => {
      const tpr = P === 0 ? 0 : tp / P;
      const fpr = N === 0 ? 0 : fp / N;
      rocPoints.push({ x: fpr, y: tpr });
      const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
      const recall = P === 0 ? 0 : tp / P;
      prPoints.push({ x: recall, y: precision });
    };

    for (const item of filtered) {
      if (item.score !== lastScore) {
        step();
        lastScore = item.score;
      }
      if (item.y === 1) tp += 1;
      else fp += 1;
    }
    step();

    rocPoints.push({ x: 1, y: 1 });
    prPoints.push({ x: 1, y: P / (P + N) });

    const auc = (() => {
      const pts = [...rocPoints].sort((a, b) => a.x - b.x);
      let area = 0;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const avgY = (pts[i].y + pts[i - 1].y) / 2;
        area += dx * avgY;
      }
      return area;
    })();

    const averagePrecision = (() => {
      const pts = [...prPoints].sort((a, b) => a.x - b.x);
      let area = 0;
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x;
        const y = pts[i].y;
        area += dx * y;
      }
      return area;
    })();

    return {
      ok: true,
      positiveLabel,
      usedRows: filtered.length,
      rocPoints,
      prPoints,
      auc,
      averagePrecision,
    };
  };

  const elFromHtml = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  const renderMetricCards = (summary) => {
    const cards = [
      { label: "Accuracy", value: fmt(summary.accuracy, 4) },
      { label: "Precision (macro)", value: fmt(summary.macroPrecision, 4) },
      { label: "Recall (macro)", value: fmt(summary.macroRecall, 4) },
      { label: "F1 (macro)", value: fmt(summary.macroF1, 4) },
      { label: "Precision (micro)", value: fmt(summary.microPrecision, 4) },
      { label: "Recall (micro)", value: fmt(summary.microRecall, 4) },
      { label: "F1 (micro)", value: fmt(summary.microF1, 4) },
      { label: "F1 (weighted)", value: fmt(summary.weightedF1, 4) },
    ];

    els.metricCards.innerHTML = "";
    for (const c of cards) {
      els.metricCards.appendChild(
        elFromHtml(`
          <div class="card p-5">
            <div class="text-sm muted">${c.label}</div>
            <div class="text-3xl mt-2">${c.value}</div>
          </div>
        `)
      );
    }
  };

  const colorForValue = (value, max) => {
    if (!max || max <= 0) return "transparent";
    const t = Math.max(0, Math.min(1, value / max));
    const alpha = 0.10 + 0.55 * t;
    return `rgba(34, 197, 94, ${alpha})`;
  };

  const renderConfusionMatrix = (labels, cm) => {
    const max = Math.max(0, ...cm.flat());

    const table = document.createElement("table");
    table.className = "eval-table";

    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    hr.appendChild(elFromHtml(`<th>Actual \\ Pred</th>`));
    for (const label of labels) {
      hr.appendChild(elFromHtml(`<th>${label}</th>`));
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let i = 0; i < labels.length; i++) {
      const tr = document.createElement("tr");
      tr.appendChild(elFromHtml(`<th>${labels[i]}</th>`));
      for (let j = 0; j < labels.length; j++) {
        const value = cm[i][j];
        const td = document.createElement("td");
        td.textContent = String(value);
        td.style.background = colorForValue(value, max);
        if (i === j) td.style.borderColor = "rgba(34, 197, 94, 0.55)";
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    els.confusionMatrix.innerHTML = "";
    els.confusionMatrix.appendChild(table);
  };

  const renderPerClassTable = (perClass) => {
    const table = document.createElement("table");
    table.className = "eval-table";
    table.appendChild(
      elFromHtml(`
        <thead>
          <tr>
            <th>Label</th>
            <th>Support</th>
            <th>Precision</th>
            <th>Recall</th>
            <th>F1</th>
          </tr>
        </thead>
      `)
    );

    const tbody = document.createElement("tbody");
    for (const c of perClass) {
      tbody.appendChild(
        elFromHtml(`
          <tr>
            <th>${c.label}</th>
            <td>${c.support}</td>
            <td>${fmt(c.precision, 4)}</td>
            <td>${fmt(c.recall, 4)}</td>
            <td>${fmt(c.f1, 4)}</td>
          </tr>
        `)
      );
    }
    table.appendChild(tbody);

    els.perClassTable.innerHTML = "";
    els.perClassTable.appendChild(table);
  };

  const renderSvgLineChart = ({ title, xLabel, yLabel, points, note }) => {
    const W = 520;
    const H = 340;
    const pad = { l: 56, r: 18, t: 28, b: 52 };
    const w = W - pad.l - pad.r;
    const h = H - pad.t - pad.b;

    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const pts = points.map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }));

    const xTo = (x) => pad.l + x * w;
    const yTo = (y) => pad.t + (1 - y) * h;

    const path = pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xTo(p.x).toFixed(2)} ${yTo(p.y).toFixed(2)}`)
      .join(" ");

    const grid = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      grid.push(
        `<line x1="${xTo(0)}" y1="${yTo(t)}" x2="${xTo(1)}" y2="${yTo(t)}" stroke="rgba(148,163,184,0.18)"/>`
      );
      grid.push(
        `<line x1="${xTo(t)}" y1="${yTo(0)}" x2="${xTo(t)}" y2="${yTo(1)}" stroke="rgba(148,163,184,0.18)"/>`
      );
    }

    const diagonal =
      title.toLowerCase().includes("roc") || title.toLowerCase().includes("receiver")
        ? `<path d="M ${xTo(0)} ${yTo(0)} L ${xTo(1)} ${yTo(1)}" stroke="rgba(148,163,184,0.35)" stroke-dasharray="6 6" fill="none"/>`
        : "";

    return `
      <div class="eval-chart">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
          <rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="rgba(2,6,23,0.35)" stroke="rgba(148,163,184,0.18)"></rect>
          <text x="${pad.l}" y="${pad.t - 8}" fill="rgba(226,232,240,0.92)" font-size="14" font-weight="600">${title}</text>
          ${grid.join("")}
          ${diagonal}
          <path d="${path}" stroke="rgba(34,197,94,0.95)" stroke-width="3" fill="none"></path>
          <circle cx="${xTo(pts[pts.length - 1]?.x ?? 0)}" cy="${yTo(pts[pts.length - 1]?.y ?? 0)}" r="4" fill="rgba(34,197,94,0.95)"></circle>
          <text x="${pad.l + w / 2}" y="${H - 18}" text-anchor="middle" fill="rgba(148,163,184,0.9)" font-size="12">${xLabel}</text>
          <text x="18" y="${pad.t + h / 2}" text-anchor="middle" fill="rgba(148,163,184,0.9)" font-size="12"
            transform="rotate(-90 18 ${pad.t + h / 2})">${yLabel}</text>
        </svg>
        ${note ? `<div class="eval-note mt-2">${note}</div>` : ""}
      </div>
    `;
  };

  const renderSvgBars = ({ title, labels, series }) => {
    const W = 900;
    const H = 360;
    const pad = { l: 56, r: 18, t: 28, b: 92 };
    const w = W - pad.l - pad.r;
    const h = H - pad.t - pad.b;

    const maxLabels = 12;
    const use = labels.slice(0, maxLabels);
    const nGroups = use.length;
    const nBars = series.length;
    const groupW = nGroups === 0 ? w : w / nGroups;
    const barW = Math.max(6, Math.min(20, (groupW * 0.7) / Math.max(1, nBars)));
    const groupPad = Math.max(8, groupW * 0.15);

    const yTo = (v) => pad.t + (1 - v) * h;

    const grid = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      grid.push(
        `<line x1="${pad.l}" y1="${yTo(t)}" x2="${pad.l + w}" y2="${yTo(t)}" stroke="rgba(148,163,184,0.18)"/>`
      );
      grid.push(
        `<text x="${pad.l - 10}" y="${yTo(t) + 4}" text-anchor="end" fill="rgba(148,163,184,0.85)" font-size="11">${fmt(t, 1)}</text>`
      );
    }

    const colors = ["rgba(34,197,94,0.90)", "rgba(56,189,248,0.90)", "rgba(244,114,182,0.90)"];

    const bars = [];
    for (let i = 0; i < nGroups; i++) {
      const baseX = pad.l + i * groupW + groupPad / 2;
      for (let s = 0; s < nBars; s++) {
        const val = Math.max(0, Math.min(1, series[s].values[i] ?? 0));
        const x = baseX + s * (barW + 6);
        const y = yTo(val);
        const bh = pad.t + h - y;
        bars.push(
          `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${bh.toFixed(
            2
          )}" rx="6" fill="${colors[s % colors.length]}"></rect>`
        );
      }

      const lx = pad.l + i * groupW + groupW / 2;
      bars.push(
        `<text x="${lx.toFixed(2)}" y="${H - 64}" text-anchor="middle" fill="rgba(226,232,240,0.9)" font-size="11" transform="rotate(25 ${lx.toFixed(
          2
        )} ${H - 64})">${use[i]}</text>`
      );
    }

    const legend = series
      .map((s, i) => {
        const x = pad.l + i * 150;
        return `<g>
          <rect x="${x}" y="${H - 34}" width="14" height="14" rx="4" fill="${colors[i % colors.length]}"></rect>
          <text x="${x + 20}" y="${H - 23}" fill="rgba(148,163,184,0.95)" font-size="12">${s.name}</text>
        </g>`;
      })
      .join("");

    const note = labels.length > maxLabels ? `Showing first ${maxLabels} labels (sorted A→Z).` : "";

    return `
      <div class="eval-chart">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
          <rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="rgba(2,6,23,0.35)" stroke="rgba(148,163,184,0.18)"></rect>
          <text x="${pad.l}" y="${pad.t - 8}" fill="rgba(226,232,240,0.92)" font-size="14" font-weight="600">${title}</text>
          ${grid.join("")}
          ${bars.join("")}
          ${legend}
        </svg>
        ${note ? `<div class="eval-note mt-2">${note}</div>` : ""}
      </div>
    `;
  };

  const clearOutputs = () => {
    els.csvStatus.textContent = "";
    els.jsonStatus.textContent = "";
    els.summaryCounts.textContent = "No data loaded.";
    els.metricCards.innerHTML = "";
    els.confusionMatrix.innerHTML = "";
    els.perClassTable.innerHTML = "";
    els.rocChart.innerHTML = "";
    els.prChart.innerHTML = "";
    els.barsChart.innerHTML = "";
    els.curveStatus.textContent = "";
  };

  const renderAll = (rows) => {
    clearOutputs();
    if (!rows || rows.length === 0) {
      els.summaryCounts.textContent = "No valid rows (need y_true + y_pred).";
      return;
    }

    const labels = inferLabels(rows);
    const summary = computeSummary(labels, rows);

    els.summaryCounts.textContent = `Rows: ${summary.total} • Labels: ${labels.length} • Correct: ${summary.correct}`;
    renderMetricCards(summary);
    renderConfusionMatrix(labels, summary.cm);
    renderPerClassTable(summary.perClass);

    const barsLabels = summary.perClass.map((c) => c.label);
    els.barsChart.innerHTML = renderSvgBars({
      title: "Precision / Recall / F1 by Label",
      labels: barsLabels,
      series: [
        { name: "Precision", values: summary.perClass.map((c) => (Number.isFinite(c.precision) ? c.precision : 0)) },
        { name: "Recall", values: summary.perClass.map((c) => (Number.isFinite(c.recall) ? c.recall : 0)) },
        { name: "F1", values: summary.perClass.map((c) => (Number.isFinite(c.f1) ? c.f1 : 0)) },
      ],
    });

    const curves = computeBinaryCurves(rows, labels);
    if (!curves.ok) {
      els.curveStatus.textContent = curves.reason;
      els.rocChart.innerHTML = `<div class="eval-note">No ROC curve: ${curves.reason}</div>`;
      els.prChart.innerHTML = `<div class="eval-note">No PR curve: ${curves.reason}</div>`;
      return;
    }

    els.curveStatus.textContent = `Binary (+ = "${curves.positiveLabel}") • Using ${curves.usedRows} scored rows • AUC=${fmt(
      curves.auc,
      4
    )} • AP=${fmt(curves.averagePrecision, 4)}`;

    els.rocChart.innerHTML = renderSvgLineChart({
      title: "ROC Curve",
      xLabel: "False Positive Rate",
      yLabel: "True Positive Rate",
      points: curves.rocPoints,
      note: `AUC = ${fmt(curves.auc, 4)}`,
    });

    els.prChart.innerHTML = renderSvgLineChart({
      title: "Precision–Recall Curve",
      xLabel: "Recall",
      yLabel: "Precision",
      points: curves.prPoints,
      note: `Average Precision = ${fmt(curves.averagePrecision, 4)}`,
    });
  };

  const loadSample = () => {
    const sample = [
      { y_true: "yes", y_pred: "yes", y_score: 0.92 },
      { y_true: "yes", y_pred: "yes", y_score: 0.81 },
      { y_true: "yes", y_pred: "no", y_score: 0.42 },
      { y_true: "yes", y_pred: "yes", y_score: 0.77 },
      { y_true: "yes", y_pred: "yes", y_score: 0.66 },
      { y_true: "yes", y_pred: "no", y_score: 0.33 },
      { y_true: "yes", y_pred: "yes", y_score: 0.71 },
      { y_true: "yes", y_pred: "yes", y_score: 0.88 },
      { y_true: "yes", y_pred: "no", y_score: 0.49 },
      { y_true: "yes", y_pred: "yes", y_score: 0.83 },
      { y_true: "no", y_pred: "no", y_score: 0.08 },
      { y_true: "no", y_pred: "no", y_score: 0.16 },
      { y_true: "no", y_pred: "yes", y_score: 0.61 },
      { y_true: "no", y_pred: "no", y_score: 0.13 },
      { y_true: "no", y_pred: "no", y_score: 0.27 },
      { y_true: "no", y_pred: "no", y_score: 0.22 },
      { y_true: "no", y_pred: "yes", y_score: 0.56 },
      { y_true: "no", y_pred: "no", y_score: 0.19 },
      { y_true: "no", y_pred: "no", y_score: 0.05 },
      { y_true: "no", y_pred: "no", y_score: 0.31 },
      { y_true: "yes", y_pred: "yes", y_score: 0.74 },
      { y_true: "yes", y_pred: "yes", y_score: 0.69 },
      { y_true: "yes", y_pred: "no", y_score: 0.40 },
      { y_true: "yes", y_pred: "yes", y_score: 0.79 },
      { y_true: "yes", y_pred: "yes", y_score: 0.90 },
      { y_true: "no", y_pred: "no", y_score: 0.12 },
      { y_true: "no", y_pred: "yes", y_score: 0.52 },
      { y_true: "no", y_pred: "no", y_score: 0.09 },
      { y_true: "no", y_pred: "no", y_score: 0.24 },
      { y_true: "no", y_pred: "no", y_score: 0.18 },
    ];
    els.jsonInput.value = JSON.stringify(sample, null, 2);
    els.jsonStatus.textContent = "Sample loaded. Click Parse JSON.";
  };

  const parseJson = () => {
    const text = safeStr(els.jsonInput.value);
    if (!text) {
      els.jsonStatus.textContent = "Paste JSON first.";
      return;
    }
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error("JSON must be an array of objects.");
      const rows = normalizeRows(data);
      els.jsonStatus.textContent = `Parsed ${rows.length} valid rows.`;
      renderAll(rows);
    } catch (e) {
      els.jsonStatus.textContent = `Invalid JSON: ${e?.message ?? "unknown error"}`;
    }
  };

  const parseCsv = async () => {
    const file = els.csvFile.files?.[0];
    if (!file) {
      els.csvStatus.textContent = "Choose a CSV file first.";
      return;
    }
    const text = await file.text();
    const objects = parseCsvToObjects(text);
    const rows = normalizeRows(objects);
    els.csvStatus.textContent = `Parsed ${rows.length} valid rows from "${file.name}".`;
    renderAll(rows);
  };

  els.parseCsvBtn?.addEventListener("click", () => parseCsv());
  els.parseJsonBtn?.addEventListener("click", () => parseJson());
  els.loadSampleBtn?.addEventListener("click", () => loadSample());
  els.resetBtn?.addEventListener("click", () => {
    els.csvFile.value = "";
    els.jsonInput.value = "";
    clearOutputs();
  });

  clearOutputs();
})();
