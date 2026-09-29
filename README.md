# ZB202 Occupancy and CO2 Control Simulator

Standalone research prototype for comparing fixed ventilation, current occupancy response, and predictive ventilation control in a single-zone ZB202 simulation. ZB202 currently has no independent VAV; ventilation is managed through the AHU and an independent outdoor-air damper. The page never writes to the AHU, damper, or BMS.

## Open the page

Open `index.html` directly in Chrome, or run a local static server from this directory, for example `python -m http.server 8000`, then open `http://127.0.0.1:8000/`. The default simulation works offline. If the original ZB202 InfluxDB bridge is running locally on port 8787, the page may offer a recent measured CO2 reading as a manually selected initial value. No credentials are stored here.

## Reproduce the outputs

- `npm run test` checks occupancy bounds, forecast probabilities, CO2 mass balance, and policy inputs.
- `npm run build:browser` regenerates the classic browser script used by `index.html`. Commit it after changing `model.js` or `app.js` so the page works when opened with `file://`.
- `npm run results` regenerates `docs/experiment/simulation-summary.json` and `docs/experiment/representative-day.csv` from fixed seeds. Node.js 20 or newer is sufficient; no npm install is required.
- See [method and assumptions](docs/experiment/README.md) and the [Word execution report](docs/experiment/ZB202_execution_report.docx).

The published comparison uses simulated 0–10 person traces, assumed effective outdoor airflow, and a default 600 ppm initial CO2. Real IoT CO2 data were verified as readable from five sensors in the original project, but were not used to produce the published 20-day comparison. The CSV and JSON contain synthetic results only.
