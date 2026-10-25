#!/usr/bin/env python3
"""
Rowenta X-Plorer Serie 50 (RR7387) ↔ Lens Studio / Specs bridge.

Peak path = ON-DEVICE testing:
  Specs (glasses) --HTTP--> this Mac (LAN IP) --Tuya--> RR7387

Modes:
  python server.py --probe     # Specs↔Mac connectivity only (no vacuum keys)
  python server.py             # Live Tuya control (needs config.json)

localhost works in Lens Studio Preview only. On Specs hardware you MUST use
the Mac LAN IP (e.g. http://192.168.x.x:8787) and Experimental APIs for http://.
"""

from __future__ import annotations

import argparse
import json
import socket
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"

DEFAULT_STATE = {
    "modelId": "RR7387WH",
    "runState": "Idle",
    "mode": "Idle",
    "power": "Normal",
    "batteryPercent": 0,
    "isCharging": False,
    "cleanedSurfaceM2": 0,
    "lastCommand": "none",
    "lastMessage": "Bridge booting",
    "simulation": False,
}

PROBE = False
CFG: Dict[str, Any] = {}
BRIDGE: Any = None


def guess_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "YOUR_LAN_IP"


def load_config() -> Dict[str, Any]:
    if not CONFIG_PATH.exists():
        raise SystemExit(
            f"Missing {CONFIG_PATH}. For Specs↔Mac network test first:\n"
            f"  python server.py --probe\n"
            f"For live vacuum: cp config.example.json config.json and run tinytuya wizard."
        )
    with CONFIG_PATH.open() as f:
        return json.load(f)


class ProbeBridge:
    """No Tuya — proves Specs can reach this Mac over Wi‑Fi."""

    def __init__(self) -> None:
        self.state = dict(DEFAULT_STATE)
        self.state["simulation"] = True
        self.state["lastMessage"] = "PROBE MODE — Specs↔Mac OK path; vacuum keys not loaded"
        self.last_raw: Dict[str, Any] = {"probe": True}

    def refresh(self) -> Dict[str, Any]:
        self.state["lastMessage"] = "PROBE MODE — /state reachable from client"
        return self.state

    def handle_command(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        cmd = payload.get("command")
        self.state["lastCommand"] = str(cmd)
        self.state["lastMessage"] = f"PROBE echo OK: {cmd} (not sent to vacuum yet)"
        if cmd == "StartClean":
            self.state["runState"] = "Cleaning"
            self.state["isCharging"] = False
        elif cmd == "Pause":
            self.state["runState"] = "Paused"
        elif cmd == "Resume":
            self.state["runState"] = "Cleaning"
        elif cmd == "Stop":
            self.state["runState"] = "Idle"
        elif cmd == "ReturnToDock":
            self.state["runState"] = "Returning"
        elif cmd == "SetMode" and payload.get("mode"):
            self.state["mode"] = payload["mode"]
        elif cmd == "SetPower" and payload.get("power"):
            self.state["power"] = payload["power"]
        return self.state


class VacuumBridge:
    def __init__(self, cfg: Dict[str, Any]):
        import tinytuya

        self.cfg = cfg
        self.dp = cfg.get("dp_map", {})
        self.mode_values = cfg.get("mode_values", {})
        self.power_values = cfg.get("power_values", {})
        device_id = cfg["device_id"]
        device_ip = cfg["device_ip"]
        local_key = cfg["local_key"]
        version = float(cfg.get("protocol_version", 3.3))
        if "REPLACE" in str(device_id) or "REPLACE" in str(local_key) or "REPLACE" in str(device_ip):
            raise SystemExit(
                "config.json still has REPLACE_* placeholders.\n"
                "Run `python -m tinytuya wizard`, fill keys, OR use: python server.py --probe"
            )
        self.device = tinytuya.Device(device_id, device_ip, local_key, version=version)
        self.device.set_socketPersistent(True)
        self.last_raw: Dict[str, Any] = {}
        self.state = dict(DEFAULT_STATE)
        self.state["lastMessage"] = f"LIVE → {device_ip}"

    def code(self, name: str) -> str:
        return str(self.dp.get(name, name))

    def set_dp(self, name: str, value: Any) -> Dict[str, Any]:
        code = self.code(name)
        try:
            result = self.device.set_value(code, value)
        except Exception:
            if str(code).isdigit():
                result = self.device.set_value(int(code), value)
            else:
                raise
        return result if isinstance(result, dict) else {"result": result}

    def refresh(self) -> Dict[str, Any]:
        raw = self.device.status()
        self.last_raw = raw if isinstance(raw, dict) else {"raw": raw}
        dps = self.last_raw.get("dps") or self.last_raw.get("Data") or {}
        if isinstance(dps, dict):
            self._apply_dps(dps)
        err = self.last_raw.get("Error") or self.last_raw.get("err")
        if err:
            self.state["lastMessage"] = f"Tuya error: {err}"
        elif self.state["lastMessage"].startswith("Tuya error"):
            self.state["lastMessage"] = "Connected (LAN)"
        return self.state

    def _apply_dps(self, dps: Dict[str, Any]) -> None:
        lookup = {str(k): v for k, v in dps.items()}

        def get_named(name: str, *numeric_fallbacks: str) -> Any:
            code = self.code(name)
            if code in lookup:
                return lookup[code]
            for n in numeric_fallbacks:
                if n in lookup:
                    return lookup[n]
            return None

        battery = get_named("battery", "6", "14", "15")
        if battery is not None:
            try:
                self.state["batteryPercent"] = int(battery)
            except (TypeError, ValueError):
                pass

        status = get_named("status", "5")
        if isinstance(status, str):
            s = status.lower()
            if "charg" in s:
                self.state["runState"] = "Charging"
                self.state["isCharging"] = True
            elif "pause" in s:
                self.state["runState"] = "Paused"
                self.state["isCharging"] = False
            elif "goto_charge" in s or "chargego" in s:
                self.state["runState"] = "Returning"
                self.state["isCharging"] = False
            elif s in ("smart", "cleaning", "zone_clean", "part_clean", "wall_follow", "spiral"):
                self.state["runState"] = "Cleaning"
                self.state["isCharging"] = False
            elif s in ("standby", "sleep"):
                self.state["runState"] = "Idle"
            else:
                self.state["runState"] = status

        mode = get_named("mode", "4")
        if isinstance(mode, str):
            reverse = {v: k for k, v in self.mode_values.items()}
            self.state["mode"] = reverse.get(mode, mode)

        suction = get_named("suction", "9")
        if isinstance(suction, str):
            reverse = {v: k for k, v in self.power_values.items()}
            self.state["power"] = reverse.get(suction, suction)

    def handle_command(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        command = payload.get("command")
        self.state["lastCommand"] = str(command)
        try:
            if command == "SetMode":
                mode = payload.get("mode")
                value = self.mode_values.get(mode, mode)
                self.set_dp("mode", value)
                self.state["mode"] = mode or self.state["mode"]
                self.state["lastMessage"] = f"Mode → {mode} ({value})"
            elif command == "SetPower":
                power = payload.get("power")
                value = self.power_values.get(power, power)
                self.set_dp("suction", value)
                self.state["power"] = power or self.state["power"]
                self.state["lastMessage"] = f"Power → {power} ({value})"
            elif command == "StartClean":
                mode = payload.get("mode") or self.state.get("mode") or "Methodic"
                if mode and mode != "Idle":
                    value = self.mode_values.get(mode, "smart")
                    self.set_dp("mode", value)
                    self.state["mode"] = mode
                try:
                    self.set_dp("switch_go", True)
                except Exception:
                    self.device.set_value("power_go", True)
                self.set_dp("pause", False)
                self.state["runState"] = "Cleaning"
                self.state["isCharging"] = False
                self.state["lastMessage"] = "Start clean sent"
            elif command == "Pause":
                self.set_dp("pause", True)
                self.state["runState"] = "Paused"
                self.state["lastMessage"] = "Pause sent"
            elif command == "Resume":
                self.set_dp("pause", False)
                self.state["runState"] = "Cleaning"
                self.state["lastMessage"] = "Resume sent"
            elif command == "Stop":
                try:
                    self.set_dp("switch_go", False)
                except Exception:
                    self.device.set_value("power_go", False)
                self.state["runState"] = "Idle"
                self.state["lastMessage"] = "Stop sent"
            elif command == "ReturnToDock":
                try:
                    self.set_dp("switch_charge", True)
                except Exception:
                    self.set_dp("mode", "chargego")
                self.state["runState"] = "Returning"
                self.state["lastMessage"] = "Return-to-dock sent"
            elif command == "Localize":
                self.set_dp("seek", True)
                self.state["lastMessage"] = "Find-me (seek) sent"
            elif command == "ClearRoomScan":
                self.state["lastMessage"] = "Room scan is Specs-side only"
            else:
                self.state["lastMessage"] = f"Unknown command: {command}"
            try:
                self.refresh()
            except Exception as refresh_err:
                self.state["lastMessage"] += f" (status refresh failed: {refresh_err})"
        except Exception as e:
            self.state["lastMessage"] = f"Command failed: {e}"
            self.state["runState"] = "Error"
            traceback.print_exc()
        return self.state


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[bridge] {self.address_string()} - {fmt % args}")

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code: int, payload: Any) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            if path == "/health":
                self._json(
                    200,
                    {
                        "ok": True,
                        "probe": PROBE,
                        "lan_ip": guess_lan_ip(),
                        "device_ip": None if PROBE else CFG.get("device_ip"),
                        "device_id": None if PROBE else CFG.get("device_id"),
                        "host": socket.gethostname(),
                        "peak": "device-test",
                    },
                )
            elif path == "/state":
                self._json(200, BRIDGE.refresh())
            elif path == "/discover":
                if PROBE:
                    self._json(200, {"probe": True, "hint": "Live discover needs config.json + vacuum"})
                    return
                raw = BRIDGE.device.status()
                BRIDGE.last_raw = raw if isinstance(raw, dict) else {"raw": raw}
                self._json(
                    200,
                    {
                        "hint": "Inspect dps keys and update config.json dp_map / mode_values",
                        "status": BRIDGE.last_raw,
                        "mapped_state": BRIDGE.state,
                    },
                )
            else:
                self._json(
                    404,
                    {"error": "not found", "paths": ["/health", "/state", "/discover", "/command"]},
                )
        except Exception as e:
            traceback.print_exc()
            self._json(500, {"error": str(e), "trace": traceback.format_exc()})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid JSON"})
            return
        try:
            if path in ("/command", "/"):
                self._json(200, BRIDGE.handle_command(payload))
            else:
                self._json(404, {"error": "not found"})
        except Exception as e:
            traceback.print_exc()
            self._json(500, {"error": str(e)})


def main() -> None:
    global PROBE, CFG, BRIDGE
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--probe",
        action="store_true",
        help="Specs↔Mac connectivity only (no vacuum keys). Peak device-network test.",
    )
    args = parser.parse_args()
    PROBE = bool(args.probe)

    if PROBE:
        BRIDGE = ProbeBridge()
        CFG = {"listen_host": "0.0.0.0", "listen_port": 8787}
    else:
        CFG = load_config()
        BRIDGE = VacuumBridge(CFG)

    host = CFG.get("listen_host", "0.0.0.0")
    port = int(CFG.get("listen_port", 8787))
    httpd = ThreadingHTTPServer((host, port), Handler)
    lan_ip = guess_lan_ip()
    mode = "PROBE (Specs↔Mac)" if PROBE else "LIVE (Tuya vacuum)"
    print("=" * 60)
    print(f"Rowenta bridge — {mode}")
    print(f"  Peak target: ON-DEVICE Specs test")
    print(f"  Listening:   http://{host}:{port}")
    print(f"  Specs URL:   http://{lan_ip}:{port}   ← use THIS on glasses")
    print(f"  Preview URL: http://127.0.0.1:{port}  (Mac Preview only)")
    print(f"  Health:      http://{lan_ip}:{port}/health")
    print("  Lens VacuumDeviceBridge.useSimulation=false")
    print(f"  Lens bridgeEndpointUrl=http://{lan_ip}:{port}")
    print("  Enable Experimental APIs for plain http://")
    if not PROBE:
        print(f"  Device:      {CFG.get('device_id')} @ {CFG.get('device_ip')}")
    print("=" * 60)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
