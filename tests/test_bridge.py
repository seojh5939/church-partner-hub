"""Unit tests for ChurchBridge IPC API Gateway."""

import pytest
from src.bridge import ChurchBridge


@pytest.fixture
def bridge():
    return ChurchBridge()


def test_initial_state(bridge):
    res = bridge.get_initial_state()
    assert res["success"] is True
    data = res["data"]
    assert data["mode"] == "MASTER"
    assert len(data["master_records"]) > 0
    assert len(data["simple_records"]) > 0
    assert "total_count" in data["stats"]


def test_switch_mode(bridge):
    res = bridge.switch_mode("SIMPLE")
    assert res["success"] is True
    assert res["data"]["mode"] == "SIMPLE"
    assert bridge.current_mode == "SIMPLE"

    res_invalid = bridge.switch_mode("UNKNOWN")
    assert res_invalid["success"] is False


def test_search_and_confirm_address(bridge):
    # Row 2 (광주동성교회) has empty address
    search_res = bridge.search_address(2, mode="MASTER")
    assert search_res["success"] is True
    candidates = search_res["data"]["candidates"]
    assert len(candidates) > 0
    best = candidates[0]
    assert best["confidence_level"] == "HIGH"

    confirm_res = bridge.confirm_address(2, best["road_address"], best["zip_code"], mode="MASTER")
    assert confirm_res["success"] is True
    assert confirm_res["data"]["updated_record"]["address"] == best["road_address"]
    assert confirm_res["data"]["updated_record"]["verification_status"] == "승인완료"


def test_cascading_uncertainty_homepage_search(bridge):
    # 1. Before address is confirmed (Row 4 하남샘물교회 has missing address)
    hp_res_before = bridge.search_homepage(4, mode="MASTER")
    assert hp_res_before["success"] is True
    candidate_before = hp_res_before["data"]["candidate"]
    # Should be LOW and dependent uncertain
    assert candidate_before["confidence_level"] == "LOW"
    assert candidate_before["is_dependent_uncertain"] is True
    assert "주소 불확실" in candidate_before["evidence"]

    # 2. Confirm address first
    bridge.confirm_address(4, "경기도 하남시 신평로 45", "12998", mode="MASTER")

    # 3. Search homepage again after address is confirmed
    hp_res_after = bridge.search_homepage(4, mode="MASTER")
    assert hp_res_after["success"] is True
    candidate_after = hp_res_after["data"]["candidate"]
    assert candidate_after["confidence_level"] == "HIGH"
    assert candidate_after["is_dependent_uncertain"] is False


def test_quick_search(bridge):
    res = bridge.quick_search("겨자씨")
    assert res["success"] is True
    assert len(res["data"]["results"]) == 1
    assert res["data"]["results"][0]["church_name"] == "광주겨자씨교회"


def test_analytics(bridge):
    res = bridge.get_analytics()
    assert res["success"] is True
    data = res["data"]
    assert data["summary"]["total_churches"] >= 4
    assert len(data["denomination_distribution"]) > 0
    assert len(data["scale_distribution"]) > 0
