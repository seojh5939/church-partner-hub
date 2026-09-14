"""Comprehensive Unit Tests for AddressGrounder and HomepageGrounder.

100% offline & CI test coverage using unittest.mock.
Verifies Cascading Uncertainty, confidence scoring, and map API fallbacks.
"""

from unittest.mock import MagicMock, patch
import pytest

from src.bridge import ChurchBridge
from src.core.grounder import AddressGrounder
from src.core.homepage_grounder import (
    CASCADING_UNCERTAINTY_EVIDENCE,
    HomepageGrounder,
)
from src.core.models import ChurchRecord, SimpleAddressRecord


# --- AddressGrounder Tests ---

def test_confidence_scoring_high():
    grounder = AddressGrounder()
    score, level, evidence = grounder.calculate_confidence(
        church_name="광주동성교회",
        region="광주",
        pastor="안성주",
        place_name="광주동성교회",
        road_address="광주광역시 동구 필문대로 205",
        snippet="대표자 안성주 목사 시무 광주동성교회",
    )
    assert score >= 90
    assert level == "HIGH"
    assert "안성주" in evidence


def test_confidence_scoring_medium():
    grounder = AddressGrounder()
    score, level, evidence = grounder.calculate_confidence(
        church_name="하남샘물교회",
        region="경기",
        pastor="이철희",
        place_name="하남샘물교회",
        road_address="경기도 하남시 신평로 45",
        snippet="교회 정보 안내 (대표자 미확인)",
    )
    assert 70 <= score < 90
    assert level == "MEDIUM"


def test_confidence_scoring_low():
    grounder = AddressGrounder()
    score, level, evidence = grounder.calculate_confidence(
        church_name="새희망교회",
        region="부산",
        pastor="홍길동",
        place_name="희망선교회",
        road_address="서울특별시 종로구 10",
        snippet="무관한 단체",
    )
    assert score < 70
    assert level == "LOW"


def test_kakao_api_search_success():
    grounder = AddressGrounder(kakao_api_key="mock_kakao_key")
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "documents": [
            {
                "place_name": "광주동성교회",
                "road_address_name": "광주광역시 동구 필문대로 205",
                "address_name": "광주 동구 계림동 301",
                "phone": "062-225-0191",
                "place_url": "https://place.map.kakao.com/12345",
            }
        ]
    }
    mock_response.raise_for_status = MagicMock()

    with patch("requests.get", return_value=mock_response):
        candidates = grounder.search("광주동성교회", pastor="안성주", region="광주")
        assert len(candidates) == 1
        best = candidates[0]
        assert best.road_address == "광주광역시 동구 필문대로 205"
        assert best.phone == "062-225-0191"


def test_naver_api_search_success():
    grounder = AddressGrounder(
        naver_client_id="mock_id", naver_client_secret="mock_secret"
    )
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "items": [
            {
                "title": "광주<b>동성교회</b>",
                "roadAddress": "광주광역시 동구 필문대로 205",
                "address": "광주광역시 동구 계림동 301",
                "telephone": "062-225-0191",
                "link": "https://map.naver.com/p/entry/place/12345",
            }
        ]
    }
    mock_response.raise_for_status = MagicMock()

    with patch("requests.get", return_value=mock_response):
        candidates = grounder.search("광주동성교회", pastor="안성주", region="광주")
        assert len(candidates) == 1
        best = candidates[0]
        assert best.road_address == "광주광역시 동구 필문대로 205"
        assert best.place_name == "광주동성교회"


def test_api_network_failure_fallback():
    grounder = AddressGrounder(kakao_api_key="mock_key")
    # Simulate network failure
    with patch("requests.get", side_effect=Exception("Connection Timeout")):
        candidates = grounder.search("광주동성교회", pastor="안성주", region="광주")
        assert len(candidates) > 0
        assert candidates[0].road_address == "광주광역시 동구 필문대로 205"


# --- HomepageGrounder & Cascading Uncertainty Tests ---

def test_cascading_uncertainty_when_address_unconfirmed():
    hp_grounder = HomepageGrounder()
    # Unverified church record
    record = ChurchRecord(
        row_id=1,
        church_name="광주동성교회",
        pastor="안성주",
        region="광주",
        address="",
        verification_status="미검증",
    )

    candidate = hp_grounder.search_and_evaluate(record, mode="MASTER")
    assert candidate.confidence_level == "LOW"
    assert candidate.is_dependent_uncertain is True
    assert candidate.is_address_matched is False
    assert candidate.evidence == CASCADING_UNCERTAINTY_EVIDENCE


def test_cascading_uncertainty_in_simple_record():
    hp_grounder = HomepageGrounder()
    record = SimpleAddressRecord(
        row_id=2,
        church_name="광주동성교회",
        pastor="안성주",
        region="광주",
        road_address="",
        address_status="미검증",
    )

    candidate = hp_grounder.search_and_evaluate(record, mode="SIMPLE")
    assert candidate.confidence_level == "LOW"
    assert candidate.is_dependent_uncertain is True
    assert "Cascading Uncertainty" in candidate.evidence


def test_homepage_verified_when_address_confirmed_and_html_matches():
    hp_grounder = HomepageGrounder()
    record = ChurchRecord(
        row_id=1,
        church_name="광주동성교회",
        pastor="안성주",
        region="광주",
        address="광주광역시 동구 필문대로 205",
        verification_status="승인완료",
    )

    sample_html = """
    <html>
      <body>
        <h1>광주동성교회에 오신 것을 환영합니다</h1>
        <footer>
          <address>광주광역시 동구 필문대로 205 (계림동 301)</address>
          <p>전화: 062-225-0191</p>
        </footer>
      </body>
    </html>
    """

    candidate = hp_grounder.search_and_evaluate(
        record,
        mode="MASTER",
        site_url="http://www.gjdongsung.or.kr",
        site_html=sample_html,
    )
    assert candidate.confidence_level == "HIGH"
    assert candidate.is_dependent_uncertain is False
    assert candidate.is_address_matched is True
    assert "100% 일치" in candidate.evidence


def test_homepage_mismatch_when_site_address_differs():
    hp_grounder = HomepageGrounder()
    record = ChurchRecord(
        row_id=1,
        church_name="광주동성교회",
        pastor="안성주",
        region="광주",
        address="광주광역시 동구 필문대로 205",
        verification_status="승인완료",
    )

    different_html = """
    <html>
      <body>
        <footer>
          <address>서울특별시 종로구 대학로 100</address>
        </footer>
      </body>
    </html>
    """

    candidate = hp_grounder.search_and_evaluate(
        record,
        mode="MASTER",
        site_url="http://www.fake-church.or.kr",
        site_html=different_html,
    )
    assert candidate.confidence_level == "LOW"
    assert candidate.is_dependent_uncertain is False
    assert candidate.is_address_matched is False
    assert "불일치" in candidate.evidence


def test_extract_address_from_html():
    hp_grounder = HomepageGrounder()
    html = "<div>오시는 길: <span>경기도 하남시 신평로 45</span> 2층</div>"
    addr = hp_grounder.extract_address_from_html(html)
    assert addr == "경기도 하남시 신평로 45"


def test_is_address_matching():
    hp_grounder = HomepageGrounder()
    assert hp_grounder.is_address_matching(
        "광주광역시 동구 필문대로 205", "광주 동구 필문대로 205"
    )
    assert hp_grounder.is_address_matching(
        "서울특별시 중구 수표로 33", "서울 중구 수표로 33"
    )
    assert not hp_grounder.is_address_matching(
        "광주광역시 동구 필문대로 205", "부산광역시 해운대구 해운대로 10"
    )


# --- Bridge Integration & Security Tests ---

@patch("requests.get")
def test_bridge_address_and_homepage_integration(mock_get):
    # Mock responses for web requests
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {"Content-Type": "text/html; charset=utf-8"}
    mock_resp.iter_content = MagicMock(
        return_value=[
            b"<html><body><footer><address>\xea\xb4\x91\xec\xa3\xbc\xea\xb4\x91\xec\x97\xad\xec\x8b\x9c \xeb\x8f\x99\xea\xb5\xac \xed\x95\x84\xeb\xac\xb8\xeb\x8c\x80\xeb\xa1\x9c 205</address></footer></body></html>"
        ]
    )
    mock_resp.raise_for_status = MagicMock()
    mock_resp.text = "<html><body><footer><address>광주광역시 동구 필문대로 205</address></footer></body></html>"
    mock_get.return_value = mock_resp
    mock_get.return_value.__enter__.return_value = mock_resp

    bridge = ChurchBridge()
    # Row 2 initially has empty address and status="미검증"
    hp_res_before = bridge.search_homepage(2, mode="MASTER")
    assert hp_res_before["success"] is True
    cand_before = hp_res_before["data"]["candidate"]
    assert cand_before["confidence_level"] == "LOW"
    assert cand_before["is_dependent_uncertain"] is True

    # Search and confirm address
    addr_res = bridge.search_address(2, mode="MASTER")
    assert addr_res["success"] is True
    best_candidate = addr_res["data"]["candidates"][0]

    bridge.confirm_address(
        2, best_candidate["road_address"], best_candidate["zip_code"], mode="MASTER"
    )

    # Search homepage after address confirmation
    hp_res_after = bridge.search_homepage(2, mode="MASTER")
    assert hp_res_after["success"] is True
    cand_after = hp_res_after["data"]["candidate"]
    assert cand_after["confidence_level"] == "HIGH"
    assert cand_after["is_dependent_uncertain"] is False


def test_ssrf_protection():
    from src.core.homepage_grounder import is_safe_external_url

    # Dangerous local / private URLs
    assert not is_safe_external_url("http://localhost:8000")
    assert not is_safe_external_url("http://127.0.0.1:5000")
    assert not is_safe_external_url("http://0.0.0.0:80")
    assert not is_safe_external_url("ftp://example.com")
    assert not is_safe_external_url("javascript:alert(1)")
    assert not is_safe_external_url("")


def test_confirm_homepage_cascading_uncertainty_invariant():
    bridge = ChurchBridge()
    # Row 2 has empty address and is unconfirmed
    res = bridge.confirm_homepage(2, "http://www.gjdongsung.or.kr", mode="MASTER")
    assert res["success"] is False
    assert "Cascading Uncertainty" in res["error"]

    # Now confirm address first
    bridge.confirm_address(2, "광주광역시 동구 필문대로 205", "61448", mode="MASTER")
    # Now confirm homepage should succeed
    res_ok = bridge.confirm_homepage(2, "http://www.gjdongsung.or.kr", mode="MASTER")
    assert res_ok["success"] is True
    assert res_ok["data"]["updated_record"]["homepage_status"] == "확인완료"

