"""Comprehensive Unit Tests for AnalyticsEngine and Bridge Integration."""

import pytest
from src.bridge import ChurchBridge
from src.core.analytics import AnalyticsEngine, SCALE_CATEGORIES
from src.core.models import ChurchRecord


@pytest.fixture
def sample_records():
    return [
        ChurchRecord(
            row_id=1,
            region="광주",
            church_name="광주겨자씨교회",
            pastor="나학수",
            denomination="예장합동",
            congregation_size=3500,  # 초대형
        ),
        ChurchRecord(
            row_id=2,
            region="광주",
            church_name="광주동성교회",
            pastor="안성주",
            denomination="예장통합",
            congregation_size=800,  # 중대형
        ),
        ChurchRecord(
            row_id=3,
            region="서울",
            church_name="영락교회",
            pastor="김운성",
            denomination="예장통합",
            congregation_size=12000,  # 초대형
        ),
        ChurchRecord(
            row_id=4,
            region="경기",
            church_name="하남샘물교회",
            pastor="이철희",
            denomination="백석",
            congregation_size=250,  # 중형
        ),
        ChurchRecord(
            row_id=5,
            region="서울",
            church_name="개척교회",
            pastor="홍길동",
            denomination="기성",
            congregation_size=50,  # 소형
        ),
        ChurchRecord(
            row_id=6,
            region="경기",
            church_name="미상교회",
            pastor="김철수",
            denomination="기하성",
            congregation_size=None,  # 미입력
        ),
    ]


def test_analytics_summary(sample_records):
    engine = AnalyticsEngine()
    res = engine.calculate_analytics(sample_records)
    summary = res["summary"]

    assert summary["total_churches"] == 6
    assert summary["total_members"] == 3500 + 800 + 12000 + 250 + 50  # 16600
    assert summary["entered_count"] == 5
    assert summary["missing_count"] == 1
    assert summary["avg_members"] == int(16600 / 5)  # 3320
    assert summary["max_members"] == 12000
    assert summary["min_members"] == 50
    assert summary["entered_ratio"] == round(5 / 6 * 100, 1)


def test_analytics_regional_breakdown(sample_records):
    engine = AnalyticsEngine()
    res = engine.calculate_analytics(sample_records)
    breakdown = res["regional_breakdown"]

    # 3 regions: 광주(2), 서울(2), 경기(2)
    assert len(breakdown) == 3
    regions = {b["region"] for b in breakdown}
    assert regions == {"광주", "서울", "경기"}

    gwangju = next(b for b in breakdown if b["region"] == "광주")
    assert gwangju["church_count"] == 2
    assert gwangju["total_members"] == 4300
    assert gwangju["avg_members"] == 2150


def test_analytics_denomination_distribution(sample_records):
    engine = AnalyticsEngine()
    res = engine.calculate_analytics(sample_records)
    denoms = res["denomination_distribution"]

    # 예장통합 (2), 예장합동 (1), 백석 (1), 기성 (1), 기하성 (1)
    denom_map = {d["name"]: d for d in denoms}
    assert denom_map["예장통합"]["count"] == 2
    assert denom_map["예장통합"]["total_members"] == 12800
    assert denom_map["예장합동"]["count"] == 1
    assert denom_map["기하성"]["count"] == 1


def test_analytics_scale_distribution(sample_records):
    engine = AnalyticsEngine()
    res = engine.calculate_analytics(sample_records)
    scales = res["scale_distribution"]

    scale_map = {s["scale"]: s for s in scales}
    assert scale_map["소형 (~100)"]["count"] == 1  # 50명
    assert scale_map["중형 (100~500)"]["count"] == 1  # 250명
    assert scale_map["중대형 (500~1000)"]["count"] == 1  # 800명
    assert scale_map["대형 (1000~3000)"]["count"] == 0
    assert scale_map["초대형 (3000~)"]["count"] == 2  # 3500명, 12000명
    assert scale_map["미입력"]["count"] == 1

    total_scale_count = sum(s["count"] for s in scales)
    assert total_scale_count == len(sample_records)


def test_analytics_cross_tabulation(sample_records):
    engine = AnalyticsEngine()
    res = engine.calculate_analytics(sample_records)
    crosstab = res["crosstab"]

    assert crosstab["columns"] == SCALE_CATEGORIES
    assert crosstab["grand_total"] == 6

    # 예장통합: 중대형 1개 + 초대형 1개 = 총 2개
    tonghap_row = next(r for r in crosstab["rows"] if r["denomination"] == "예장통합")
    assert tonghap_row["total"] == 2
    assert tonghap_row["scales"]["중대형 (500~1000)"] == 1
    assert tonghap_row["scales"]["초대형 (3000~)"] == 1
    assert tonghap_row["scales"]["소형 (~100)"] == 0

    # Column total check
    col_totals = crosstab["column_totals"]
    assert col_totals["초대형 (3000~)"] == 2
    assert col_totals["미입력"] == 1
    assert sum(col_totals.values()) == 6


def test_analytics_drilldown_filtering(sample_records):
    engine = AnalyticsEngine()

    # 1. Region filter
    res_gwangju = engine.calculate_analytics(sample_records, region_filter="광주")
    assert res_gwangju["summary"]["total_churches"] == 2
    assert res_gwangju["drilldown_count"] == 2
    for c in res_gwangju["churches"]:
        assert c["region"] == "광주"

    # 2. Denomination drilldown
    res_tonghap = engine.calculate_analytics(sample_records, denomination_filter="예장통합")
    assert res_tonghap["drilldown_count"] == 2
    for c in res_tonghap["churches"]:
        assert c["denomination"] == "예장통합"

    # 3. Scale drilldown
    res_mega = engine.calculate_analytics(sample_records, scale_filter="초대형 (3000~)")
    assert res_mega["drilldown_count"] == 2
    names = [c["church_name"] for c in res_mega["churches"]]
    assert "광주겨자씨교회" in names
    assert "영락교회" in names

    # 4. Multi-criteria drilldown (Region: 서울, Denomination: 예장통합, Scale: 초대형)
    res_multi = engine.calculate_analytics(
        sample_records,
        region_filter="서울",
        denomination_filter="예장통합",
        scale_filter="초대형 (3000~)",
    )
    assert res_multi["drilldown_count"] == 1
    assert res_multi["churches"][0]["church_name"] == "영락교회"


def test_analytics_empty_records():
    engine = AnalyticsEngine()
    res = engine.calculate_analytics([])

    summary = res["summary"]
    assert summary["total_churches"] == 0
    assert summary["total_members"] == 0
    assert summary["avg_members"] == 0
    assert summary["entered_ratio"] == 0.0
    assert res["drilldown_count"] == 0
    assert len(res["crosstab"]["rows"]) == 0


def test_bridge_analytics_integration():
    bridge = ChurchBridge()
    # Initial demo data contains 4 records
    res = bridge.get_analytics()
    assert res["success"] is True
    data = res["data"]

    assert data["summary"]["total_churches"] == 4
    assert len(data["denomination_distribution"]) > 0
    assert len(data["scale_distribution"]) == len(SCALE_CATEGORIES)
    assert len(data["crosstab"]["rows"]) > 0

    # Test drilldown via bridge
    res_gwangju = bridge.get_analytics(region_filter="광주")
    assert res_gwangju["success"] is True
    assert res_gwangju["data"]["summary"]["total_churches"] == 2
