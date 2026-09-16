"""Unit tests for Church114 Orthodox Engine & Bridge IPC APIs."""

import pytest
from src.bridge import ChurchBridge
from src.core.church114_engine import (
    HERETIC_KEYWORDS,
    ORTHODOX_DENOMINATIONS,
    Church114Engine,
    classify_church114_scale,
    is_heretic_church,
)


@pytest.fixture
def engine(tmp_path):
    db_file = str(tmp_path / "test_church114.db")
    return Church114Engine(db_path=db_file)


def test_orthodox_whitelist_and_heretic_blacklist():
    # 1. 10대 정통 교단 화이트리스트 검증
    assert "예장합동" in ORTHODOX_DENOMINATIONS
    assert "예장통합" in ORTHODOX_DENOMINATIONS
    assert "기독교대한감리회" in ORTHODOX_DENOMINATIONS
    assert len(ORTHODOX_DENOMINATIONS) == 10

    # 2. 이단 키워드 블랙리스트 검사
    assert is_heretic_church("신천지예수교증거장막성전") is True
    assert is_heretic_church("하나님의교회 안상홍증인회") is True
    assert is_heretic_church("JMS 기독교복음선교회") is True
    assert is_heretic_church("기쁜소식강남교회 박옥수") is True
    assert is_heretic_church("영락교회", "서울특별시 중구 수표로 33") is False
    assert is_heretic_church("광주겨자씨교회", "광주광역시 남구 봉선로 12") is False


def test_scale_classification():
    assert classify_church114_scale(None) == "미입력"
    assert classify_church114_scale(0) == "미입력"
    assert classify_church114_scale(50) == "소형 (~100)"
    assert classify_church114_scale(300) == "중형 (100~500)"
    assert classify_church114_scale(700) == "중대형 (500~1000)"
    assert classify_church114_scale(2500) == "대형 (1000~3000)"
    assert classify_church114_scale(10000) == "초대형 (3000~)"


def test_hierarchy_analytics(engine):
    # 1. 전국 단위 집계
    national = engine.get_hierarchy_analytics()
    assert national["summary"]["total_churches"] > 0
    assert national["summary"]["total_members"] > 0
    assert len(national["denomination_distribution"]) > 0
    assert len(national["scale_distribution"]) == 6
    assert len(national["density_sub_regions"]) > 0

    # 2. 서울특별시 드릴다운 집계
    seoul = engine.get_hierarchy_analytics(sido="서울특별시")
    assert seoul["current_scope"]["sido"] == "서울특별시"
    assert seoul["summary"]["total_churches"] > 0
    # 하위 행정구역은 구 단위여야 함
    sub_names = [r["name"] for r in seoul["density_sub_regions"]]
    assert "강남구" in sub_names or "서초구" in sub_names

    # 3. 강남구 역삼동 세부 드릴다운 집계
    yeoksam = engine.get_hierarchy_analytics(
        sido="서울특별시", sigungu="강남구", eupmyeondong="역삼동"
    )
    assert yeoksam["current_scope"]["eupmyeondong"] == "역삼동"
    assert yeoksam["summary"]["total_churches"] >= 3
    # 교단 점유율 합이 100%에 근접해야 함
    ratios = sum(d["ratio"] for d in yeoksam["denomination_distribution"])
    assert 99.0 <= ratios <= 101.0


def test_top10_churches(engine):
    # 1. 전국 TOP 10
    top10_all = engine.get_top10_churches()
    assert len(top10_all) <= 10
    assert len(top10_all) > 0
    assert top10_all[0]["rank"] == 1
    # 첫 번째가 두 번째보다 성도 수가 많거나 같아야 함 (내림차순 정렬)
    assert top10_all[0]["congregation_size"] >= top10_all[1]["congregation_size"]
    # 필수 모든 지표가 포함되어 있어야 함
    for c in top10_all:
        assert "church_name" in c
        assert "denomination" in c
        assert "pastor" in c
        assert "road_address" in c
        assert "congregation_size" in c
        assert "scale_tier" in c

    # 2. 서울 강남구 TOP 10
    gangnam_top10 = engine.get_top10_churches(sido="서울특별시", sigungu="강남구")
    assert len(gangnam_top10) > 0
    assert all(c["sigungu"] == "강남구" for c in gangnam_top10)


def test_church_grid_list(engine):
    # 1. 필터 없이 전체 조회
    all_churches = engine.get_church_grid_list(limit=50)
    assert len(all_churches) > 0

    # 2. 교단 필터 (예장합동)
    hapdong = engine.get_church_grid_list(denomination="예장합동")
    assert len(hapdong) > 0
    assert all(c["denomination"] == "예장합동" for c in hapdong)

    # 3. 키워드 검색
    searched = engine.get_church_grid_list(keyword="소망")
    assert len(searched) >= 1
    assert any("소망" in c["church_name"] for c in searched)


def test_bridge_church114_ipc():
    bridge = ChurchBridge()
    # 1. 계층 분석 IPC
    res_an = bridge.get_church114_analytics(sido="서울특별시", sigungu="강남구")
    assert res_an["success"] is True
    assert res_an["data"]["summary"]["total_churches"] > 0

    # 2. TOP 10 IPC
    res_top10 = bridge.get_church114_top10(sido="서울특별시", sigungu="강남구")
    assert res_top10["success"] is True
    assert len(res_top10["data"]) > 0

    # 3. Grid IPC
    res_grid = bridge.get_church114_grid(sido="서울특별시", sigungu="강남구")
    assert res_grid["success"] is True
    assert len(res_grid["data"]) > 0
