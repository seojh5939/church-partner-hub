"""Domain data models and schemas for church-partner-hub."""

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ChurchRecord:
    """내부 기획자용 마스터 레코드 (기존 17개 고유 컬럼 + 시스템 확장 메타데이터)."""

    row_id: int  # 엑셀 행 고유 인덱스 (1-based)
    region: str = ""  # 1. 지역 (광주, 동대문 등)
    classification: str = ""  # 2. 구분 (이사교회, 타겟교회 등)
    church_name: str = ""  # 3. 교회명
    pastor: str = ""  # 4. 담임목사 성함
    address: str = ""  # 5. 교회 주소 (도로명)
    denomination: str = ""  # 6. 교단 (예장합동, 예장통합 등)
    congregation_size: Optional[int] = None  # 7. 성도 수(명)
    tier: str = ""  # 8. 관리등급 (A, B, C)
    temperature: str = ""  # 9. 온도감
    management_type: str = ""  # 10. 관리유형
    primary_campaign: str = ""  # 11. 1차 제안사업
    primary_campaign_date: str = ""  # 12. 1차 제안일 (YYYY-MM-DD)
    campaign_status: str = ""  # 13. 현재 제안단계
    followup_campaign: str = ""  # 14. 후속 제안사업
    next_action: str = ""  # 15. 다음 액션
    next_contact_date: str = ""  # 16. 다음 접촉일 (YYYY-MM-DD)
    remarks: str = ""  # 17. 비고

    # 시스템 확장 메타데이터
    zip_code: str = ""  # 우편번호 (5자리)
    homepage: str = ""  # 공식 홈페이지 URL
    verification_status: str = "미검증"  # 주소 검증상태: 승인완료 | 수기입력 | 미검증 | 불확실
    homepage_status: str = "미검증"  # 홈페이지 상태: 확인완료 | 불확실 | 미발견 | 미검증
    obsidian_link: str = ""  # obsidian:// 딥링크

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["scale_tier"] = classify_church_scale(self.congregation_size)
        return data


@dataclass
class SimpleAddressRecord:
    """외부/타 부서 일반 사용자용 간편 주소록 레코드 (3개 입력 ➡️ 7개 출력)."""

    row_id: int
    church_name: str
    pastor: str
    region: str
    road_address: str = ""
    zip_code: str = ""
    homepage: str = ""
    address_status: str = "미검증"  # 확인완료 | 불확실 | 미검증
    homepage_status: str = "미검증"  # 확인완료 | 불확실(주소불확실종속) | 미발견 | 미검증

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class AddressCandidate:
    """도로명 주소 추정 후보 데이터."""

    road_address: str
    jibun_address: str = ""
    zip_code: str = ""
    confidence: int = 0
    confidence_level: str = "LOW"  # HIGH (90+) | MEDIUM (70~89) | LOW (<70)
    match_evidence: str = ""
    map_url: str = ""
    place_name: str = ""
    phone: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class HomepageCandidate:
    """홈페이지 후보 및 종속적 불확실성(Cascading Uncertainty) 검증 결과."""

    url: str
    title: str = ""
    matched_address: str = ""
    is_address_matched: bool = False
    confidence_level: str = "LOW"  # HIGH | MEDIUM | LOW
    evidence: str = ""
    is_dependent_uncertain: bool = False  # 주소 불확실로 인해 강제 강등되었는지 여부

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def classify_church_scale(size: Optional[int]) -> str:
    """성도 수 규모 5단계 분류 정책을 엄격히 적용."""
    if size is None or size <= 0:
        return "미입력"
    if size < 100:
        return "소형 (~100)"
    if size < 500:
        return "중형 (100~500)"
    if size < 1000:
        return "중대형 (500~1000)"
    if size < 3000:
        return "대형 (1000~3000)"
    return "초대형 (3000~)"
