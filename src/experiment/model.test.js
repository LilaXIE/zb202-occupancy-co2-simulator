import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, forecastOccupancy, generateOccupancy, nextCo2Ppm, roomVolumeM3, runExperiment, trainTimeVaryingMarkov } from "./model.js";

test("room volume uses confirmed dimensions", () => {
  assert.equal(roomVolumeM3(), 284.321);
});

test("occupancy scenarios are reproducible and remain within 0–10", () => {
  const first = generateOccupancy(42);
  assert.deepEqual(first, generateOccupancy(42));
  assert.notDeepEqual(first, generateOccupancy(43));
  assert.ok(first.every((count) => Number.isInteger(count) && count >= 0 && count <= 10));
});

test("CO₂ mass balance conserves the outdoor equilibrium and responds to people and ventilation", () => {
  assert.ok(Math.abs(nextCo2Ppm(420, 0, 200) - 420) < 1e-9);
  assert.ok(nextCo2Ppm(600, 5, 100) > nextCo2Ppm(600, 5, 600));
  assert.ok(nextCo2Ppm(600, 0, 100) < 600);
});

test("forecast begins at the observed count and probabilities remain valid", () => {
  const matrices = trainTimeVaryingMarkov(10);
  for (const matrix of matrices) for (const row of matrix) {
    assert.ok(row.every((value) => value >= 0 && value <= 1));
    assert.ok(Math.abs(row.reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
  }
  const forecast = forecastOccupancy(4, 100, matrices);
  assert.equal(forecast[0].expected, 4);
  assert.equal(forecast[0].probabilityOccupied, 1);
  assert.ok(forecast.every(({ expected, probabilityOccupied }) => expected >= 0 && expected <= 10 && probabilityOccupied >= 0 && probabilityOccupied <= 1));
});

test("all policies use the same scenario and choose only configured airflow values", () => {
  const result = runExperiment();
  assert.deepEqual(result.results.map(({ rows }) => rows.map((row) => row.people)), Array(3).fill(result.occupancy));
  for (const policy of result.results) {
    assert.equal(policy.rows.length, 288);
    assert.ok(policy.rows.every((row) => DEFAULTS.airflowChoicesM3h.includes(row.airflowM3h) && Number.isFinite(row.co2Ppm)));
  }
});
