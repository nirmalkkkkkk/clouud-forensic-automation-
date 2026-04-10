/*=============================================================
  CLOUD FORENSICS AUTOMATION — Healthcare Edition
  Frontend Application Logic
  Case: PRJN26-148  |  Investigator: Nirmal
=============================================================*/
"use strict";

// ─────────────────────────────────────────────────────────── //
//  STATE
// ─────────────────────────────────────────────────────────── //
const State = {
  currentSection : "dashboard",
  scanResults    : null,          // full evidence array from last scan
  filteredRows   : [],
  currentPage    : 1,
  rowsPerPage    : 15,
  charts         : { category: null, risk: null },
  sidebarCollapsed: false,
};

// ─────────────────────────────────────────────────────────── //
//  DOM HELPERS
// ─────────────────────────────────────────────────────────── //
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ─────────────────────────────────────────────────────────── //
//  TOAST NOTIFICATION
// ─────────────────────────────────────────────────────────── //
function toast(message, type = "info", duration = 3500) {
  const icons = { success: "fa-circle-check", error: "fa-circle-xmark", info: "fa-circle-info" };
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type]}"></i><span>${message}</span>`;
  $("#toast-container").appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 0.4s, transform 0.4s";
    el.style.opacity = "0";
    el.style.transform = "translateX(20px)";
    setTimeout(() => el.remove(), 400);
  }, duration);
}

// ─────────────────────────────────────────────────────────── //
//  PAGE LOADER
// ─────────────────────────────────────────────────────────── //
function hideLoader() {
  const loader = $("#page-loader");
  loader.classList.add("hidden");
}

// ─────────────────────────────────────────────────────────── //
//  DATETIME CLOCK
// ─────────────────────────────────────────────────────────── //
function startClock() {
  const el = $("#topbar-datetime");
  function tick() {
    const now = new Date();
    const d = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const t = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    el.textContent = `${d}  ${t}`;
  }
  tick();
  setInterval(tick, 1000);
}

// ─────────────────────────────────────────────────────────── //
//  SECTION NAVIGATION
// ─────────────────────────────────────────────────────────── //
function navigateTo(sectionId) {
  const breadcrumbMap = {
    dashboard: "Dashboard",
    scanner  : "Evidence Scanner",
    evidence : "Evidence Logs",
    activity : "Activity & Reports",
    logs     : "System Logs",
  };

  // hide all sections
  $$(".section").forEach(s => s.classList.remove("active"));
  $(`#section-${sectionId}`).classList.add("active");

  // update nav
  $$(".sidebar__link").forEach(l => l.classList.remove("active"));
  $(`#nav-${sectionId}`).classList.add("active");

  // update breadcrumb
  $("#breadcrumb").textContent = breadcrumbMap[sectionId] || sectionId;
  State.currentSection = sectionId;

  // lazy-load section data
  if (sectionId === "logs")     fetchLogs();
  if (sectionId === "activity") loadActivityTable();
  if (sectionId === "dashboard") loadDashboardStats();
}

// ─────────────────────────────────────────────────────────── //
//  SIDEBAR TOGGLE
// ─────────────────────────────────────────────────────────── //
function toggleSidebar() {
  State.sidebarCollapsed = !State.sidebarCollapsed;
  $("#sidebar").classList.toggle("sidebar--collapsed", State.sidebarCollapsed);
}

// ─────────────────────────────────────────────────────────── //
//  ANIMATE NUMBER
// ─────────────────────────────────────────────────────────── //
function animateNumber(el, target, suffix = "", duration = 900) {
  const start = performance.now();
  const from  = 0;
  function update(ts) {
    const pct = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - pct, 3);   // ease-out cubic
    el.textContent = Math.round(from + (target - from) * ease) + suffix;
    if (pct < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ─────────────────────────────────────────────────────────── //
//  LOAD DASHBOARD STATS
// ─────────────────────────────────────────────────────────── //
async function loadDashboardStats() {
  try {
    const res  = await fetch("/api/stats");
    const data = await res.json();

    animateNumber($("#sv-total-scans"), data.total_scans);
    animateNumber($("#sv-total-files"),  data.total_files);
    animateNumber($("#sv-high-risk"),    data.total_high_risk);
    $("#sv-investigator").textContent = data.investigator || "—";

    // Populate recent scans table
    const tbody = $("#recent-scans-tbody");
    if (!data.recent_scans || !data.recent_scans.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No scan history yet.</td></tr>`;
    } else {
      tbody.innerHTML = data.recent_scans.map((s, i) => `
        <tr class="fade-row" style="animation-delay:${i*0.05}s">
          <td>${s.timestamp}</td>
          <td style="font-family:var(--mono);font-size:0.78rem;color:var(--blue-light)">${s.directory}</td>
          <td>${s.files}</td>
          <td><span class="badge ${s.high_risk > 0 ? 'badge--high' : 'badge--low'}">${s.high_risk}</span></td>
          <td><span class="badge badge--ok"><i class="fa-solid fa-circle-check"></i> Completed</span></td>
        </tr>`).join("");
    }

    // Render charts only if we have scan results
    if (State.scanResults) renderCharts(State.scanResults);
  } catch (e) {
    console.error("Stats load error:", e);
  }
}

// ─────────────────────────────────────────────────────────── //
//  CHART RENDERING (Chart.js)
// ─────────────────────────────────────────────────────────── //
function renderCharts(evidence) {
  const catCount = {};
  const riskCount = { High: 0, Low: 0 };

  evidence.forEach(item => {
    const cat = item["Category"] || "Unknown";
    catCount[cat] = (catCount[cat] || 0) + 1;
    const risk = item["Risk Level"];
    if (riskCount[risk] !== undefined) riskCount[risk]++;
  });

  const catLabels = Object.keys(catCount);
  const catData   = Object.values(catCount);

  const palette = [
    "#3b82f6","#a855f7","#14b8a6","#f59e0b","#ef4444",
    "#22c55e","#ec4899","#8b5cf6","#06b6d4","#f97316"
  ];

  const chartDefaults = {
    plugins: {
      legend: { labels: { color: "#94a3b8", font: { family: "Inter", size: 11 }, boxWidth: 12, padding: 16 } }
    },
  };

  // ─ Category Doughnut ─
  const catCtx = $("#chart-category");
  if (State.charts.category) State.charts.category.destroy();
  if (catLabels.length) {
    catCtx.closest(".chart-canvas-wrap").style.display = "block";
    $("#chart-category-empty").style.display = "none";
    State.charts.category = new Chart(catCtx, {
      type: "doughnut",
      data: {
        labels: catLabels,
        datasets: [{
          data: catData,
          backgroundColor: palette.slice(0, catLabels.length).map(c => c + "bb"),
          borderColor: palette.slice(0, catLabels.length),
          borderWidth: 1.5,
          hoverOffset: 6,
        }]
      },
      options: {
        ...chartDefaults,
        cutout: "65%",
        responsive: true, maintainAspectRatio: false,
        plugins: { ...chartDefaults.plugins, tooltip: { callbacks: {
          label: ctx => ` ${ctx.label}: ${ctx.parsed} file(s)`
        }}}
      }
    });
  }

  // ─ Risk Bar Chart ─
  const riskCtx = $("#chart-risk");
  if (State.charts.risk) State.charts.risk.destroy();
  if (riskCount.High + riskCount.Low > 0) {
    riskCtx.closest(".chart-canvas-wrap").style.display = "block";
    $("#chart-risk-empty").style.display = "none";
    State.charts.risk = new Chart(riskCtx, {
      type: "bar",
      data: {
        labels: ["High Risk", "Low Risk"],
        datasets: [{
          data: [riskCount.High, riskCount.Low],
          backgroundColor: ["rgba(239,68,68,0.6)", "rgba(34,197,94,0.6)"],
          borderColor:      ["#ef4444",             "#22c55e"],
          borderWidth: 1.5,
          borderRadius: 6,
        }]
      },
      options: {
        ...chartDefaults,
        responsive: true, maintainAspectRatio: false,
        plugins: { ...chartDefaults.plugins, legend: { display: false } },
        scales: {
          x: { ticks: { color: "#94a3b8", font: { family: "Inter" } }, grid: { color: "rgba(255,255,255,0.04)" } },
          y: { ticks: { color: "#94a3b8", font: { family: "Inter" }, stepSize: 1 }, grid: { color: "rgba(255,255,255,0.04)" } },
        }
      }
    });
  }
}

// ─────────────────────────────────────────────────────────── //
//  STEP ANIMATION DURING SCAN
// ─────────────────────────────────────────────────────────── //
function runStepAnimation(totalMs) {
  const steps   = $$(".scan-step");
  const bar     = $("#scan-progress-bar");
  const stepMs  = totalMs / steps.length;

  steps.forEach(s => { s.className = "scan-step dimmed"; s.querySelector("i").className = "fa-regular fa-circle"; });

  let idx = 0;
  function nextStep() {
    if (idx >= steps.length) return;

    // Previous → done
    if (idx > 0) {
      const prev = steps[idx - 1];
      prev.className = "scan-step done";
      prev.querySelector("i").className = "fa-solid fa-circle-check";
    }

    // Current → active
    const cur = steps[idx];
    cur.className = "scan-step active-step";
    cur.querySelector("i").className = "fa-solid fa-circle-notch fa-spin";

    const pct = Math.round(((idx + 1) / steps.length) * 95);
    bar.style.width = pct + "%";

    idx++;
    setTimeout(nextStep, stepMs);
  }
  nextStep();
}

function finishSteps() {
  $$(".scan-step").forEach(s => {
    s.className = "scan-step done";
    s.querySelector("i").className = "fa-solid fa-circle-check";
  });
  $("#scan-progress-bar").style.width = "100%";
}

// ─────────────────────────────────────────────────────────── //
//  SCAN
// ─────────────────────────────────────────────────────────── //
async function startScan() {
  const path = $("#scan-path").value.trim();
  if (!path) { toast("Please enter a directory path.", "error"); return; }

  const btn = $("#btn-start-scan");
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Scanning...`;

  $("#scan-summary-grid").classList.add("hidden");

  // Show progress
  const progressEl = $("#scan-progress");
  progressEl.classList.add("active");
  progressEl.style.display = "flex";
  $("#scan-progress-text").textContent = "Launching forensic engine...";

  // Animate steps (estimate 6 seconds)
  runStepAnimation(5000);

  try {
    const res  = await fetch("/api/scan", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ directory_path: path }),
    });
    const data = await res.json();

    finishSteps();

    if (data.success) {
      State.scanResults  = data.evidence;
      State.filteredRows = [...data.evidence];
      State.currentPage  = 1;

      $("#scan-progress-text").textContent = "✓ Scan complete!";

      // Fill summary cards with animation
      setTimeout(() => {
        progressEl.classList.remove("active");
        progressEl.style.display = "none";
        const grid = $("#scan-summary-grid");
        grid.classList.remove("hidden");
        animateNumber($("#res-total"),    data.total_files);
        animateNumber($("#res-high"),     data.high_risk);
        animateNumber($("#res-low"),      data.total_files - data.high_risk);
        $("#res-duration").textContent = data.duration + "s";
      }, 800);

      buildEvidenceTable(data.evidence);
      renderCharts(data.evidence);
      loadDashboardStats();

      toast(`Scan complete — ${data.total_files} files analysed. ${data.high_risk} high-risk.`, "success");
    } else {
      $("#scan-progress-text").textContent = "Error: " + data.error;
      $(".scan-progress .spinner").style.display = "none";
      toast("Scan failed: " + data.error, "error");
    }
  } catch (err) {
    $("#scan-progress-text").textContent = "Network/server error.";
    toast("Error: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-bolt"></i> Launch Scan`;
  }
}

// ─────────────────────────────────────────────────────────── //
//  BUILD EVIDENCE TABLE
// ─────────────────────────────────────────────────────────── //
function buildEvidenceTable(evidence) {
  State.filteredRows = applyFilters(evidence);
  State.currentPage  = 1;
  renderTablePage();
}

function applyFilters(evidence) {
  const searchVal = ($("#evidence-search")?.value || "").toLowerCase();
  const riskVal   = $("#filter-risk")?.value || "";

  return evidence.filter(item => {
    const matchRisk   = !riskVal || item["Risk Level"] === riskVal;
    const text        = JSON.stringify(item).toLowerCase();
    const matchSearch = !searchVal || text.includes(searchVal);
    return matchRisk && matchSearch;
  });
}

function renderTablePage() {
  const rows   = State.filteredRows;
  const start  = (State.currentPage - 1) * State.rowsPerPage;
  const slice  = rows.slice(start, start + State.rowsPerPage);
  const tbody  = $("#evidence-tbody");
  const meta   = $("#table-meta");

  meta.textContent = `Showing ${start + 1}–${Math.min(start + State.rowsPerPage, rows.length)} of ${rows.length} evidence entries`;

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="table-empty">No matching evidence found.</td></tr>`;
    renderPagination(0);
    return;
  }

  tbody.innerHTML = slice.map((item, i) => {
    const risk       = item["Risk Level"];
    const anomaly    = item["Anomaly Flag"];
    const riskBadge  = `<span class="badge badge--${risk.toLowerCase()}">${risk}</span>`;
    const statusBadge= item["Status"] === "Modified After Breach"
      ? `<span class="badge badge--breach"><i class="fa-solid fa-triangle-exclamation"></i> Breached</span>`
      : `<span class="badge badge--ok"><i class="fa-solid fa-circle-check"></i> Normal</span>`;
    const anomalyBadge = anomaly && anomaly !== "None"
      ? `<span class="badge badge--anomaly" title="${anomaly}"><i class="fa-solid fa-bug"></i> ${anomaly.slice(0,18)}…</span>`
      : `<span class="badge badge--none">None</span>`;
    const shortMd5 = (item["MD5 Hash"] || "").slice(0, 12) + "…";
    const ext  = item["File Type"] || "";
    const name = item["File Name"] || "";

    return `<tr style="animation:fade-up 0.25s ${i * 0.03}s ease both">
      <td style="color:var(--text-muted)">${start + i + 1}</td>
      <td class="file-name-cell">${name}<span class="file-ext">${ext}</span></td>
      <td><code style="font-family:var(--mono);font-size:0.75rem">${ext}</code></td>
      <td>${item["File Size (KB)"]}</td>
      <td style="color:var(--text-secondary)">${item["Category"]}</td>
      <td>${statusBadge}</td>
      <td>${riskBadge}</td>
      <td>
        <span class="hash-cell" title="${item["MD5 Hash"]}" onclick="copyToClipboard('${item["MD5 Hash"]}', 'MD5 hash')">${shortMd5}</span>
      </td>
      <td>${anomalyBadge}</td>
      <td style="font-family:var(--mono);font-size:0.75rem;color:var(--text-secondary)">${item["Modified Time"]}</td>
      <td style="font-family:var(--mono);font-size:0.75rem;color:var(--text-muted)">${item["Created Time"]}</td>
    </tr>`;
  }).join("");

  renderPagination(rows.length);
}

function renderPagination(total) {
  const pages = Math.ceil(total / State.rowsPerPage);
  const pg    = $("#table-pagination");
  if (!pg) return;
  if (pages <= 1) { pg.innerHTML = ""; return; }

  let html = "";
  if (State.currentPage > 1)
    html += `<button class="page-btn" onclick="goPage(${State.currentPage - 1})"><i class="fa-solid fa-chevron-left"></i></button>`;
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - State.currentPage) <= 1)
      html += `<button class="page-btn ${p === State.currentPage ? "active" : ""}" onclick="goPage(${p})">${p}</button>`;
    else if (Math.abs(p - State.currentPage) === 2)
      html += `<span style="color:var(--text-muted);padding:0 4px">…</span>`;
  }
  if (State.currentPage < pages)
    html += `<button class="page-btn" onclick="goPage(${State.currentPage + 1})"><i class="fa-solid fa-chevron-right"></i></button>`;
  pg.innerHTML = html;
}

window.goPage = function(p) {
  State.currentPage = p;
  renderTablePage();
  $("#section-evidence").scrollTo({ top: 0, behavior: "smooth" });
};

// ─────────────────────────────────────────────────────────── //
//  COPY TO CLIPBOARD
// ─────────────────────────────────────────────────────────── //
window.copyToClipboard = function(text, label = "Text") {
  navigator.clipboard.writeText(text).then(() => toast(`${label} copied!`, "success", 2000));
};

// ─────────────────────────────────────────────────────────── //
//  ACTIVITY TABLE
// ─────────────────────────────────────────────────────────── //
async function loadActivityTable() {
  try {
    const res  = await fetch("/api/stats");
    const data = await res.json();
    const tbody = $("#activity-tbody");

    // Use full data — re-fetch activity separately if needed
    const res2 = await fetch("/api/stats");
    const d2   = await res2.json();

    // We only have last 5 from stats; approximate from recent_scans
    const all = d2.recent_scans || [];
    if (!all.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="table-empty">No activity recorded yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = all.map((s, i) => `
      <tr>
        <td style="color:var(--text-muted)">${i + 1}</td>
        <td style="font-family:var(--mono);font-size:0.78rem">${s.timestamp}</td>
        <td style="font-family:var(--mono);font-size:0.78rem;color:var(--blue-light)">${s.directory}</td>
        <td>${s.files}</td>
        <td><span class="badge ${s.high_risk > 0 ? 'badge--high' : 'badge--low'}">${s.high_risk}</span></td>
      </tr>`).join("");
  } catch (e) {
    console.error(e);
  }
}

// ─────────────────────────────────────────────────────────── //
//  SYSTEM LOGS
// ─────────────────────────────────────────────────────────── //
async function fetchLogs() {
  const body = $("#log-body");
  body.innerHTML = `<p class="log-empty">Fetching logs…</p>`;
  try {
    const res  = await fetch("/api/logs");
    const data = await res.json();
    if (!data.lines || !data.lines.length) {
      body.innerHTML = `<p class="log-empty">No log entries yet.</p>`;
      return;
    }
    body.innerHTML = data.lines.map(line => {
      let cls = "log-line";
      if (line.includes("ERROR"))   cls += " log-line--error";
      else if (line.includes("WARNING")) cls += " log-line--warning";
      else if (line.includes("INFO"))    cls += " log-line--info";
      return `<span class="${cls}">${escHtml(line)}</span>`;
    }).join("\n");

    if ($("#toggle-autoscroll")?.checked) body.scrollTop = body.scrollHeight;
  } catch (e) {
    body.innerHTML = `<p style="color:var(--red)">Failed to fetch logs: ${e.message}</p>`;
  }
}

function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ─────────────────────────────────────────────────────────── //
//  DOWNLOAD REPORT
// ─────────────────────────────────────────────────────────── //
function downloadReport() {
  toast("Downloading forensic report…", "info", 2500);
  window.location.href = "/api/download-report";
}

// ─────────────────────────────────────────────────────────── //
//  CLEAR ACTIVITY
// ─────────────────────────────────────────────────────────── //
async function clearActivity() {
  if (!confirm("Clear all scan activity history? This cannot be undone.")) return;
  await fetch("/api/clear-activity", { method: "POST" });
  toast("Activity log cleared.", "success");
  loadActivityTable();
  loadDashboardStats();
}

// ─────────────────────────────────────────────────────────── //
//  BIND ALL EVENTS
// ─────────────────────────────────────────────────────────── //
function bindEvents() {
  // Sidebar navigation
  $$(".sidebar__link").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      navigateTo(link.dataset.section);
    });
  });

  // Sidebar toggle
  $("#btn-toggle-sidebar").addEventListener("click", toggleSidebar);

  // Go to scanner
  $("#btn-go-to-scanner")?.addEventListener("click", () => navigateTo("scanner"));

  // Start scan
  $("#btn-start-scan").addEventListener("click", startScan);

  // Enter key on path input
  $("#scan-path").addEventListener("keydown", e => { if (e.key === "Enter") startScan(); });

  // Evidence table filters
  $("#evidence-search")?.addEventListener("input", () => {
    if (!State.scanResults) return;
    State.filteredRows = applyFilters(State.scanResults);
    State.currentPage  = 1;
    renderTablePage();
  });
  $("#filter-risk")?.addEventListener("change", () => {
    if (!State.scanResults) return;
    State.filteredRows = applyFilters(State.scanResults);
    State.currentPage  = 1;
    renderTablePage();
  });

  // Download buttons
  $("#btn-download-report")?.addEventListener("click", downloadReport);
  $("#btn-nav-download")?.addEventListener("click", downloadReport);
  $("#btn-dl-report-activity")?.addEventListener("click", downloadReport);

  // Refresh stats
  $("#btn-refresh-stats")?.addEventListener("click", () => {
    loadDashboardStats();
    toast("Stats refreshed.", "info", 2000);
  });

  // Refresh logs
  $("#btn-refresh-logs")?.addEventListener("click", fetchLogs);

  // Clear activity
  $("#btn-clear-activity")?.addEventListener("click", clearActivity);
}

// ─────────────────────────────────────────────────────────── //
//  INIT
// ─────────────────────────────────────────────────────────── //
document.addEventListener("DOMContentLoaded", () => {
  startClock();
  bindEvents();
  loadDashboardStats();

  // Hide loader after 1.5 s
  setTimeout(hideLoader, 1500);
});
