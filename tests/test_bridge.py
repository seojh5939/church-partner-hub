from unittest.mock import MagicMock, patch
import pytest
from src.bridge import ChurchBridge


def test_initial_state_is_zero_seed(empty_bridge):
    """프로덕션 런타임 초기 상태는 100% 비어있어야 함 (Zero-Seed Data Governance)."""
    res = empty_bridge.get_initial_state()
    assert res["success"] is True
    data = res["data"]
    assert data["mode"] == "MASTER"
    assert len(data["master_records"]) == 0
    assert len(data["simple_records"]) == 0
    assert data["stats"]["total_count"] == 0
    assert data["stats"]["verified_address_count"] == 0


def test_switch_mode(empty_bridge):
    res = empty_bridge.switch_mode("SIMPLE")
    assert res["success"] is True
    assert res["data"]["mode"] == "SIMPLE"
    assert empty_bridge.current_mode == "SIMPLE"

    res_invalid = empty_bridge.switch_mode("UNKNOWN")
    assert res_invalid["success"] is False


def test_search_and_confirm_address(populated_bridge):
    # Row 2 (광주동성교회) has empty address
    search_res = populated_bridge.search_address(2, mode="MASTER")
    assert search_res["success"] is True
    candidates = search_res["data"]["candidates"]
    assert len(candidates) > 0
    best = candidates[0]
    assert best["confidence_level"] == "HIGH"

    confirm_res = populated_bridge.confirm_address(2, best["road_address"], best["zip_code"], mode="MASTER")
    assert confirm_res["success"] is True
    assert confirm_res["data"]["updated_record"]["address"] == best["road_address"]
    assert confirm_res["data"]["updated_record"]["verification_status"] == "승인완료"


@patch("requests.get")
def test_cascading_uncertainty_homepage_search(mock_get, populated_bridge):
    # 1. Before address is confirmed (Row 4 하남샘물교회 has missing address)
    hp_res_before = populated_bridge.search_homepage(4, mode="MASTER")
    assert hp_res_before["success"] is True
    candidate_before = hp_res_before["data"]["candidate"]
    # Should be LOW and dependent uncertain
    assert candidate_before["confidence_level"] == "LOW"
    assert candidate_before["is_dependent_uncertain"] is True
    assert "주소 불확실" in candidate_before["evidence"]

    # 2. Confirm address first
    populated_bridge.confirm_address(4, "경기도 하남시 신평로 45", "12998", mode="MASTER")

    # 3. Setup mock response for homepage crawl
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {"Content-Type": "text/html; charset=utf-8"}
    mock_resp.iter_content = MagicMock(
        return_value=[
            b"<html><body><footer><address>\xea\xb2\xbd\xea\xb8\xb0\xeb\x8f\x84 \xed\x95\x98\xeb\x82\xa8\xec\x8b\x9c \xec\x8b\xa0\xed\x8f\x89\xeb\xa1\x9c 45</address></footer></body></html>"
        ]
    )
    mock_resp.raise_for_status = MagicMock()
    mock_resp.text = "<html><body><footer><address>경기도 하남시 신평로 45</address></footer></body></html>"
    mock_get.return_value = mock_resp
    mock_get.return_value.__enter__.return_value = mock_resp

    # 4. Search homepage again after address is confirmed
    hp_res_after = populated_bridge.search_homepage(4, mode="MASTER")
    assert hp_res_after["success"] is True
    candidate_after = hp_res_after["data"]["candidate"]
    assert candidate_after["confidence_level"] == "HIGH"
    assert candidate_after["is_dependent_uncertain"] is False


def test_quick_search_chosung(populated_bridge):
    # 초성 검색 테스트: 'ㄱㅈㅅ' -> 광주겨자씨교회
    res = populated_bridge.quick_search("ㄱㅈㅅ")
    assert res["success"] is True
    assert len(res["data"]["results"]) == 1
    assert res["data"]["results"][0]["church_name"] == "광주겨자씨교회"

    # 일반 키워드 검색
    res_kw = populated_bridge.quick_search("겨자씨")
    assert res_kw["success"] is True
    assert len(res_kw["data"]["results"]) == 1


def test_copy_dispatch_text(populated_bridge):
    # Row 1 (광주겨자씨교회)
    res_off = populated_bridge.copy_dispatch_text(1, format_type="official")
    assert res_off["success"] is True
    assert "수신: 광주겨자씨교회" in res_off["data"]["text"]

    res_par = populated_bridge.copy_dispatch_text(1, format_type="parcel")
    assert res_par["success"] is True
    assert "받는분: 나학수 목사" in res_par["data"]["text"]

    res_tsv = populated_bridge.copy_dispatch_text(1, format_type="tsv")
    assert res_tsv["success"] is True
    assert "광주겨자씨교회\t나학수\t광주" in res_tsv["data"]["text"]


def test_export_dispatch_list_via_bridge(populated_bridge, tmp_path):
    out_file = str(tmp_path / "dispatch_bridge.xlsx")
    res = populated_bridge.export_dispatch_list(output_path=out_file, row_ids=[1])
    assert res["success"] is True
    assert res["data"]["count"] == 1


def test_excel_load_and_save_via_bridge(populated_bridge, tmp_path):
    # 1. 마스터 모드 저장
    save_path = str(tmp_path / "bridge_master.xlsx")
    save_res = populated_bridge.save_excel(output_path=save_path)
    assert save_res["success"] is True

    # 2. 저장된 마스터 파일 다시 로드
    load_res = populated_bridge.load_excel(file_path=save_path)
    assert load_res["success"] is True
    assert load_res["data"]["mode"] == "MASTER"
    assert len(load_res["data"]["master_records"]) >= 4

    # 3. 간편 모드 전환 후 내보내기
    populated_bridge.switch_mode("SIMPLE")
    simple_out = str(tmp_path / "bridge_simple.xlsx")
    exp_res = populated_bridge.export_simple_address_book(output_path=simple_out)
    assert exp_res["success"] is True
    assert exp_res["data"]["count"] >= 2


def test_analytics(populated_bridge):
    # 1. 전체 분석
    res = populated_bridge.get_analytics()
    assert res["success"] is True
    data = res["data"]
    assert data["summary"]["total_churches"] >= 4
    assert len(data["denomination_distribution"]) > 0
    assert len(data["scale_distribution"]) == 6
    assert "crosstab" in data
    assert data["crosstab"]["grand_total"] == data["summary"]["total_churches"]

    # 2. 드릴다운 필터 (교단 및 규모)
    drilldown = populated_bridge.get_analytics(denomination_filter="예장합동", scale_filter="초대형 (3000~)")
    assert drilldown["success"] is True
    d_data = drilldown["data"]
    assert d_data["applied_filters"]["denomination"] == "예장합동"
    assert d_data["applied_filters"]["scale"] == "초대형 (3000~)"
    for c in d_data["churches"]:
        assert c["denomination"] == "예장합동"
        assert c["congregation_size"] >= 3000
