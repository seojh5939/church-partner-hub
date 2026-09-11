"""Unit tests for core models and scale categorization."""

from src.core.models import (
    ChurchRecord,
    SimpleAddressRecord,
    AddressCandidate,
    HomepageCandidate,
    classify_church_scale,
)


def test_church_scale_classification():
    assert classify_church_scale(None) == "미입력"
    assert classify_church_scale(0) == "미입력"
    assert classify_church_scale(80) == "소형 (~100)"
    assert classify_church_scale(100) == "중형 (100~500)"
    assert classify_church_scale(450) == "중형 (100~500)"
    assert classify_church_scale(500) == "중대형 (500~1000)"
    assert classify_church_scale(999) == "중대형 (500~1000)"
    assert classify_church_scale(1000) == "대형 (1000~3000)"
    assert classify_church_scale(2999) == "대형 (1000~3000)"
    assert classify_church_scale(3000) == "초대형 (3000~)"
    assert classify_church_scale(10000) == "초대형 (3000~)"


def test_church_record_serialization():
    record = ChurchRecord(
        row_id=1,
        region="광주",
        church_name="광주겨자씨교회",
        pastor="나학수",
        congregation_size=3500,
    )
    d = record.to_dict()
    assert d["row_id"] == 1
    assert d["church_name"] == "광주겨자씨교회"
    assert d["scale_tier"] == "초대형 (3000~)"
    assert d["verification_status"] == "미검증"


def test_simple_address_record():
    record = SimpleAddressRecord(
        row_id=1,
        church_name="테스트교회",
        pastor="홍길동",
        region="서울",
    )
    d = record.to_dict()
    assert d["church_name"] == "테스트교회"
    assert d["road_address"] == ""
    assert d["address_status"] == "미검증"


def test_homepage_candidate_cascading_uncertainty():
    cand = HomepageCandidate(
        url="http://test.org",
        confidence_level="LOW",
        is_dependent_uncertain=True,
    )
    d = cand.to_dict()
    assert d["is_dependent_uncertain"] is True
    assert d["confidence_level"] == "LOW"
