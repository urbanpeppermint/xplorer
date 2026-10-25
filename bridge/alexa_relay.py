#!/usr/bin/env python3
"""
Rowenta X-Plorer Serie 50 — Alexa routine relay for Spectacles.

Why this exists:
  The robot is cloud-only (local Tuya ports closed). It officially obeys
  Amazon Alexa. Spectacles cannot call Alexa directly, but they CAN call
  this relay over HTTP(S). The relay fires an Alexa *routine* via a webhook
  (VoiceMonkey), and Alexa runs the Rowenta action on the real robot.

  Specs Lens  --HTTP /command-->  this relay  --HTTPS webhook-->  Alexa routine
                                                    -->  Rowenta cloud  -->  robot

This keeps the webhook tokens on the Mac (server-side), not inside the Lens.
Same /command + /state shape as server.py, so the Lens HttpVacuumDevice works
unchanged — just point bridgeEndpointUrl at this relay's port.

Run:
  python alexa_relay.py            # needs alexa_config.json
  python alexa_relay.py --dry-run  # logs which webhook WOULD fire, sends nothing
"""

from __future__ import annotations

import argparse
import json
import socket
import threading
import time
import traceback
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "alexa_config.json"

DRY_RUN = False
CFG: Dict[str, Any] = {}
RELAY: Any = None


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
            f"Missing {CONFIG_PATH}.\n"
            f"  cp alexa_config.example.json alexa_config.json\n"
            f"then paste your VoiceMonkey trigger URLs. See ALEXA_SETUP.md."
        )
    with CONFIG_PATH.open() as f:
        return json.load(f)


class AlexaRelay:
    """Maps a VacuumCommand to an Alexa-routine webhook and fires it."""

    def __init__(self, cfg: Dict[str, Any]):
        self.cfg = cfg
        self.webhooks: Dict[str, str] = cfg.get("webhooks", {})
        self.method: str = cfg.get("method", "GET").upper()
        self.timeout: float = float(cfg.get("timeout_seconds", 6))
        # Rowenta power is a toggle: a second Start or a Stop while the first
        # webhook is still in flight turns the robot back off. Claim the slot
        # before the network call, and keep it long enough for Alexa to finish.
        self.hold_seconds: float = 4.0
        self.last_fire_command: str = ""
        self.last_fire_at: float = 0.0
        self.fire_lock = threading.Lock()
        self.log_path = CONFIG_PATH.parent / "relay.log"
        self.state: Dict[str, Any] = {
            "modelId": cfg.get("modelId", "RR7387WH"),
            "runState": "Idle",
            "mode": "Idle",
            "power": "Normal",
            "batteryPercent": 0,
            "isCharging": False,
            "cleanedSurfaceM2": 0,
            "lastCommand": "none",
            "lastMessage": "Alexa relay ready" + (" (DRY RUN)" if DRY_RUN else ""),
            "simulation": False,
        }

    def reload_webhooks(self) -> None:
        """Re-read alexa_config.json so a URL pasted while the relay is running takes effect."""
        try:
            cfg = load_config()
        except Exception:
            traceback.print_exc()
            return
        self.webhooks = cfg.get("webhooks", {})

    def filled_commands(self) -> list:
        return sorted(
            key for key, url in self.webhooks.items()
            if isinstance(url, str) and url.strip()
        )

    def refresh(self) -> Dict[str, Any]:
        # Alexa/Rowenta expose no cheap status read here; state is optimistic.
        return self.state

    def _resolve_webhook(self, payload: Dict[str, Any]) -> Optional[str]:
        """Pick the most specific webhook key available."""
        command = str(payload.get("command", ""))
        mode = payload.get("mode")
        power = payload.get("power")
        candidates = []
        if command == "SetMode" and mode:
            candidates.append(f"SetMode:{mode}")
        if command == "SetPower" and power:
            candidates.append(f"SetPower:{power}")
        candidates.append(command)
        for key in candidates:
            if self.webhooks.get(key):
                return self.webhooks[key]
        return None

    def _fire(self, url: str) -> str:
        if DRY_RUN:
            print(f"[alexa-relay][DRY RUN] would fire: {url}")
            return "DRY RUN — webhook not sent"
        if self.method == "POST":
            req = urllib.request.Request(url, data=b"{}", method="POST",
                                         headers={"Content-Type": "application/json"})
        else:
            req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            body = resp.read(512).decode("utf-8", "replace")
            return f"Alexa routine triggered (HTTP {resp.status}) {body[:120]}"

    def _held_after_start(self, command: str) -> bool:
        if self.last_fire_command != "StartClean":
            return False
        if command not in ("StartClean", "Stop", "Pause", "ReturnToDock"):
            return False
        return (time.monotonic() - self.last_fire_at) < self.hold_seconds

    def _note(self, line: str) -> None:
        print(line, flush=True)
        try:
            with self.log_path.open("a") as log:
                log.write(time.strftime("%H:%M:%S ") + line + "\n")
        except Exception:
            traceback.print_exc()

    def handle_command(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        command = str(payload.get("command", ""))
        with self.fire_lock:
            self.state["lastCommand"] = command
            self.reload_webhooks()
            if self._held_after_start(command):
                age = time.monotonic() - self.last_fire_at
                self._note(f"[alexa-relay] ignored {command} {age:.2f}s after StartClean")
                self.state["lastMessage"] = (
                    f"Ignored {command} — StartClean is still arming ({age:.1f}s)"
                )
                self.state["runState"] = "Cleaning"
                return dict(self.state)
            url = self._resolve_webhook(payload)
            if not url:
                self.state["lastMessage"] = (
                    f"No Alexa routine mapped for '{command}'. "
                    f"Add it to alexa_config.json webhooks."
                )
                return dict(self.state)
            # Claim before the webhook so a second request cannot pass the check
            # while VoiceMonkey is still answering the first one.
            self.last_fire_command = command
            self.last_fire_at = time.monotonic()
            self._note(f"[alexa-relay] fire {command}")
            try:
                msg = self._fire(url)
            except Exception as e:
                self.state["runState"] = "Error"
                self.state["lastMessage"] = f"Webhook failed: {e}"
                traceback.print_exc()
                return dict(self.state)
            self.state["lastMessage"] = msg
            # Optimistic runState so the HUD reacts immediately.
            if command == "StartClean":
                self.state["runState"] = "Cleaning"
                self.state["isCharging"] = False
                if payload.get("mode"):
                    self.state["mode"] = payload["mode"]
            elif command == "Pause":
                self.state["runState"] = "Paused"
            elif command == "Resume":
                self.state["runState"] = "Cleaning"
            elif command == "Stop":
                self.state["runState"] = "Idle"
            elif command == "ReturnToDock":
                self.state["runState"] = "Returning"
            elif command == "SetPower" and payload.get("power"):
                self.state["power"] = payload["power"]
            elif command == "SetMode" and payload.get("mode"):
                self.state["mode"] = payload["mode"]
            return dict(self.state)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[alexa-relay] {self.address_string()} - {fmt % args}")

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
                RELAY.reload_webhooks()
                self._json(200, {
                    "ok": True,
                    "mode": "alexa-relay",
                    "dryRun": DRY_RUN,
                    "lan_ip": guess_lan_ip(),
                    "mappedCommands": sorted(RELAY.webhooks.keys()),
                    "filledCommands": RELAY.filled_commands(),
                })
            elif path == "/state":
                self._json(200, RELAY.refresh())
            else:
                self._json(404, {"error": "not found",
                                 "paths": ["/health", "/state", "/command"]})
        except Exception as e:
            traceback.print_exc()
            self._json(500, {"error": str(e)})

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
                self._json(200, RELAY.handle_command(payload))
            else:
                self._json(404, {"error": "not found"})
        except Exception as e:
            traceback.print_exc()
            self._json(500, {"error": str(e)})


def main() -> None:
    global DRY_RUN, CFG, RELAY
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Log which webhook would fire; send nothing.")
    args = parser.parse_args()
    DRY_RUN = bool(args.dry_run)

    CFG = load_config()
    RELAY = AlexaRelay(CFG)

    host = CFG.get("listen_host", "0.0.0.0")
    port = int(CFG.get("listen_port", 8788))
    httpd = ThreadingHTTPServer((host, port), Handler)
    lan_ip = guess_lan_ip()
    print("=" * 60)
    print(f"Rowenta Alexa relay{' (DRY RUN)' if DRY_RUN else ''}")
    print(f"  Listening:   http://{host}:{port}")
    print(f"  Specs URL:   http://{lan_ip}:{port}   ← use THIS on glasses")
    print(f"  Preview URL: http://127.0.0.1:{port}")
    print(f"  Health:      http://{lan_ip}:{port}/health")
    print(f"  Mapped:      {sorted(RELAY.webhooks.keys())}")
    print("  Lens VacuumDeviceBridge.useSimulation = false")
    print(f"  Lens bridgeEndpointUrl = http://{lan_ip}:{port}")
    print("=" * 60)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
