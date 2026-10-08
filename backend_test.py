#!/usr/bin/env python3
"""Black-box smoke tests for CityPulse's Next.js API.

The suite resets the demo scenario and resolves one alert, so it requires the
explicit ``--allow-mutations`` flag. Use a disposable CITYPULSE_DB_PATH when
running it against a local server.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_BASE_URL = "http://localhost:3000/api"
TIMEOUT_SECONDS = 10
checks: list[tuple[str, bool, str]] = []
base_url = DEFAULT_BASE_URL


def check(name: str, passed: bool, details: str = "") -> bool:
    checks.append((name, passed, details))
    status = "PASS" if passed else "FAIL"
    suffix = f" - {details}" if details else ""
    print(f"[{status}] {name}{suffix}")
    return passed


def request_json(
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
) -> tuple[int, Any]:
    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
    request = Request(url, headers=headers or {}, method=method)
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            status = response.status
            body = response.read()
    except HTTPError as error:
        status = error.code
        body = error.read()
    except URLError as error:
        raise RuntimeError(f"Cannot reach {url}: {error.reason}") from error

    if not body:
        return status, None
    try:
        return status, json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return status, body.decode("utf-8", errors="replace")


def check_response(method: str, path: str, expected_status: int = 200) -> tuple[bool, Any]:
    try:
        status, payload = request_json(method, path)
    except (OSError, RuntimeError) as error:
        return check(f"{method} {path}", False, str(error)), None
    passed = status == expected_status
    detail = f"expected HTTP {expected_status}, got {status}"
    if not passed and isinstance(payload, dict) and payload.get("error"):
        detail += f" ({payload['error']})"
    check(f"{method} {path}", passed, "" if passed else detail)
    return passed, payload


def test_health() -> bool:
    passed, payload = check_response("GET", "")
    if not passed:
        return False
    valid = (
        isinstance(payload, dict)
        and payload.get("app") == "CityPulse"
        and payload.get("status") == "ok"
        and payload.get("database") == "sqlite"
    )
    return check("health response identifies the SQLite backend", valid, str(payload))


def test_jaipur_validation() -> bool:
    outcomes = []
    for path, label in (
        ("jaipur/search?q=ab", "reject too-short place searches"),
        (
            "jaipur/area?lat=0&lon=0&name=Outside&language=en",
            "reject coordinates outside Jaipur",
        ),
        ("jaipur/area?lat=26.9&lon=75.8&language=en", "require an area name"),
        ("jaipur/places?group=unsupported", "reject unsupported place categories"),
    ):
        passed, payload = check_response("GET", path, 400)
        if passed:
            passed = isinstance(payload, dict) and bool(payload.get("error"))
            check(label, passed, "API returns a validation error" if passed else str(payload))
        outcomes.append(passed)

    try:
        status, payload = request_json(
            "POST",
            "scenario/reset",
            headers={"Origin": "https://untrusted.example"},
        )
        passed = status == 403
        check(
            "reject cross-origin mutations",
            passed,
            "" if passed else f"expected HTTP 403, got {status}: {payload}",
        )
    except (OSError, RuntimeError) as error:
        outcomes.append(check("reject cross-origin mutations", False, str(error)))
    else:
        outcomes.append(passed)
    return all(outcomes)


def test_reset_and_initial_state() -> tuple[bool, dict[str, Any] | None]:
    passed, payload = check_response("POST", "scenario/reset")
    if not passed:
        return False, None
    passed = isinstance(payload, dict) and payload.get("step") == 0
    check("reset returns step zero", passed, str(payload))
    if not passed:
        return False, None

    passed, state = check_response("GET", "state")
    if not passed or not isinstance(state, dict):
        check("state response is an object", False, f"got {type(state).__name__}")
        return False, None
    check("state response is an object", True)

    zones = state.get("zones")
    events = state.get("events")
    passed = isinstance(zones, list) and len(zones) > 0
    check("snapshot contains configured zones", passed, f"count={len(zones) if isinstance(zones, list) else 'invalid'}")
    if not passed:
        return False, state

    passed = isinstance(events, list) and len(events) > 0
    check("reset seeds demo scenario events", passed, f"count={len(events) if isinstance(events, list) else 'invalid'}")

    correlations = state.get("correlations")
    passed = isinstance(correlations, list) and not correlations
    check("reset clears previous correlations", passed, str(correlations))

    city = state.get("city")
    pulse = city.get("pulse") if isinstance(city, dict) else None
    passed = isinstance(pulse, (int, float)) and 0 <= pulse <= 100
    check("city pulse is in the 0-100 range", passed, str(pulse))

    feeds = state.get("feeds")
    passed = (
        isinstance(feeds, list)
        and {feed.get("source") for feed in feeds if isinstance(feed, dict)}
        == {"weather", "traffic", "transit"}
    )
    check("snapshot reports all civic feed states", passed, str(feeds))
    return passed, state


def test_scenario_progression() -> bool:
    expected_messages = {
        1: "rainfall",
        2: "traffic incidents",
        3: "transit delays",
        4: "anomalies",
        5: "insight",
    }
    outcomes = []
    for step, keyword in expected_messages.items():
        passed, payload = check_response("POST", "scenario/advance")
        if not passed or not isinstance(payload, dict):
            outcomes.append(False)
            continue
        outcomes.append(check(f"scenario advances to step {step}", payload.get("step") == step, str(payload)))
        message = payload.get("message", "")
        outcomes.append(
            check(
                f"step {step} reports the expected event",
                isinstance(message, str) and keyword in message.lower(),
                str(message),
            )
        )
        if step == 4:
            outcomes.append(check("step 4 includes correlation field", "correlation" in payload))
        if step == 5:
            outcomes.append(check("step 5 includes summary", bool(payload.get("summary"))))
            outcomes.append(check("step 5 includes AI provenance flag", isinstance(payload.get("ai"), bool)))
    return all(outcomes)


def test_final_snapshot() -> bool:
    passed, state = check_response("GET", "state")
    if not passed or not isinstance(state, dict):
        return False

    zone_views = state.get("zones")
    zone_three = next(
        (
            item
            for item in zone_views or []
            if isinstance(item, dict)
            and isinstance(item.get("zone"), dict)
            and item["zone"].get("label") == "Zone 3"
        ),
        None,
    )
    if zone_three is None:
        check("final snapshot contains Zone 3", False)
        return False
    check("final snapshot contains Zone 3", True)

    anomalies = zone_three.get("anomalies", [])
    metrics = {item.get("metric") for item in anomalies if isinstance(item, dict)}
    expected_metrics = {"rainfall_mm_h", "traffic_incidents", "transit_delays"}
    outcomes = [
        check("scenario produces the three expected anomalies", expected_metrics <= metrics, str(metrics)),
        check(
            "scenario persists a correlation",
            isinstance(state.get("correlations"), list) and len(state["correlations"]) > 0,
        ),
        check(
            "scenario persists an insight",
            isinstance(state.get("insights"), list) and len(state["insights"]) > 0,
        ),
        check(
            "scenario persists an active high-severity alert",
            any(
                isinstance(alert, dict)
                and alert.get("status") == "active"
                and alert.get("severity") == "high"
                for alert in state.get("alerts", [])
            ),
        ),
    ]
    return all(outcomes)


def test_record_endpoints() -> bool:
    outcomes = []
    for path in (
        "zones",
        "events",
        "anomalies",
        "correlations",
        "insights",
        "alerts",
    ):
        passed, payload = check_response("GET", path)
        if passed:
            passed = isinstance(payload, list)
            check(f"{path} endpoint returns an array", passed, f"got {type(payload).__name__}")
        outcomes.append(passed)

    passed, events = check_response("GET", "events")
    if not passed or not isinstance(events, list) or not events:
        outcomes.append(check("event list contains an event for detail lookup", False))
        return False
    event_id = events[0].get("id") if isinstance(events[0], dict) else None
    if not event_id:
        outcomes.append(check("event records include an id", False, str(events[0])))
        return False

    passed, event = check_response("GET", f"events/{event_id}")
    outcomes.append(
        check(
            "event detail matches requested id",
            passed and isinstance(event, dict) and event.get("id") == event_id,
            str(event),
        )
    )
    passed, _ = check_response("GET", "events/not-a-real-event-id", 404)
    outcomes.append(passed)
    return all(outcomes)


def test_alert_resolution() -> bool:
    passed, alerts = check_response("GET", "alerts")
    if not passed or not isinstance(alerts, list):
        return False
    active = next(
        (
            item
            for item in alerts
            if isinstance(item, dict) and item.get("status") == "active"
        ),
        None,
    )
    if active is None:
        check("alert resolution fixture exists", False)
        return False
    check("alert resolution fixture exists", True)

    alert_id = active.get("id")
    passed, payload = check_response("POST", f"alerts/{alert_id}/resolve")
    if not passed:
        return False
    outcomes = [check("resolve endpoint returns ok", isinstance(payload, dict) and payload.get("ok") is True)]

    passed, alerts = check_response("GET", "alerts")
    if not passed or not isinstance(alerts, list):
        return False
    resolved = next((item for item in alerts if isinstance(item, dict) and item.get("id") == alert_id), None)
    outcomes.append(check("resolved alert is reflected in list endpoint", isinstance(resolved, dict) and resolved.get("status") == "resolved"))
    return all(outcomes)


def test_idempotency_and_reset() -> bool:
    passed, payload = check_response("POST", "scenario/advance")
    if not passed:
        return False
    outcomes = [check("advance after completion remains at step five", isinstance(payload, dict) and payload.get("step") == 5)]

    passed, payload = check_response("POST", "scenario/reset")
    if not passed:
        return False
    outcomes.append(check("second reset returns step zero", isinstance(payload, dict) and payload.get("step") == 0))

    passed, state = check_response("GET", "state")
    if not passed or not isinstance(state, dict):
        return False
    outcomes.append(check("second reset clears correlations", state.get("correlations") == []))
    outcomes.append(check("second reset clears alerts", state.get("alerts") == []))
    return all(outcomes)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url",
        default=os.environ.get("CITYPULSE_BASE_URL", DEFAULT_BASE_URL),
        help="API base URL (default: CITYPULSE_BASE_URL or %(default)s)",
    )
    parser.add_argument(
        "--allow-mutations",
        action="store_true",
        help="confirm that the suite may reset scenario data and resolve an alert",
    )
    args = parser.parse_args()

    global base_url
    base_url = args.base_url.rstrip("/")
    print(f"CityPulse API smoke tests: {base_url}")
    if not args.allow_mutations:
        print(
            "Refusing to run: this suite mutates scenario data. "
            "Use a disposable CITYPULSE_DB_PATH and pass --allow-mutations.",
            file=sys.stderr,
        )
        return 2

    if not test_health():
        print("API health check failed; no further tests were run.", file=sys.stderr)
        return 1

    test_jaipur_validation()
    if test_reset_and_initial_state()[0]:
        if test_scenario_progression():
            test_final_snapshot()
            test_record_endpoints()
            test_alert_resolution()
            test_idempotency_and_reset()

    print("\nTest summary")
    passed = sum(result for _, result, _ in checks)
    print(f"{passed}/{len(checks)} checks passed")
    for name, result, details in checks:
        if not result:
            suffix = f": {details}" if details else ""
            print(f"  FAIL: {name}{suffix}")
    return 0 if passed == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
