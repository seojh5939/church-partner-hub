"""Pytest configuration and test fixtures for church-partner-hub.

All mock data is strictly isolated to test fixtures, adhering to
the Zero-Seed Data Governance principle. Production code starts 100% empty.
"""

from typing import List
import pytest

from src.bridge import ChurchBridge
from src.core.models import ChurchRecord, SimpleAddressRecord


@pytest.fixture
def sample_master_records() -> List[ChurchRecord]:
    """테스트 전용 격리 마스터 레코드 픽스처 (4건)."""
    return [
        ChurchRecord(
            row_id=1,
            region="광주",
            classification="이사교회",
            church_name="광주겨자씨교회",
            pastor="나학수",
            address="광주광역시 남구 봉선로 12",
            denomination="예장합동",
            congregation_size=3500,
            tier="A",
            temperature="Hot",
            management_type="본부집중",
            primary_campaign="희망친구 결연",
            primary_campaign_date="2026-03-15",
            campaign_status="제안완료",
            followup_campaign="국내위기가정지원",
            next_action="추진위원회 방문 미팅",
            next_contact_date="2026-09-25",
            remarks="담임목사님 창립기념 선물 발송 완료",
            zip_code="61642",
            homepage="http://www.mustardseed.or.kr",
            verification_status="승인완료",
            homepage_status="확인완료",
        ),
        ChurchRecord(
            row_id=2,
            region="광주",
            classification="타겟교회",
            church_name="광주동성교회",
            pastor="안성주",
            address="",  # 주소 누락
            denomination="예장통합",
            congregation_size=800,
            tier="B",
            temperature="Warm",
            management_type="지역본부",
            primary_campaign="긴급구호",
            primary_campaign_date="2026-05-10",
            campaign_status="검토중",
            followup_campaign="우물파기",
            next_action="자료 이메일 발송",
            next_contact_date="2026-09-20",
            remarks="주소 확인 후 공문 발송 요청",
            zip_code="",
            homepage="",
            verification_status="미검증",
            homepage_status="미검증",
        ),
        ChurchRecord(
            row_id=3,
            region="서울",
            classification="후원교회",
            church_name="영락교회",
            pastor="김운성",
            address="서울특별시 중구 수표로 33",
            denomination="예장통합",
            congregation_size=12000,
            tier="A",
            temperature="Hot",
            management_type="본부집중",
            primary_campaign="식수지원",
            primary_campaign_date="2026-01-20",
            campaign_status="확정",
            followup_campaign="보건의료",
            next_action="분기 결과보고서 전달",
            next_contact_date="2026-10-01",
            remarks="대표 전화 및 부속기관 연계",
            zip_code="04551",
            homepage="https://www.youngnak.net",
            verification_status="승인완료",
            homepage_status="확인완료",
        ),
        ChurchRecord(
            row_id=4,
            region="경기",
            classification="타겟교회",
            church_name="하남샘물교회",
            pastor="이철희",
            address="",
            denomination="백석",
            congregation_size=250,
            tier="C",
            temperature="Cold",
            management_type="일반",
            primary_campaign="아동결연",
            primary_campaign_date="2026-07-01",
            campaign_status="보류",
            followup_campaign="",
            next_action="차기 컨택",
            next_contact_date="2026-11-10",
            remarks="동명 교회 확인 필요",
            zip_code="",
            homepage="",
            verification_status="미검증",
            homepage_status="미검증",
        ),
    ]


@pytest.fixture
def sample_simple_records() -> List[SimpleAddressRecord]:
    """테스트 전용 격리 간편 주소록 픽스처 (2건)."""
    return [
        SimpleAddressRecord(
            row_id=1,
            church_name="광주겨자씨교회",
            pastor="나학수",
            region="광주",
            road_address="광주광역시 남구 봉선로 12",
            zip_code="61642",
            homepage="http://www.mustardseed.or.kr",
            address_status="확인완료",
            homepage_status="확인완료",
        ),
        SimpleAddressRecord(
            row_id=2,
            church_name="광주동성교회",
            pastor="안성주",
            region="광주",
            road_address="",
            zip_code="",
            homepage="",
            address_status="미검증",
            homepage_status="미검증",
        ),
    ]


@pytest.fixture
def empty_bridge() -> ChurchBridge:
    """순수 프로덕션 초기 상태의 빈 브릿지 객체 (Zero-Seed Data)."""
    return ChurchBridge()


@pytest.fixture
def populated_bridge(
    sample_master_records: List[ChurchRecord],
    sample_simple_records: List[SimpleAddressRecord],
) -> ChurchBridge:
    """테스트 픽스처 데이터가 명시적으로 주입된 브릿지 객체."""
    bridge = ChurchBridge()
    bridge.master_records = [
        ChurchRecord(**vars(r)) for r in sample_master_records
    ]
    bridge.simple_records = [
        SimpleAddressRecord(**vars(r)) for r in sample_simple_records
    ]
    return bridge
