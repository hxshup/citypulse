#!/usr/bin/env python3
"""
CityPulse Backend API Test Suite
Tests the Next.js catch-all route at /app/app/api/[[...path]]/route.js
Base URL: http://localhost:3000/api
"""

import requests
import json
import time
from typing import Dict, Any, List

BASE_URL = "http://localhost:3000/api"

def log_test(test_name: str, passed: bool, details: str = ""):
    """Log test results"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}: {test_name}")
    if details:
        print(f"  Details: {details}")

def test_scenario_reset():
    """Test 1: POST /api/scenario/reset -> returns {step:0}"""
    print("\n" + "="*80)
    print("TEST 1: Scenario Reset")
    print("="*80)
    
    try:
        response = requests.post(f"{BASE_URL}/scenario/reset", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code != 200:
            log_test("POST /api/scenario/reset status", False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        if "step" not in data:
            log_test("POST /api/scenario/reset response", False, "Missing 'step' field")
            return False
        
        if data["step"] != 0:
            log_test("POST /api/scenario/reset step value", False, f"Expected step=0, got {data['step']}")
            return False
        
        log_test("POST /api/scenario/reset", True, f"Returned step={data['step']}")
        return True
        
    except Exception as e:
        log_test("POST /api/scenario/reset", False, f"Exception: {str(e)}")
        return False

def test_initial_state():
    """Test 1b: GET /api/state after reset -> verify normal state"""
    print("\n" + "="*80)
    print("TEST 1b: Initial State Verification")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/state", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            log_test("GET /api/state status", False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        print(f"Response keys: {list(data.keys())}")
        
        # Check zones length == 4
        zones = data.get("zones", [])
        if len(zones) != 4:
            log_test("Initial state zones count", False, f"Expected 4 zones, got {len(zones)}")
        else:
            log_test("Initial state zones count", True, f"Found {len(zones)} zones")
        
        # Check events length == 20
        events = data.get("events", [])
        if len(events) != 20:
            log_test("Initial state events count", False, f"Expected 20 events, got {len(events)}")
        else:
            log_test("Initial state events count", True, f"Found {len(events)} events")
        
        # Check city pulse near 100
        city_pulse = data.get("city", {}).get("pulse", 0)
        if city_pulse < 95 or city_pulse > 100:
            log_test("Initial city pulse", False, f"Expected ~100, got {city_pulse}")
        else:
            log_test("Initial city pulse", True, f"City pulse = {city_pulse}")
        
        # Check feeds all status 'ok'
        feeds = data.get("feeds", [])
        all_ok = all(f.get("status") == "ok" for f in feeds)
        if not all_ok:
            feed_statuses = {f.get("source"): f.get("status") for f in feeds}
            log_test("Initial feeds status", False, f"Not all feeds 'ok': {feed_statuses}")
        else:
            log_test("Initial feeds status", True, "All feeds status='ok'")
        
        # Check correlations empty
        correlations = data.get("correlations", [])
        if len(correlations) != 0:
            log_test("Initial correlations empty", False, f"Expected 0 correlations, got {len(correlations)}")
        else:
            log_test("Initial correlations empty", True, "Correlations array is empty")
        
        return True
        
    except Exception as e:
        log_test("GET /api/state", False, f"Exception: {str(e)}")
        return False

def test_scenario_advance_5_steps():
    """Test 2: Advance scenario 5 times and verify messages"""
    print("\n" + "="*80)
    print("TEST 2: Scenario Advance (5 steps)")
    print("="*80)
    
    expected_messages = {
        1: "Heavy rainfall",
        2: "Traffic incidents",
        3: "Transit delays",
        4: "Anomalies",
        5: "insight"
    }
    
    all_passed = True
    
    for step in range(1, 6):
        print(f"\n--- Advancing to Step {step} ---")
        try:
            response = requests.post(f"{BASE_URL}/scenario/advance", timeout=10)
            print(f"Status Code: {response.status_code}")
            
            if response.status_code != 200:
                log_test(f"Step {step} advance status", False, f"Expected 200, got {response.status_code}")
                all_passed = False
                continue
            
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            
            if data.get("step") != step:
                log_test(f"Step {step} number", False, f"Expected step={step}, got {data.get('step')}")
                all_passed = False
            else:
                log_test(f"Step {step} number", True, f"Step = {step}")
            
            message = data.get("message", "").lower()
            expected_keyword = expected_messages[step].lower()
            
            if expected_keyword not in message:
                log_test(f"Step {step} message", False, f"Expected '{expected_keyword}' in message, got: {message}")
                all_passed = False
            else:
                log_test(f"Step {step} message", True, f"Message contains '{expected_keyword}'")
            
            # Step 4 should have correlation
            if step == 4:
                if "correlation" not in data:
                    log_test(f"Step {step} correlation field", False, "Missing 'correlation' field")
                    all_passed = False
                else:
                    log_test(f"Step {step} correlation field", True, "Correlation field present")
            
            # Step 5 should have summary and ai flag
            if step == 5:
                if "summary" not in data:
                    log_test(f"Step {step} summary field", False, "Missing 'summary' field")
                    all_passed = False
                else:
                    log_test(f"Step {step} summary field", True, f"Summary present: {data['summary'][:50]}...")
                
                if "ai" not in data:
                    log_test(f"Step {step} ai flag", False, "Missing 'ai' field")
                    all_passed = False
                else:
                    log_test(f"Step {step} ai flag", True, f"AI flag = {data['ai']}")
            
            time.sleep(0.5)  # Small delay between steps
            
        except Exception as e:
            log_test(f"Step {step} advance", False, f"Exception: {str(e)}")
            all_passed = False
    
    return all_passed

def test_final_state():
    """Test 3: GET /api/state after full scenario and verify detailed state"""
    print("\n" + "="*80)
    print("TEST 3: Final State Verification (After 5 Steps)")
    print("="*80)
    
    try:
        response = requests.get(f"{BASE_URL}/state", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            log_test("GET /api/state final status", False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        
        # Find Zone 3
        zones = data.get("zones", [])
        zone3 = None
        for z in zones:
            if z.get("zone", {}).get("label") == "Zone 3":
                zone3 = z
                break
        
        if not zone3:
            log_test("Zone 3 found", False, "Zone 3 not found in zones array")
            return False
        
        log_test("Zone 3 found", True, f"Zone 3: {zone3.get('zone', {}).get('name')}")
        
        # Check Zone 3 has 3 anomalies
        zone3_anomalies = zone3.get("anomalies", [])
        if len(zone3_anomalies) != 3:
            log_test("Zone 3 anomalies count", False, f"Expected 3 anomalies, got {len(zone3_anomalies)}")
        else:
            log_test("Zone 3 anomalies count", True, f"Found {len(zone3_anomalies)} anomalies")
            
            # Check anomaly metrics
            expected_metrics = ["rainfall_mm_h", "traffic_incidents", "transit_delays"]
            found_metrics = [a.get("metric") for a in zone3_anomalies]
            print(f"  Found metrics: {found_metrics}")
            
            for metric in expected_metrics:
                if metric in found_metrics:
                    log_test(f"Zone 3 anomaly metric '{metric}'", True, "Present")
                else:
                    log_test(f"Zone 3 anomaly metric '{metric}'", False, "Missing")
            
            # Check all severity 'high'
            all_high = all(a.get("severity") == "high" for a in zone3_anomalies)
            if all_high:
                log_test("Zone 3 anomalies severity", True, "All severity='high'")
            else:
                severities = [a.get("severity") for a in zone3_anomalies]
                log_test("Zone 3 anomalies severity", False, f"Not all high: {severities}")
        
        # Check Zone 3 pulse significantly lower than 100
        zone3_pulse = zone3.get("pulse", {}).get("score", 100)
        if zone3_pulse >= 70:
            log_test("Zone 3 pulse drop", False, f"Expected pulse < 70, got {zone3_pulse}")
        else:
            log_test("Zone 3 pulse drop", True, f"Zone 3 pulse = {zone3_pulse}")
        
        # Check correlations array has >= 1 item
        correlations = data.get("correlations", [])
        if len(correlations) < 1:
            log_test("Correlations present", False, f"Expected >= 1 correlation, got {len(correlations)}")
        else:
            log_test("Correlations present", True, f"Found {len(correlations)} correlation(s)")
            
            # Check first correlation structure
            corr = correlations[0]
            print(f"  Correlation: {json.dumps(corr, indent=2)}")
            
            # Check confidence is numeric
            confidence = corr.get("confidence")
            if isinstance(confidence, (int, float)):
                log_test("Correlation confidence numeric", True, f"Confidence = {confidence}")
            else:
                log_test("Correlation confidence numeric", False, f"Confidence not numeric: {confidence}")
            
            # Check time_overlap is numeric
            time_overlap = corr.get("time_overlap")
            if isinstance(time_overlap, (int, float)):
                log_test("Correlation time_overlap numeric", True, f"Time overlap = {time_overlap}")
            else:
                log_test("Correlation time_overlap numeric", False, f"Time overlap not numeric: {time_overlap}")
            
            # Check factors object exists
            factors = corr.get("factors")
            if isinstance(factors, dict):
                log_test("Correlation factors object", True, f"Factors keys: {list(factors.keys())}")
            else:
                log_test("Correlation factors object", False, f"Factors not an object: {type(factors)}")
            
            # Check evidence array exists
            evidence = corr.get("evidence")
            if isinstance(evidence, list):
                log_test("Correlation evidence array", True, f"Evidence items: {len(evidence)}")
            else:
                log_test("Correlation evidence array", False, f"Evidence not an array: {type(evidence)}")
        
        # Check insights array has >= 1 item
        insights = data.get("insights", [])
        if len(insights) < 1:
            log_test("Insights present", False, f"Expected >= 1 insight, got {len(insights)}")
        else:
            log_test("Insights present", True, f"Found {len(insights)} insight(s)")
            
            # Check first insight structure
            insight = insights[0]
            print(f"  Insight: {json.dumps(insight, indent=2)}")
            
            summary = insight.get("summary", "")
            if summary:
                log_test("Insight summary non-empty", True, f"Summary: {summary[:50]}...")
            else:
                log_test("Insight summary non-empty", False, "Summary is empty")
            
            ai_flag = insight.get("metadata", {}).get("ai")
            if ai_flag is not None:
                log_test("Insight metadata.ai present", True, f"AI = {ai_flag}")
            else:
                log_test("Insight metadata.ai present", False, "AI flag missing")
        
        # Check alerts array has >= 1 active alert with severity 'high'
        alerts = data.get("alerts", [])
        if len(alerts) < 1:
            log_test("Alerts present", False, f"Expected >= 1 alert, got {len(alerts)}")
        else:
            log_test("Alerts present", True, f"Found {len(alerts)} alert(s)")
            
            active_high_alerts = [a for a in alerts if a.get("status") == "active" and a.get("severity") == "high"]
            if len(active_high_alerts) < 1:
                log_test("Active high severity alert", False, f"No active high severity alerts found")
            else:
                log_test("Active high severity alert", True, f"Found {len(active_high_alerts)} active high alert(s)")
        
        return True
        
    except Exception as e:
        log_test("GET /api/state final", False, f"Exception: {str(e)}")
        return False

def test_list_endpoints():
    """Test 4: GET list endpoints return JSON arrays"""
    print("\n" + "="*80)
    print("TEST 4: List Endpoints Return Arrays")
    print("="*80)
    
    endpoints = {
        "/zones": 4,
        "/events": 20,  # Should be > 0
        "/anomalies": 3,
        "/correlations": 1,
        "/insights": 1,
        "/alerts": 1,
    }
    
    all_passed = True
    
    for endpoint, expected_min in endpoints.items():
        try:
            response = requests.get(f"{BASE_URL}{endpoint}", timeout=10)
            print(f"\nGET {endpoint}")
            print(f"Status Code: {response.status_code}")
            
            if response.status_code != 200:
                log_test(f"GET {endpoint} status", False, f"Expected 200, got {response.status_code}")
                all_passed = False
                continue
            
            data = response.json()
            
            # Check if it's an array
            if not isinstance(data, list):
                log_test(f"GET {endpoint} returns array", False, f"Expected array, got {type(data).__name__}")
                print(f"Response: {json.dumps(data, indent=2)}")
                all_passed = False
                continue
            
            log_test(f"GET {endpoint} returns array", True, f"Array with {len(data)} items")
            
            # Check minimum count
            if endpoint == "/events":
                if len(data) > 0:
                    log_test(f"GET {endpoint} count", True, f"Found {len(data)} items (> 0)")
                else:
                    log_test(f"GET {endpoint} count", False, f"Expected > 0, got {len(data)}")
                    all_passed = False
            else:
                if len(data) >= expected_min:
                    log_test(f"GET {endpoint} count", True, f"Found {len(data)} items (>= {expected_min})")
                else:
                    log_test(f"GET {endpoint} count", False, f"Expected >= {expected_min}, got {len(data)}")
                    all_passed = False
            
        except Exception as e:
            log_test(f"GET {endpoint}", False, f"Exception: {str(e)}")
            all_passed = False
    
    return all_passed

def test_event_by_id():
    """Test 4b: GET /api/events/{id} for valid and invalid IDs"""
    print("\n" + "="*80)
    print("TEST 4b: Event by ID")
    print("="*80)
    
    try:
        # First get list of events
        response = requests.get(f"{BASE_URL}/events", timeout=10)
        if response.status_code != 200:
            log_test("GET /api/events for ID test", False, "Could not fetch events list")
            return False
        
        events = response.json()
        if not events or len(events) == 0:
            log_test("GET /api/events for ID test", False, "No events found")
            return False
        
        # Test valid event ID
        valid_id = events[0].get("id")
        print(f"\nTesting valid event ID: {valid_id}")
        response = requests.get(f"{BASE_URL}/events/{valid_id}", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            log_test("GET /api/events/{valid_id}", False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        if data.get("id") == valid_id:
            log_test("GET /api/events/{valid_id}", True, f"Returned event with id={valid_id}")
        else:
            log_test("GET /api/events/{valid_id}", False, f"Expected id={valid_id}, got {data.get('id')}")
            return False
        
        # Test invalid event ID
        invalid_id = "invalid-event-id-12345"
        print(f"\nTesting invalid event ID: {invalid_id}")
        response = requests.get(f"{BASE_URL}/events/{invalid_id}", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 404:
            log_test("GET /api/events/{invalid_id} returns 404", True, "Correctly returned 404")
        else:
            log_test("GET /api/events/{invalid_id} returns 404", False, f"Expected 404, got {response.status_code}")
            return False
        
        return True
        
    except Exception as e:
        log_test("GET /api/events/{id}", False, f"Exception: {str(e)}")
        return False

def test_alert_resolve():
    """Test 5: Alert resolve functionality"""
    print("\n" + "="*80)
    print("TEST 5: Alert Resolve")
    print("="*80)
    
    try:
        # Get list of alerts
        response = requests.get(f"{BASE_URL}/alerts", timeout=10)
        if response.status_code != 200:
            log_test("GET /api/alerts for resolve test", False, "Could not fetch alerts")
            return False
        
        alerts = response.json()
        if not alerts or len(alerts) == 0:
            log_test("GET /api/alerts for resolve test", False, "No alerts found")
            return False
        
        # Find an active alert
        active_alert = None
        for alert in alerts:
            if alert.get("status") == "active":
                active_alert = alert
                break
        
        if not active_alert:
            log_test("Find active alert", False, "No active alerts found")
            return False
        
        alert_id = active_alert.get("id")
        print(f"\nResolving alert ID: {alert_id}")
        log_test("Find active alert", True, f"Found active alert: {alert_id}")
        
        # Resolve the alert
        response = requests.post(f"{BASE_URL}/alerts/{alert_id}/resolve", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code != 200:
            log_test("POST /api/alerts/{id}/resolve status", False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        if data.get("ok") != True:
            log_test("POST /api/alerts/{id}/resolve response", False, f"Expected {{ok: true}}, got {data}")
            return False
        
        log_test("POST /api/alerts/{id}/resolve", True, "Alert resolved successfully")
        
        # Verify alert status changed to 'resolved'
        time.sleep(0.5)
        response = requests.get(f"{BASE_URL}/alerts", timeout=10)
        if response.status_code != 200:
            log_test("GET /api/alerts after resolve", False, "Could not fetch alerts")
            return False
        
        alerts = response.json()
        resolved_alert = None
        for alert in alerts:
            if alert.get("id") == alert_id:
                resolved_alert = alert
                break
        
        if not resolved_alert:
            log_test("Verify alert resolved", False, f"Alert {alert_id} not found after resolve")
            return False
        
        if resolved_alert.get("status") == "resolved":
            log_test("Verify alert status='resolved'", True, f"Alert status is 'resolved'")
        else:
            log_test("Verify alert status='resolved'", False, f"Expected 'resolved', got '{resolved_alert.get('status')}'")
            return False
        
        return True
        
    except Exception as e:
        log_test("Alert resolve", False, f"Exception: {str(e)}")
        return False

def test_idempotency():
    """Test 6: Idempotency and robustness"""
    print("\n" + "="*80)
    print("TEST 6: Idempotency and Robustness")
    print("="*80)
    
    try:
        # Call advance again after step 5 (should not crash)
        print("\nCalling /api/scenario/advance after step 5 (should not crash)")
        response = requests.post(f"{BASE_URL}/scenario/advance", timeout=10)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code != 200:
            log_test("Advance after step 5 (no crash)", False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        if data.get("step") == 5:
            log_test("Advance after step 5 (no crash)", True, "Returned step 5, no crash")
        else:
            log_test("Advance after step 5 (no crash)", False, f"Unexpected step: {data.get('step')}")
        
        # Call reset again (should return to normal state)
        print("\nCalling /api/scenario/reset again")
        response = requests.post(f"{BASE_URL}/scenario/reset", timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code != 200:
            log_test("Reset again (no crash)", False, f"Expected 200, got {response.status_code}")
            return False
        
        data = response.json()
        if data.get("step") == 0:
            log_test("Reset again (no crash)", True, "Returned step 0")
        else:
            log_test("Reset again (no crash)", False, f"Expected step 0, got {data.get('step')}")
        
        # Verify correlations cleared
        time.sleep(0.5)
        response = requests.get(f"{BASE_URL}/state", timeout=10)
        if response.status_code != 200:
            log_test("GET /api/state after reset", False, "Could not fetch state")
            return False
        
        data = response.json()
        correlations = data.get("correlations", [])
        if len(correlations) == 0:
            log_test("Correlations cleared after reset", True, "Correlations array is empty")
        else:
            log_test("Correlations cleared after reset", False, f"Expected 0 correlations, got {len(correlations)}")
        
        return True
        
    except Exception as e:
        log_test("Idempotency test", False, f"Exception: {str(e)}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("CITYPULSE BACKEND API TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    results = {}
    
    # Test 1: Reset and initial state
    results["reset"] = test_scenario_reset()
    results["initial_state"] = test_initial_state()
    
    # Test 2: Advance 5 steps
    results["advance_5_steps"] = test_scenario_advance_5_steps()
    
    # Test 3: Final state verification
    results["final_state"] = test_final_state()
    
    # Test 4: List endpoints
    results["list_endpoints"] = test_list_endpoints()
    results["event_by_id"] = test_event_by_id()
    
    # Test 5: Alert resolve
    results["alert_resolve"] = test_alert_resolve()
    
    # Test 6: Idempotency
    results["idempotency"] = test_idempotency()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} TEST(S) FAILED")
        return 1

if __name__ == "__main__":
    exit(main())
