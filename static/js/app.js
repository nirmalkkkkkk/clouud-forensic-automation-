/**
 * ============================================================
 *  CYBERFORENSICS SOC — Healthcare Edition
 *  app.js
 * ============================================================
 */

"use strict";

/* ── State ─────────────────────────────────────────────────── */
const State = {
  currentSection : "dashboard",
  evidence       : [],
  filteredEvidence: [],
  sortKey        : "risk_score",
  sortDir        : "desc",
  page           : 1,
  pageSize       : 20,
  logFilter      : "all",
  theme          : localStorage.getItem("soc-theme") || "dark",
  chartInstances : {},
};

/* ── Utils ─────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);

function toast(msg, type = "info") {
  const icons = { info:"circle-info", success:"circle-check",
                  warning:"triangle-exclamation", error:"circle-xmark" };
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.innerHTML = `<i class="fa-solid fa-${icons[type]} toast-icon"></i><span>${msg}</span>`;
  $("toast-container").appendChild(el);
  setTimeout(() => {
    el.classList.add("removing");
    el.addEventListener("animationend", () => el.remove());
  }, 3500);
}

function formatDate(str) {
  if (!str) return "—";
  return str.length > 10 ? str.slice(0, 19) : str;
}

function formatSize(kb) {
  if (kb === null || kb === undefined) return "—";
  if (kb > 1024) return `${(kb/1024).toFixed(1)} MB`;
  return `${Number(kb).toFixed(1)} KB`;
}

function riskBadge(level, score) {
  if (!level) return "—";
  const cls = level.toLowerCase();
  const s = score !== undefined ? ` (${score})` : "";
  return `<span class="risk-badge risk-badge--${cls}"><span class="badge-dot"></span>${level}${s}</span>`;
}

function escHtml(str) {
  if (!str && str !== 0) return "—";
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* ── Loader ─────────────────────────────────────────────────── */
window.addEventListener("load", () => {
  setTimeout(() => {
    $("page-loader").classList.add("hidden");
    initApp();
  }, 1800);
});

/* ── Theme ─────────────────────────────────────────────────── */
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("soc-theme", t);
  State.theme = t;
  // rebuild charts for correct colours
  Object.values(State.chartInstances).forEach(c => c && c.destroy && c.destroy());
  State.chartInstances = {};
  if (State.evidence.length) renderEvidenceCharts(State.evidence);
}
applyTheme(State.theme);

/* ── Clock ─────────────────────────────────────────────────── */
function tickClock() {
  const el = $("topbar-datetime");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString("en-IN", {
    day:"2-digit", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false
  });
}
setInterval(tickClock, 1000);
tickClock();

/* ── Navigation ─────────────────────────────────────────────── */
function navigateTo(section) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".sidebar__link").forEach(l => l.classList.remove("active"));

  const sec = $(`section-${section}`);
  const nav = $(`nav-${section}`);
  if (sec) sec.classList.add("active");
  if (nav) nav.classList.add("active");

  const labels = {
    dashboard:"Dashboard", scanner:"Evidence Scanner", evidence:"Evidence Table",
    timeline:"Timeline Analysis", scans:"Past Scans",
    reports:"Report Center", logs:"System Logs"
  };
  const icons = {
    dashboard:"gauge-high", scanner:"radar", evidence:"table-list",
    timeline:"chart-gantt", scans:"clock-rotate-left",
    reports:"file-shield", logs:"terminal"
  };
  const bc = $("breadcrumb");
  if (bc) bc.innerHTML = `<i class="fa-solid fa-${icons[section]||'circle'}"></i> ${labels[section]||section}`;

  State.currentSection = section;

  // Lazy-load section data
  if (section === "logs")     fetchLogs();
  if (section === "scans")    fetchAllScans();
  if (section === "timeline") fetchTimeline();
  if (section === "dashboard") fetchStats();
}

/* ── Sidebar links ─────────────────────────────────────────── */
function initNavLinks() {
  document.querySelectorAll(".sidebar__link[data-section]").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      navigateTo(link.dataset.section);
      if (window.innerWidth <= 768) $("sidebar").classList.remove("open");
    });
  });
}

/* ── Sidebar toggle (mobile) ───────────────────────────────── */
function initSidebarToggle() {
  $("btn-toggle-sidebar")?.addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
  });
}

/* ── Stats ─────────────────────────────────────────────────── */
async function fetchStats() {
  try {
    const r = await fetch("/api/stats");
    if (!r.ok) return;
    const d = await r.json();

    setText("sv-scans",       d.total_scans   ?? 0);
    setText("sv-high",        d.total_high     ?? 0);
    setText("sv-files",       d.total_files    ?? 0);

    renderRecentScans(d.recent_scans || []);
  } catch(e) {
    console.error("fetchStats:", e);
  }
}

function setText(id, val) {
  const el = $(id);
  if (el) {
    el.textContent = val;
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = 'sectionIn .25s ease';
  }
}

function renderRecentScans(scans) {
  const tbody = $("recent-scans-tbody");
  if (!tbody) return;
  if (!scans.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty">No scan sessions yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = scans.map((s,i) => `
    <tr>
      <td><code style="color:var(--accent);font-family:'JetBrains Mono',monospace;font-size:11px">#${s.id}</code></td>
      <td>${formatDate(s.scanned_at)}</td>
      <td title="${escHtml(s.directory)}" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        ${escHtml(s.directory)}
      </td>
      <td>${s.total_files}</td>
      <td><span style="color:var(--risk-high);font-weight:700">${s.high_risk}</span></td>
      <td><code style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-dim)">${s.duration}s</code></td>
      <td>
        <button class="row-action-btn" onclick="loadSessionEvidence(${s.id})">
          <i class="fa-solid fa-eye"></i> View
        </button>
      </td>
    </tr>`).join("");
}

/* ── Scanner (SSE) ─────────────────────────────────────────── */
let activeSSE = null;

function initScanner() {
  $("btn-start-scan")?.addEventListener("click", startScan);
  $("scan-path")?.addEventListener("keydown", e => {
    if (e.key === "Enter") startScan();
  });
}

function startScan() {
  const path = ($("scan-path")?.value || "").trim();
  if (!path) { toast("Please enter a directory path.", "warning"); return; }

  // Reset UI
  $("scan-summary-grid")?.classList.add("hidden");
  resetSteps();
  const prog = $("scan-progress");
  if (prog) prog.classList.add("visible");
  setProgress(0, "Initializing forensic modules...");

  if (activeSSE) { activeSSE.close(); activeSSE = null; }

  const btn = $("btn-start-scan");
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Scanning...'; }

  const url = `/api/scan/stream?path=${encodeURIComponent(path)}`;
  const es = new EventSource(url);
  activeSSE = es;

  let stepIdx = 0;

  es.addEventListener("progress", e => {
    const d = JSON.parse(e.data);
    setProgress(d.pct || 0, d.msg || "");

    // Advance step indicators
    const targetStep = Math.floor((d.pct / 100) * 6);
    while (stepIdx < targetStep && stepIdx < 6) {
      markStepDone(stepIdx + 1);
      stepIdx++;
    }
  });

  es.addEventListener("complete", e => {
    es.close(); activeSSE = null;
    const d = JSON.parse(e.data);

    // Mark all steps done
    for (let i = 1; i <= 6; i++) markStepDone(i);
    setProgress(100, "Scan complete!");
    setTimeout(() => prog?.classList.remove("visible"), 1200);

    // Show result cards
    setState("res-total",    d.total_files   || 0);
    setState("res-high",     d.high_risk     || 0);
    setState("res-low",      d.low_risk      || 0);
    setState("res-duration", `${d.duration || 0}s`);
    $("scan-summary-grid")?.classList.remove("hidden");

    // Store evidence & update UI
    State.evidence = d.evidence || [];
    renderEvidenceCharts(State.evidence);
    renderEvidenceTable(State.evidence);
    fetchStats();

    toast(`Scan complete — ${d.total_files} files analysed. High: ${d.high_risk}`, "success");
    resetScanBtn();

    // Populate category filter
    populateCategoryFilter(State.evidence);
  });

  es.addEventListener("error", e => {
    let msg = "Scan failed.";
    try { if (e.data) msg = JSON.parse(e.data).message || msg; } catch {}
    es.close(); activeSSE = null;
    prog?.classList.remove("visible");
    toast(msg, "error");
    resetScanBtn();
  });

  es.onerror = () => {
    // SSE closed naturally — ignore
    es.close(); activeSSE = null;
    resetScanBtn();
  };
}

function resetScanBtn() {
  const btn = $("btn-start-scan");
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Launch Scan'; }
}

function setProgress(pct, msg) {
  const bar  = $("scan-progress-bar");
  const txt  = $("scan-progress-text");
  const pcts = $("scan-progress-pct");
  if (bar)  bar.style.width  = `${pct}%`;
  if (txt)  txt.textContent  = msg;
  if (pcts) pcts.textContent = `${pct}%`;
}

function setState(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}

function resetSteps() {
  for (let i = 1; i <= 6; i++) {
    const s = $(`step-${i}`);
    if (!s) continue;
    s.classList.remove("done");
    s.classList.toggle("dimmed", i > 1);
    const icons = ["fa-circle-notch fa-spin","fa-regular fa-circle"];
    s.querySelector("i").className = `fa-${i===1?"solid":"regular"} fa-circle${i===1?"-notch fa-spin":""}`;
  }
}

function markStepDone(n) {
  const s = $(`step-${n}`);
  if (!s) return;
  s.classList.add("done"); s.classList.remove("dimmed");
  s.querySelector("i").className = "fa-solid fa-circle-check";
  const next = $(`step-${n+1}`);
  if (next) { next.classList.remove("dimmed"); next.querySelector("i").className = "fa-solid fa-circle-notch fa-spin"; }
}

/* ── Upload Tab ─────────────────────────────────────────────── */
function initUpload() {
  const zone   = $("upload-zone");
  const input  = $("file-input");
  const btn    = $("btn-upload-files");
  const list   = $("upload-file-list");
  if (!zone) return;

  let selected = [];

  zone.addEventListener("click", () => input?.click());
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", e => {
    e.preventDefault(); zone.classList.remove("dragover");
    selected = Array.from(e.dataTransfer.files);
    renderFileList();
  });
  input?.addEventListener("change", () => {
    selected = Array.from(input.files);
    renderFileList();
  });

  function renderFileList() {
    if (!list) return;
    list.innerHTML = selected.map(f =>
      `<div class="upload-file-item"><i class="fa-solid fa-file"></i>${escHtml(f.name)}</div>`
    ).join("");
  }

  btn?.addEventListener("click", async () => {
    if (!selected.length) { toast("Please select files first.", "warning"); return; }
    const fd = new FormData();
    selected.forEach(f => fd.append("files", f, f.webkitRelativePath || f.name));
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Uploading...';
    try {
      const r = await fetch("/api/upload", { method:"POST", body:fd });
      const d = await r.json();
      const res = $("upload-result");
      if (res) {
        res.style.display = "block";
        res.innerHTML = d.success
          ? `<i class="fa-solid fa-circle-check" style="color:var(--success)"></i>
             <strong>Upload complete!</strong> ${d.saved_files.length} files saved.<br/>
             <code style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent)">${escHtml(d.upload_dir)}</code><br/>
             <small style="color:var(--text-dim)">Copy the path above and paste it in the Directory Scan tab to scan uploaded files.</small>`
          : `<i class="fa-solid fa-circle-xmark" style="color:var(--danger)"></i> Upload failed: ${escHtml(d.error||"")}`;
      }
      if (d.success) toast(`${d.saved_files.length} files uploaded successfully.`, "success");
    } catch(e) {
      toast("Upload error: " + e.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Upload & Get Scan Path';
    }
  });
}

/* ── Evidence Charts ───────────────────────────────────────── */
function renderEvidenceCharts(evidence) {
  // Risk donut
  const riskCounts = { High:0, Low:0 };
  evidence.forEach(f => { if (riskCounts[f.risk_level] !== undefined) riskCounts[f.risk_level]++; });

  const hasRisk = Object.values(riskCounts).some(v => v > 0);
  const riskEmpty = $("chart-risk-empty");
  const riskWrap  = qs("#chart-risk-wrap .chart-canvas-wrap");

  if (!hasRisk) {
    if (riskEmpty) riskEmpty.classList.add("visible");
    if (riskWrap)  riskWrap.style.display = "none";
  } else {
    if (riskEmpty) riskEmpty.classList.remove("visible");
    if (riskWrap)  riskWrap.style.display = "block";
    buildDonutChart("chart-risk",
      Object.keys(riskCounts), Object.values(riskCounts),
      ["#FF6600","#00B050"]
    );
  }

  // Category bar
  const catCounts = {};
  evidence.forEach(f => {
    const c = f.category || "Unclassified";
    catCounts[c] = (catCounts[c] || 0) + 1;
  });
  const sorted = Object.entries(catCounts).sort((a,b)=>b[1]-a[1]);
  const catEmpty = $("chart-category-empty");
  const catWrap  = qs("#chart-category-wrap .chart-canvas-wrap");

  if (!sorted.length) {
    if (catEmpty) catEmpty.classList.add("visible");
    if (catWrap)  catWrap.style.display = "none";
  } else {
    if (catEmpty) catEmpty.classList.remove("visible");
    if (catWrap)  catWrap.style.display = "block";
    buildBarChart("chart-category",
      sorted.map(e=>e[0]), sorted.map(e=>e[1])
    );
  }
}

function buildDonutChart(canvasId, labels, data, colors) {
  const canvas = $(canvasId);
  if (!canvas) return;

  if (State.chartInstances[canvasId]) {
    State.chartInstances[canvasId].destroy();
  }

  const textColor = State.theme === "dark" ? "#c8d8e8" : "#1a2a40";

  State.chartInstances[canvasId] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0,
                   hoverOffset: 8 }]
    },
    options: {
      cutout: "65%",
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: { color: textColor, font:{ size: 11 }, padding: 14, usePointStyle: true }
        },
        tooltip: { callbacks: {
          label: ctx => ` ${ctx.label}: ${ctx.parsed} files`
        }}
      }
    }
  });
}

function buildBarChart(canvasId, labels, data) {
  const canvas = $(canvasId);
  if (!canvas) return;

  if (State.chartInstances[canvasId]) State.chartInstances[canvasId].destroy();

  const textColor = State.theme === "dark" ? "#c8d8e8" : "#1a2a40";
  const gridColor = State.theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";

  State.chartInstances[canvasId] = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: "rgba(0,212,255,0.25)",
        borderColor: "rgba(0,212,255,0.8)",
        borderWidth: 1, borderRadius: 5,
        hoverBackgroundColor: "rgba(0,212,255,0.45)"
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => ` ${ctx.parsed.x} files` }
      }},
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font:{size:10} } },
        y: { grid: { display: false }, ticks: { color: textColor, font:{size:10} } }
      }
    }
  });
}

/* ── Timeline Charts ───────────────────────────────────────── */
async function fetchTimeline() {
  const sessId = $("timeline-session-filter")?.value || "";
  const url = sessId ? `/api/timeline?session_id=${sessId}` : "/api/timeline";
  try {
    const r = await fetch(url);
    const d = await r.json();
    const timeline = d.timeline || [];

    const tNote = $("timeline-note");
    if (tNote) tNote.textContent = `${timeline.length} date buckets`;

    const emptyEl = $("chart-timeline-empty");
    const canvas  = $("chart-timeline");

    if (!timeline.length) {
      if (emptyEl) emptyEl.style.display = "block";
      if (canvas)  canvas.style.display  = "none";
      return;
    }
    if (emptyEl) emptyEl.style.display = "none";
    if (canvas)  canvas.style.display  = "block";

    const textColor = State.theme === "dark" ? "#c8d8e8" : "#1a2a40";
    const gridColor = State.theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";

    if (State.chartInstances["chart-timeline"]) State.chartInstances["chart-timeline"].destroy();

    State.chartInstances["chart-timeline"] = new Chart(canvas, {
      type: "bar",
      data: {
        labels: timeline.map(t=>t.date),
        datasets: [
          { label:"High",     data: timeline.map(t=>t.high||0),     backgroundColor:"rgba(255,102,0,0.6)", borderRadius:3 },
          { label:"Low",      data: timeline.map(t=>t.low||0),       backgroundColor:"rgba(0,176,80,0.6)", borderRadius:3 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: textColor, font:{size:11} } },
          tooltip: { mode:"index", intersect: false }
        },
        scales: {
          x: { stacked:true, grid:{color:gridColor}, ticks:{color:textColor, font:{size:10}, maxTicksLimit:12} },
          y: { stacked:true, grid:{color:gridColor}, ticks:{color:textColor, font:{size:10}}, beginAtZero:true }
        }
      }
    });

    // Score distribution chart
    buildScoreDistChart(State.evidence);
  } catch(e) { console.error("fetchTimeline:", e); }
}

function buildScoreDistChart(evidence) {
  const canvas = $("chart-score-dist");
  if (!canvas || !evidence.length) return;
  if (State.chartInstances["chart-score-dist"]) State.chartInstances["chart-score-dist"].destroy();

  const buckets = Array(10).fill(0);
  evidence.forEach(f => {
    const score = parseInt(f.risk_score || 0);
    const idx = Math.min(Math.floor(score / 10), 9);
    buckets[idx]++;
  });

  const textColor  = State.theme === "dark" ? "#c8d8e8" : "#1a2a40";
  const gridColor  = State.theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";

  const bgColors = buckets.map((_, i) => {
    const score = i * 10;
    if (score >= 70) return "rgba(192,0,0,0.6)";
    if (score >= 40) return "rgba(255,102,0,0.6)";
    if (score >= 20) return "rgba(255,192,0,0.6)";
    return "rgba(0,176,80,0.6)";
  });

  State.chartInstances["chart-score-dist"] = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["0-9","10-19","20-29","30-39","40-49","50-59","60-69","70-79","80-89","90-100"],
      datasets: [{ label:"Files", data:buckets, backgroundColor:bgColors, borderRadius:5 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{
        callbacks:{ label: ctx => ` ${ctx.parsed.y} files` }
      }},
      scales:{
        x:{ grid:{color:gridColor}, ticks:{color:textColor, font:{size:10}},
            title:{display:true, text:"Risk Score", color:textColor, font:{size:11}} },
        y:{ grid:{color:gridColor}, ticks:{color:textColor, font:{size:10}}, beginAtZero:true }
      }
    }
  });
}

/* ── Evidence Table ─────────────────────────────────────────── */
function renderEvidenceTable(evidence) {
  State.evidence = evidence;
  applyFilters();
}

function applyFilters() {
  const search  = ($("evidence-search")?.value || "").toLowerCase();
  const riskF   = ($("filter-risk")?.value    || "").toLowerCase();
  const catF    = ($("filter-category")?.value || "").toLowerCase();

  State.filteredEvidence = State.evidence.filter(f => {
    const matchRisk = !riskF || (f.risk_level||"").toLowerCase() === riskF;
    const matchCat  = !catF  || (f.category||"").toLowerCase().includes(catF);
    const matchSrc  = !search || [
      f.file_name, f.file_type, f.category,
      f.risk_level, f.status, f.md5_hash, f.sha256_hash,
      f.anomaly_flag, f.modified_time
    ].some(v => (v||"").toLowerCase().includes(search));
    return matchRisk && matchCat && matchSrc;
  });

  // Sort
  State.filteredEvidence.sort((a, b) => {
    let va = a[State.sortKey] ?? (typeof a[State.sortKey] === "number" ? 0 : "");
    let vb = b[State.sortKey] ?? (typeof b[State.sortKey] === "number" ? 0 : "");
    if (typeof va === "number" && typeof vb === "number") {
      return State.sortDir === "asc" ? va - vb : vb - va;
    }
    va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    return State.sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  State.page = 1;
  renderTablePage();
}

function renderTablePage() {
  const tbody = $("evidence-tbody");
  const meta  = $("table-meta");
  if (!tbody) return;

  const total   = State.filteredEvidence.length;
  const start   = (State.page - 1) * State.pageSize;
  const pageData = State.filteredEvidence.slice(start, start + State.pageSize);

  if (meta) meta.textContent = total
    ? `Showing ${start+1}–${Math.min(start+State.pageSize,total)} of ${total} files`
    : "No files match the current filter.";

  if (!total) {
    tbody.innerHTML = `<tr><td colspan="12" class="table-empty">No matching evidence records.</td></tr>`;
    renderPagination(0);
    return;
  }

  tbody.innerHTML = pageData.map((f, i) => {
    const riskL = (f.risk_level || "low").toLowerCase();
    const ts = Boolean(f.timestomping);
    return `
    <tr>
      <td style="color:var(--text-dim);font-size:11px">${start+i+1}</td>
      <td>
        <button class="row-action-btn" style="padding:0;border:none;background:none;color:var(--accent);cursor:pointer;font-size:12px;font-weight:500;font-family:inherit"
          onclick='openFileModal(${JSON.stringify(f).replace(/'/g,"&#39;")})'>
          <i class="fa-solid fa-file" style="margin-right:4px"></i>${escHtml(f.file_name)}
        </button>
      </td>
      <td><code style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-dim)">${escHtml(f.file_type)}</code></td>
      <td>${formatSize(f.file_size_kb)}</td>
      <td style="font-size:12px">${escHtml(f.category)}</td>
      <td style="font-size:12px;color:${f.status==='Modified After Breach'?'var(--risk-high)':'var(--success)'}">${escHtml(f.status)}</td>
      <td>${riskBadge(f.risk_level)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${Math.min(f.risk_score||0,100)}%;background:${riskL==='high'?'var(--risk-high)':'var(--risk-low)'}"></div>
          </div>
          <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-dim)">${f.risk_score||0}</span>
        </div>
      </td>
      <td>
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${(f.entropy||0)>6.5?'var(--risk-high)':'var(--text-dim)'}">${(f.entropy||0).toFixed(3)}</span>
      </td>
      <td>
        ${ts ? '<span style="color:var(--risk-high);font-size:11px"><i class="fa-solid fa-exclamation-circle"></i> Yes</span>'
             : '<span style="color:var(--text-muted);font-size:11px">—</span>'}
      </td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-dim)">${formatDate(f.modified_time)}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--text-muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(f.md5_hash)}">${escHtml((f.md5_hash||"").slice(0,12))}…</td>
    </tr>`;
  }).join("");

  renderPagination(total);
}

function renderPagination(total) {
  const container = $("table-pagination");
  if (!container) return;
  const pages = Math.ceil(total / State.pageSize);
  if (pages <= 1) { container.innerHTML = ""; return; }

  let html = "";
  const cur = State.page;
  if (cur > 1) html += `<button class="page-btn" onclick="goPage(${cur-1})"><i class="fa-solid fa-chevron-left"></i></button>`;
  for (let p = Math.max(1,cur-2); p <= Math.min(pages,cur+2); p++) {
    html += `<button class="page-btn${p===cur?" active":""}" onclick="goPage(${p})">${p}</button>`;
  }
  if (cur < pages) html += `<button class="page-btn" onclick="goPage(${cur+1})"><i class="fa-solid fa-chevron-right"></i></button>`;
  html += `<span style="font-size:11px;color:var(--text-muted);margin-left:6px">Page ${cur}/${pages}</span>`;
  container.innerHTML = html;
}

function goPage(p) { State.page = p; renderTablePage(); }

function initTableSort() {
  document.querySelectorAll(".data-table.sortable th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (State.sortKey === key) {
        State.sortDir = State.sortDir === "asc" ? "desc" : "asc";
      } else {
        State.sortKey = key; State.sortDir = "desc";
      }
      document.querySelectorAll(".data-table.sortable th[data-sort]")
        .forEach(h => h.classList.remove("asc","desc"));
      th.classList.add(State.sortDir);
      applyFilters();
    });
  });
}

function populateCategoryFilter(evidence) {
  const sel = $("filter-category");
  if (!sel) return;
  const cats = [...new Set(evidence.map(f=>f.category).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">All Categories</option>` +
    cats.map(c => `<option value="${escHtml(c.toLowerCase())}">${escHtml(c)}</option>`).join("");
}

/* ── File Inspector Modal ───────────────────────────────────── */
function openFileModal(f) {
  const riskL = (f.risk_level || "low").toLowerCase();
  const ts = Boolean(f.timestomping);

  $("modal-title").innerHTML = `<i class="fa-solid fa-file-shield"></i> ${escHtml(f.file_name)}`;

  $("modal-body").innerHTML = `
    <div style="margin-bottom:14px">${riskBadge(f.risk_level, f.risk_score)}</div>
    <div class="detail-grid">
      <div class="detail-item"><label>File Path</label><p>${escHtml(f.file_path)}</p></div>
      <div class="detail-item"><label>File Type</label><p>${escHtml(f.file_type)}</p></div>
      <div class="detail-item"><label>File Size</label><p>${formatSize(f.file_size_kb)}</p></div>
      <div class="detail-item"><label>Category</label><p>${escHtml(f.category)}</p></div>
      <div class="detail-item"><label>Status</label><p style="color:${f.status==='Modified After Breach'?'var(--risk-high)':'var(--success)'}">${escHtml(f.status)}</p></div>
      <div class="detail-item"><label>Risk Score</label>
        <p><span style="color:var(--risk-${riskL})">${f.risk_score || 0} / 100</span></p>
      </div>
      <div class="detail-item"><label>Shannon Entropy</label>
        <p style="color:${(f.entropy||0)>6.5?'var(--risk-high)':'inherit'}">${(f.entropy||0).toFixed(4)}</p>
      </div>
      <div class="detail-item"><label>Timestomping</label>
        <p style="color:${ts?'var(--risk-high)':'var(--text-dim)'}">${ts?'⚠ Detected':'None'}</p>
      </div>
      <div class="detail-item"><label>Anomaly Flag</label><p>${escHtml(f.anomaly_flag)||'None'}</p></div>
      <div class="detail-item"><label>Permissions</label><p>${escHtml(f.permissions)}</p></div>
      <div class="detail-item"><label>Created Time</label><p>${escHtml(f.created_time)}</p></div>
      <div class="detail-item"><label>Modified Time</label><p>${escHtml(f.modified_time)}</p></div>
      <div class="detail-item"><label>Accessed Time</label><p>${escHtml(f.accessed_time)}</p></div>
      <div class="detail-item"><label>Collected At</label><p>${escHtml(f.collected_at)}</p></div>
      <div class="detail-item" style="grid-column:1/-1"><label>MD5 Hash</label><p>${escHtml(f.md5_hash)}</p></div>
      <div class="detail-item" style="grid-column:1/-1"><label>SHA256 Hash</label><p>${escHtml(f.sha256_hash)}</p></div>
    </div>`;

  const overlay = $("file-modal-overlay");
  if (overlay) overlay.classList.add("open");
}

function initModal() {
  $("modal-close")?.addEventListener("click", () => $("file-modal-overlay")?.classList.remove("open"));
  $("file-modal-overlay")?.addEventListener("click", e => {
    if (e.target === $("file-modal-overlay")) $("file-modal-overlay").classList.remove("open");
  });
}

/* ── All Past Scans ─────────────────────────────────────────── */
async function fetchAllScans() {
  try {
    const r = await fetch("/api/scans");
    const d = await r.json();
    const tbody = $("scans-tbody");
    if (!tbody) return;

    // Populate timeline session filter
    const tSel = $("timeline-session-filter");
    if (tSel) {
      tSel.innerHTML = `<option value="">All Sessions</option>` +
        (d.scans||[]).map(s => `<option value="${s.id}">#${s.id} — ${s.scanned_at}</option>`).join("");
    }

    if (!d.scans || !d.scans.length) {
      tbody.innerHTML = `<tr><td colspan="10" class="table-empty">No scan sessions recorded yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = d.scans.map((s, i) => `
      <tr>
        <td style="color:var(--text-dim)">${i+1}</td>
        <td style="font-size:12px">${formatDate(s.scanned_at)}</td>
        <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px" title="${escHtml(s.directory)}">${escHtml(s.directory)}</td>
        <td><strong>${s.total_files}</strong></td>
        <td><span style="color:var(--risk-high);font-weight:700">${s.high_risk}</span></td>
        <td><span style="color:var(--risk-low);font-weight:700">${s.low_risk}</span></td>
        <td><code style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-dim)">${s.duration}s</code></td>
        <td>
          <button class="row-action-btn" onclick="loadSessionEvidence(${s.id})">
            <i class="fa-solid fa-eye"></i> View
          </button>
        </td>
      </tr>`).join("");
  } catch(e) { console.error("fetchAllScans:", e); }
}

async function loadSessionEvidence(sessionId) {
  try {
    const r = await fetch(`/api/scans/${sessionId}/evidence`);
    const d = await r.json();
    if (d.error) { toast(d.error, "error"); return; }

    State.evidence = d.evidence || [];
    renderEvidenceCharts(State.evidence);
    renderEvidenceTable(State.evidence);
    populateCategoryFilter(State.evidence);

    if ($("evidence-subtitle")) {
      $("evidence-subtitle").textContent =
        `Evidence from scan #${sessionId} — ${d.session?.directory || ""} — ${State.evidence.length} files`;
    }

    navigateTo("evidence");
    toast(`Loaded ${State.evidence.length} evidence records from scan #${sessionId}`, "info");
  } catch(e) {
    toast("Failed to load session: " + e.message, "error");
  }
}

/* ── System Logs ────────────────────────────────────────────── */
async function fetchLogs() {
  try {
    const r = await fetch("/api/logs");
    const d = await r.json();
    const lines = d.lines || [];
    const logBody = $("log-body");
    if (!logBody) return;

    if ($("log-count")) $("log-count").textContent = `${lines.length} lines`;

    if (!lines.length) {
      logBody.innerHTML = `<p class="log-empty">No log entries found.</p>`;
      return;
    }

    logBody.innerHTML = lines
      .filter(l => {
        if (State.logFilter === "all") return true;
        return l.toLowerCase().includes(State.logFilter);
      })
      .map(l => {
        let cls = "log-line--info";
        if (l.toLowerCase().includes(" error ") || l.toLowerCase().includes(" - error - ")) cls = "log-line--error";
        else if (l.toLowerCase().includes(" warning ") || l.toLowerCase().includes(" - warning - ")) cls = "log-line--warning";

        // Split timestamp from message
        const tsMatch = l.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
        const ts = tsMatch ? `<span class="log-ts">${tsMatch[1]}</span>` : "";
        const msg = tsMatch ? l.slice(tsMatch[1].length) : l;

        return `<span class="log-line ${cls}">${ts}${escHtml(msg)}</span>`;
      }).join("");

    if ($("toggle-autoscroll")?.checked) {
      logBody.scrollTop = logBody.scrollHeight;
    }
  } catch(e) { console.error("fetchLogs:", e); }
}

function initLogs() {
  $("btn-refresh-logs")?.addEventListener("click", fetchLogs);
  $("btn-clear-logs")?.addEventListener("click", () => {
    const lb = $("log-body");
    if (lb) lb.innerHTML = `<p class="log-empty">Log view cleared. Click refresh to reload.</p>`;
  });

  document.querySelectorAll(".log-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".log-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      State.logFilter = btn.dataset.level;
      fetchLogs();
    });
  });

  // Auto-refresh every 30s when on logs section
  setInterval(() => {
    if (State.currentSection === "logs") fetchLogs();
  }, 30000);
}

/* ── Downloads ──────────────────────────────────────────────── */
function initDownloads() {
  const dlMap = {
    "btn-export-csv":        "/api/download-csv",
    "btn-export-xlsx":       "/api/download-xlsx",
    "btn-export-pdf":        "/api/download-pdf",
    "btn-dl-csv":            "/api/download-csv",
    "btn-dl-xlsx":           "/api/download-xlsx",
    "btn-dl-pdf":            "/api/download-pdf",
  };
  Object.entries(dlMap).forEach(([id, url]) => {
    $(id)?.addEventListener("click", () => {
      // Use native download navigation since backend sends Content-Disposition.
      // This solves the issue of files becoming corrupted via blob URLs.
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast("Download started.", "success");
    });
  });
}

/* ── Tab switching ───────────────────────────────────────────── */
function initTabs() {
  document.querySelectorAll(".tab-btn[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const group = btn.closest("section") || document;
      group.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      group.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const target = group.querySelector(`#tab-${btn.dataset.tab}`);
      if (target) target.classList.add("active");
    });
  });
}

/* ── History controls ───────────────────────────────────────── */
function initHistory() {
  $("btn-clear-history")?.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete ALL scan history? This cannot be undone.")) return;
    try {
      const r = await fetch("/api/clear-history", { method:"POST" });
      const d = await r.json();
      if (d.success) {
        toast("Scan history cleared.", "success");
        fetchAllScans();
        fetchStats();
        State.evidence = [];
        renderEvidenceTable([]);
      } else {
        toast(d.error || "Failed to clear history.", "error");
      }
    } catch(e) { toast("Error: " + e.message, "error"); }
  });
}

/* ── Misc bindings ───────────────────────────────────────────── */
function initMisc() {
  // Theme toggle
  $("btn-theme")?.addEventListener("click", () => {
    applyTheme(State.theme === "dark" ? "light" : "dark");
  });

  // Refresh stats
  $("btn-refresh-stats")?.addEventListener("click", fetchStats);

  // New scan quick link
  $("btn-new-scan")?.addEventListener("click", () => navigateTo("scanner"));
  $("btn-go-to-scanner")?.addEventListener("click", () => navigateTo("scanner"));
  $("btn-view-all-scans")?.addEventListener("click", () => navigateTo("scans"));

  // Evidence filters
  $("evidence-search")?.addEventListener("input", applyFilters);
  $("filter-risk")?.addEventListener("change", applyFilters);
  $("filter-category")?.addEventListener("change", applyFilters);

  // Timeline session filter
  $("timeline-session-filter")?.addEventListener("change", fetchTimeline);
}

/* ── Bootstrap ──────────────────────────────────────────────── */
function initApp() {
  initNavLinks();
  initSidebarToggle();
  initScanner();
  initUpload();
  initTableSort();
  initTabs();
  initModal();
  initLogs();
  initDownloads();
  initHistory();
  initMisc();

  // Initial data load
  fetchStats();

  // Expose for inline onclick
  window.openFileModal  = openFileModal;
  window.loadSessionEvidence = loadSessionEvidence;
  window.goPage         = goPage;
}
