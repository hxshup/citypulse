#!/usr/bin/env python3
"""Read-only smoke checks for the live CityPulse API."""

from __future__ import annotations

import json
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

BASE_URL = "http://localhost:3000/api"


def get_json(path: str) -> tuple[int, Any]:
    url = f"{BASE_URL}/{path.lstrip('/')}"
    try:
        with urlopen(url, timeout=20) as response:
            return response.status, json.loads(response.read())
    except HTTPError as error:
        body = error.read()
        try:
            return error.code, json.loads(body)
        except json.JSONDecodeError:
            return error.code, body.decode("utf-8", errors="replace")
    except URLError as error:
        raise RuntimeError(f"Cannot reach {url}: {error.reason}") from error


def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, passed: bool, detail: str = "") -> None:
        checks.append((name, passed, detail))
        print(f"[{'PASS' if passed else 'FAIL'}] {name}" + (f" - {detail}" if detail else ""))

    try:
        status, health = get_json("")
        check(
            "API health endpoint",
            status == 200 and isinstance(health, dict) and health.get("status") == "ok",
            str(health),
        )

        status, state = get_json("state")
        is_snapshot = status == 200 and isinstance(state, dict)
        check("live snapshot is available", is_snapshot, f"HTTP {status}")
        if is_snapshot:
            check("snapshot includes Jaipur zones", len(state.get("zones", [])) > 0)
            events = state.get("events")
            check(
                "synthetic demo events are absent",
                isinstance(events, list)
                and not any(
                    isinstance(event, dict)
                    and event.get("metadata", {}).get("demo") is True
                    for event in events
                ),
            )

        status, places = get_json("jaipur/places?group=all")
        records = places.get("places") if isinstance(places, dict) else None
        check(
            "live Jaipur place catalogue is available",
            status == 200 and isinstance(records, list) and len(records) > 0,
            f"HTTP {status}; places={len(records) if isinstance(records, list) else 0}",
        )

        status, validation = get_json("jaipur/search?q=ab")
        check(
            "invalid place searches are rejected",
            status == 400 and isinstance(validation, dict) and bool(validation.get("error")),
            f"HTTP {status}",
        )
    except (OSError, RuntimeError, TimeoutError) as error:
        check("API smoke checks", False, str(error))

    failures = [name for name, passed, _ in checks if not passed]
    print(f"\n{len(checks) - len(failures)}/{len(checks)} checks passed.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
