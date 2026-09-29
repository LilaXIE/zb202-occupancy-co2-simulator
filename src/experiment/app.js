import { DEFAULTS, runExperiment } from "./model.js";

const seedInput = document.getElementById("seed");
const initialInput = document.getElementById("initial-co2");
const summary = document.getElementById("summary");
const chart = document.getElementById("chart");
const liveStatus = document.getElementById("live-status");
const liveButton = document.getElementById("use-live");
const occupancyStep = document.getElementById("occupancy-step");
const occupancyTime = document.getElementById("occupancy-time");
const occupancyCount = document.getElementById("occupancy-count");
const occupancyBars = document.getElementById("occupancy-bars");
const names = { fixed: "固定通风", reactive: "当前人数响应", predictive: "预测控制" };
let latestLive = null;
let experiment;

function pathFor(values, min, max, width, height) {
  return values.map((value, index) => `${index ? "L" : "M"}${(index / (values.length - 1) * width).toFixed(1)},${(height - (value - min) / (max - min) * height).toFixed(1)}`).join(" ");
}

function renderChart(data) {
  const width = 960;
  const height = 260;
  const traces = Object.fromEntries(data.results.map((item) => [item.policy, item.rows.map((row) => row.co2Ppm)]));
  const maxPpm = Math.max(1200, Math.ceil(Math.max(...Object.values(traces).flat()) / 200) * 200);
  const horizontal = [400, 600, 800, 1000, 1200].filter((value) => value <= maxPpm);
  chart.innerHTML = `<svg viewBox="0 0 ${width + 65} ${height + 38}" preserveAspectRatio="none" aria-hidden="true">
    ${horizontal.map((value) => `<line class="grid" x1="0" x2="${width}" y1="${height - (value - 350) / (maxPpm - 350) * height}" y2="${height - (value - 350) / (maxPpm - 350) * height}"/><text class="axis" x="${width + 9}" y="${height - (value - 350) / (maxPpm - 350) * height + 4}">${value}</text>`).join("")}
    <path class="target" d="${pathFor(Array(288).fill(data.config.targetCo2Ppm), 350, maxPpm, width, height)}"/>
    ${Object.entries(traces).map(([policy, values]) => `<path class="${policy}" d="${pathFor(values, 350, maxPpm, width, height)}"/>`).join("")}
    <path class="people" d="${pathFor(data.occupancy, 0, 10, width, height)}"/>
    ${[0, 6, 12, 18, 24].map((hour) => `<text class="axis" x="${hour / 24 * width}" y="${height + 26}" text-anchor="${hour === 0 ? "start" : hour === 24 ? "end" : "middle"}">${String(hour).padStart(2, "0")}:00</text>`).join("")}
  </svg>`;
}

function render(data) {
  renderOccupancy(data);
  summary.innerHTML = data.results.map(({ policy, summary: metric }) => `<article class="result ${policy}">
    <h3>${names[policy]}</h3><div><span>占用时超过目标</span><strong>${metric.occupiedMinutesAboveTarget} min</strong></div>
    <div><span>占用时平均 CO₂</span><strong>${metric.meanOccupiedCo2Ppm ?? "—"} ppm</strong></div>
    <div><span>全天 CO₂ 峰值</span><strong>${metric.peakCo2Ppm} ppm</strong></div>
    <div><span>累计室外空气量</span><strong>${metric.totalOutdoorAirM3} m³</strong></div>
    <div><span>风量切换次数</span><strong>${metric.airflowChanges}</strong></div>
  </article>`).join("");
  renderChart(data);
}

function renderOccupancy(data) {
  const people = data.occupancy;
  occupancyStep.max = String(people.length - 1);
  const firstOccupied = people.findIndex((count) => count > 0);
  occupancyStep.value = String(firstOccupied < 0 ? 0 : firstOccupied);
  occupancyBars.innerHTML = `<svg viewBox="0 0 288 80" preserveAspectRatio="none">${people.map((count, step) => `<rect x="${step}" y="${80 - count * 7}" width="1" height="${count * 7}"/>`).join("")}</svg>`;
  document.getElementById("occupancy-peak").textContent = String(Math.max(...people));
  document.getElementById("occupancy-minutes").textContent = String(people.filter((count) => count > 0).length * data.config.stepMinutes);
  showOccupancyStep();
}

function showOccupancyStep() {
  if (!experiment) return;
  const step = Number(occupancyStep.value);
  occupancyTime.textContent = `${String(Math.floor(step / 12)).padStart(2, "0")}:${String(step % 12 * 5).padStart(2, "0")}`;
  occupancyCount.textContent = String(experiment.occupancy[step]);
  occupancyStep.setAttribute("aria-valuetext", `${occupancyTime.textContent}，模拟 ${experiment.occupancy[step]} 人`);
}

function run() {
  const seed = Number(seedInput.value);
  const initialCo2Ppm = Number(initialInput.value);
  if (!Number.isInteger(seed) || seed < 1 || seed > 4294967295 || !Number.isFinite(initialCo2Ppm) || initialCo2Ppm < 350 || initialCo2Ppm > 3000) {
    window.alert("请输入有效的随机种子和 350–3000 ppm 的初始 CO₂。");
    return;
  }
  experiment = runExperiment(seed, { ...DEFAULTS, initialCo2Ppm });
  render(experiment);
}

function csvCell(value) { return String(value).replaceAll('"', '""'); }
function downloadCsv() {
  const header = "step,time,simulated_people,fixed_co2_ppm,fixed_outdoor_air_m3h,reactive_co2_ppm,reactive_outdoor_air_m3h,predictive_co2_ppm,predictive_outdoor_air_m3h";
  const [fixed, reactive, predictive] = experiment.results.map((result) => result.rows);
  const rows = fixed.map((row, index) => [index, `${String(Math.floor(index / 12)).padStart(2, "0")}:${String(index % 12 * 5).padStart(2, "0")}`, row.people, fixed[index].co2Ppm.toFixed(1), fixed[index].airflowM3h, reactive[index].co2Ppm.toFixed(1), reactive[index].airflowM3h, predictive[index].co2Ppm.toFixed(1), predictive[index].airflowM3h].map(csvCell).join(","));
  const csv = [header, ...rows].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `zb202-simulation-seed-${experiment.seed}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function connectBridge() {
  const socket = new WebSocket("ws://127.0.0.1:8787");
  const timeout = window.setTimeout(() => { if (!latestLive) liveStatus.textContent = "本地桥接未提供 CO₂ 数据"; }, 5000);
  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type !== "telemetry") return;
    const ppm = Number(message.values?.co2);
    const timestamp = Date.parse(message.receivedAt);
    if (!Number.isFinite(ppm) || ppm < 350 || ppm > 3000 || !Number.isFinite(timestamp) || Date.now() - timestamp > 15 * 60 * 1000) return;
    if (!latestLive || timestamp > latestLive.timestamp) {
      latestLive = { ppm, timestamp, device: message.deviceId || message.devEui || "CO₂ sensor" };
      liveButton.disabled = false;
      liveStatus.textContent = `最新实测：${Math.round(ppm)} ppm · ${latestLive.device} · ${new Date(timestamp).toLocaleTimeString()}`;
      window.clearTimeout(timeout);
    }
  });
  socket.addEventListener("error", () => { if (!latestLive) liveStatus.textContent = "本地桥接不可用；可继续离线仿真"; });
  socket.addEventListener("close", () => { if (!latestLive) liveStatus.textContent = "本地桥接未连接；可继续离线仿真"; });
}

document.getElementById("run").addEventListener("click", run);
document.getElementById("download").addEventListener("click", downloadCsv);
occupancyStep.addEventListener("input", showOccupancyStep);
liveButton.addEventListener("click", () => {
  if (!latestLive) return;
  if (Date.now() - latestLive.timestamp > 15 * 60 * 1000) {
    liveButton.disabled = true;
    liveStatus.textContent = "实测 CO₂ 已超过 15 分钟，请等待新读数";
    return;
  }
  initialInput.value = String(Math.round(latestLive.ppm));
  run();
});
run();
connectBridge();
