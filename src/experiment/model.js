// ZB202 research prototype. Every airflow value here is an assumed effective
// outdoor-air rate, not a BMS measurement or a command to physical equipment.
export const DEFAULTS = Object.freeze({
  stepMinutes: 5,
  widthM: 5.9,
  lengthM: 7.9,
  heightM: 6.1,
  outdoorCo2Ppm: 420,
  co2GenerationM3PerHourPerson: 0.018,
  targetCo2Ppm: 800,
  initialCo2Ppm: 600,
  airflowChoicesM3h: [100, 200, 300, 450, 600],
  fixedAirflowM3h: 300,
});

export const roomVolumeM3 = (config = DEFAULTS) => config.widthM * config.lengthM * config.heightM;

export function random(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Occupants arrive in groups and stay for multiple steps. This is a scenario
// generator for software experiments, not a model learned from ZB202 people.
export function generateOccupancy(seed, steps = 288) {
  const draw = random(seed);
  const counts = [];
  let occupants = 0;
  let remaining = 0;
  for (let step = 0; step < steps; step += 1) {
    const hour = step / 12;
    if (remaining > 0) {
      remaining -= 1;
      if (draw() < 0.035) occupants = Math.max(0, occupants - 1);
      if (remaining === 0) occupants = 0;
    } else {
      const active = (hour >= 9 && hour < 12) || (hour >= 13 && hour < 18);
      const arrivalProbability = active ? 0.075 : hour >= 8 && hour < 19 ? 0.012 : 0.001;
      if (draw() < arrivalProbability) {
        occupants = 1 + Math.floor(draw() * 10);
        remaining = 4 + Math.floor(draw() * 21); // 20–120 minutes
      }
    }
    counts.push(occupants);
  }
  return counts;
}

export function trainTimeVaryingMarkov(days = 120, seed = 1000, steps = 288) {
  const states = 11;
  const global = Array.from({ length: states }, () => Array(states).fill(0.2));
  const local = Array.from({ length: steps }, () => Array.from({ length: states }, () => Array(states).fill(0)));
  for (let day = 0; day < days; day += 1) {
    const trace = generateOccupancy(seed + day, steps);
    for (let t = 0; t < steps - 1; t += 1) {
      global[trace[t]][trace[t + 1]] += 1;
      for (let offset = -6; offset <= 6; offset += 1) {
        const slot = (t + offset + steps) % steps;
        local[slot][trace[t]][trace[t + 1]] += 1 - Math.abs(offset) / 7;
      }
    }
  }
  const globalProbabilities = global.map((row) => normalize(row));
  return local.map((matrix) => matrix.map((row, from) => normalize(
    row.map((count, to) => count + 3 * globalProbabilities[from][to]),
  )));
}

function normalize(row) {
  const total = row.reduce((sum, value) => sum + value, 0);
  return row.map((value) => value / total);
}

export function forecastOccupancy(currentCount, startStep, matrices, horizon = 24) {
  let distribution = Array(11).fill(0);
  distribution[currentCount] = 1;
  const forecast = [];
  for (let offset = 0; offset < horizon; offset += 1) {
    forecast.push({
      expected: distribution.reduce((sum, probability, count) => sum + probability * count, 0),
      probabilityOccupied: 1 - distribution[0],
    });
    const transition = matrices[(startStep + offset) % matrices.length];
    const next = Array(11).fill(0);
    for (let from = 0; from < 11; from += 1) {
      for (let to = 0; to < 11; to += 1) next[to] += distribution[from] * transition[from][to];
    }
    distribution = next;
  }
  return forecast;
}

export function nextCo2Ppm(currentPpm, occupancy, effectiveOutdoorAirM3h, config = DEFAULTS) {
  const volume = roomVolumeM3(config);
  const hours = config.stepMinutes / 60;
  const generationPpmM3h = 1e6 * config.co2GenerationM3PerHourPerson * occupancy;
  if (effectiveOutdoorAirM3h <= 0) return currentPpm + generationPpmM3h * hours / volume;
  const equilibrium = config.outdoorCo2Ppm + generationPpmM3h / effectiveOutdoorAirM3h;
  return equilibrium + (currentPpm - equilibrium) * Math.exp(-effectiveOutdoorAirM3h * hours / volume);
}

export function choosePredictiveAirflow(currentPpm, currentCount, previousAirflow, startStep, matrices, config = DEFAULTS) {
  const forecast = forecastOccupancy(currentCount, startStep, matrices);
  let beam = [{ ppm: currentPpm, airflow: previousAirflow, cost: 0, first: null }];
  for (const prediction of forecast) {
    const candidates = [];
    for (const path of beam) {
      for (const airflow of config.airflowChoicesM3h) {
        const ppm = nextCo2Ppm(path.ppm, prediction.expected, airflow, config);
        const excess = Math.max(0, ppm - config.targetCo2Ppm) / 100;
        const iaqCost = prediction.probabilityOccupied * excess ** 2;
        const airCost = 0.10 * airflow / Math.max(...config.airflowChoicesM3h);
        const changeCost = 0.02 * Math.abs(airflow - path.airflow) / Math.max(...config.airflowChoicesM3h);
        candidates.push({ ppm, airflow, cost: path.cost + iaqCost + airCost + changeCost, first: path.first ?? airflow });
      }
    }
    candidates.sort((a, b) => a.cost - b.cost);
    beam = candidates.slice(0, 32);
  }
  return beam[0].first;
}

export function simulatePolicy(occupancy, policy, matrices, config = DEFAULTS) {
  let ppm = config.initialCo2Ppm;
  let previousAirflow = config.airflowChoicesM3h[0];
  const rows = [];
  for (let step = 0; step < occupancy.length; step += 1) {
    const people = occupancy[step];
    const airflow = policy === "fixed" ? config.fixedAirflowM3h
      : policy === "reactive" ? config.airflowChoicesM3h.find((choice) => choice >= 100 + 50 * people) ?? config.airflowChoicesM3h.at(-1)
        : choosePredictiveAirflow(ppm, people, previousAirflow, step, matrices, config);
    ppm = nextCo2Ppm(ppm, people, airflow, config);
    rows.push({ step, people, airflowM3h: airflow, co2Ppm: ppm });
    previousAirflow = airflow;
  }
  const occupied = rows.filter((row) => row.people > 0);
  return {
    policy,
    rows,
    summary: {
      occupiedSteps: occupied.length,
      occupiedMinutesAboveTarget: occupied.filter((row) => row.co2Ppm > config.targetCo2Ppm).length * config.stepMinutes,
      peakCo2Ppm: Math.round(Math.max(...rows.map((row) => row.co2Ppm))),
      meanOccupiedCo2Ppm: occupied.length ? Math.round(occupied.reduce((sum, row) => sum + row.co2Ppm, 0) / occupied.length) : null,
      totalOutdoorAirM3: Math.round(rows.reduce((sum, row) => sum + row.airflowM3h * config.stepMinutes / 60, 0)),
      airflowChanges: rows.filter((row, index) => index > 0 && row.airflowM3h !== rows[index - 1].airflowM3h).length,
    },
  };
}

export function runExperiment(seed = 20260929, config = DEFAULTS) {
  const occupancy = generateOccupancy(seed);
  // Separate seeds prevent using the evaluation day's future occupancy in training.
  const matrices = trainTimeVaryingMarkov(120, 1000);
  return {
    seed,
    config,
    volumeM3: roomVolumeM3(config),
    occupancy,
    results: ["fixed", "reactive", "predictive"].map((policy) => simulatePolicy(occupancy, policy, matrices, config)),
  };
}
