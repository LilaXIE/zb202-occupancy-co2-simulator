import { mkdir, writeFile } from "node:fs/promises";
import { DEFAULTS, runExperiment } from "../src/experiment/model.js";

const output = new URL("../docs/experiment/", import.meta.url);
await mkdir(output, { recursive: true });
const seeds = Array.from({ length: 20 }, (_, index) => 20260929 + index);
const runs = seeds.map((seed) => runExperiment(seed));
const metrics = ["occupiedMinutesAboveTarget", "peakCo2Ppm", "meanOccupiedCo2Ppm", "totalOutdoorAirM3", "airflowChanges"];
const policies = ["fixed", "reactive", "predictive"];
const aggregate = Object.fromEntries(policies.map((policy, index) => [policy, Object.fromEntries(metrics.map((metric) => {
  const values = runs.map((run) => run.results[index].summary[metric]).filter(Number.isFinite);
  return [metric, Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10];
}))]));

const report = {
  label: "Synthetic research simulation; no BMS actuation or measured ventilation data",
  seeds,
  trainingSeeds: "1000–1119 (synthetic, separate from evaluation seeds)",
  volumeM3: runs[0].volumeM3,
  assumedParameters: DEFAULTS,
  meanAcross20Days: aggregate,
  perDay: runs.map((run) => ({ seed: run.seed, policies: Object.fromEntries(run.results.map((result) => [result.policy, result.summary])) })),
};
await writeFile(new URL("simulation-summary.json", output), `${JSON.stringify(report, null, 2)}\n`);

const representative = runs[0];
const [fixed, reactive, predictive] = representative.results.map((result) => result.rows);
const csv = [
  "step,time,simulated_people,fixed_co2_ppm,fixed_effective_outdoor_air_m3h,reactive_co2_ppm,reactive_effective_outdoor_air_m3h,predictive_co2_ppm,predictive_effective_outdoor_air_m3h",
  ...fixed.map((row, index) => [
    index,
    `${String(Math.floor(index / 12)).padStart(2, "0")}:${String(index % 12 * 5).padStart(2, "0")}`,
    row.people,
    fixed[index].co2Ppm.toFixed(1), fixed[index].airflowM3h,
    reactive[index].co2Ppm.toFixed(1), reactive[index].airflowM3h,
    predictive[index].co2Ppm.toFixed(1), predictive[index].airflowM3h,
  ].join(",")),
].join("\n");
await writeFile(new URL("representative-day.csv", output), `${csv}\n`);
console.log(JSON.stringify(aggregate, null, 2));
