# Archived LAN bridge

**This file is the Tuya LAN attempt. It is not how the robot moves.** On the Serie 50 those local ports are closed, and re-pairing into Smart Life can orphan the vacuum. The working path is [`alexa_relay.py`](alexa_relay.py) plus [`ALEXA_SETUP.md`](ALEXA_SETUP.md): glasses → this Mac → an Alexa routine → the robot.

The notes below are kept so the dead end stays documented.

Your **X-Plorer Serie 50 (RR7387)** is a **Tuya** Wi‑Fi robot. Specs / Lens Studio cannot open a Tuya TCP socket to the vacuum. This small Python server on your Mac was the attempted link:

```text
Specs / Lens Studio  --HTTP-->  bridge/server.py (this Mac)  --Tuya LAN-->  RR7387
```

## One-time pairing + keys

> **Serie 50 (RR7387) warning:** Pair **only** in the **Rowenta Robots** app. SoftAP is `SEB_ACCESS_POINT`. Do **not** delete the robot to re-pair in Smart Life / Tuya Smart — that path usually fails (OEM lock) and can leave the vacuum orphaned until you re-pair in Rowenta Robots. iot.tuya.com “Link App Account” only lists Smart Life / Tuya Smart devices, so OEM Rowenta accounts often show **0 devices**.

1. Put the robot in pairing mode (IFU: undock → orange blink / SoftAP).
2. Pair it in the **Rowenta Robots** app on your phone (**2.4 GHz Wi‑Fi only**).
3. Obtain `device_id` + `local_key` from the OEM session (app capture / supported key tool) — **not** by migrating to Smart Life.
4. Optional later: Tuya Cloud OpenAPI only if a non-OEM path is proven; do not treat it as the default unlock.
5. From this folder:

```bash
cd bridge
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m tinytuya wizard
```

6. Copy `id`, `key`, and LAN `ip` from the wizard/`devices.json` into:

```bash
cp config.example.json config.json
# edit config.json — replace REPLACE_* fields
```

7. Confirm LAN reachability:

```bash
python -m tinytuya scan
curl -s http://127.0.0.1:8787/discover   # after server is running
```

Use `/discover` to see raw DPS if Start/Dock mapping needs tweaks in `dp_map`.

## Run the bridge

```bash
cd bridge
source .venv/bin/activate
python server.py
```

You should see:

- `http://127.0.0.1:8787/health` — Lens Studio Preview on this Mac  
- `http://YOUR_LAN_IP:8787/health` — Specs on the same Wi‑Fi (localhost does **not** work on glasses)

## Lens Studio wiring

On `RowentaXplorerApp / ControlPanel` → **VacuumDeviceBridge**:

| Field | Preview (Mac) | Specs device |
|-------|---------------|--------------|
| `useSimulation` | **false** | **false** |
| `bridgeEndpointUrl` | `http://127.0.0.1:8787` | `http://YOUR_MAC_LAN_IP:8787` |

Also:

1. **Device Type Override = Specs** in Preview (otherwise InternetModule returns 404).
2. Enable **Experimental APIs** for plain `http://` (required for local bridge; not publishable).
3. Mac firewall: allow Python inbound on port **8787**.

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Bridge up? |
| GET | `/state` | Live mapped robot state |
| GET | `/discover` | Raw Tuya status / DPS dump |
| POST | `/command` | Body = Lens `VacuumCommandPayload` |

## Security note

`config.json` holds your **local_key**. It is gitignored — never commit it.
