"""Bridge Layer: Python backend ↔ JS frontend IPC API Gateway.

Follows SOLID and YAGNI principles. All methods return a standard dict:
{"success": bool, "data": Any, "error": Optional[str]}.
"""

from typing import Any, Dict, List, Optional
import os

from src.core.models import (
    AddressCandidate,
    ChurchRecord,
    HomepageCandidate,
    SimpleAddressRecord,
    classify_church_scale,
)


class ChurchBridge:
    """pywebview에 노출되는 JSON-RPC 브릿지 API."""

    def __init__(self) -> None:
        self.current_mode: str = "MASTER"  # "MASTER" | "SIMPLE"
        self.master_records: List[ChurchRecord] = []
        self.simple_records: List[SimpleAddressRecord] = []
        self._load_default_demo_data()

    def _load_default_demo_data(self) -> None:
        """초기 화면 렌더링 및 테스트를 위한 샘플 데이터 구성."""
        self.master_records = [
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
                address="",  # 주소 누락 샘플
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
                address="",  # 주소 불확실 샘플
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

        self.simple_records = [
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

    # --- Mode & Data Retrieval ---

    def get_initial_state(self) -> Dict[str, Any]:
        """UI 로드 시 초기 상태 및 레코드 목록 반환."""
        return {
            "success": True,
            "data": {
                "mode": self.current_mode,
                "master_records": [r.to_dict() for r in self.master_records],
                "simple_records": [r.to_dict() for r in self.simple_records],
                "stats": self._calculate_stats(),
            },
            "error": None,
        }

    def switch_mode(self, mode: str) -> Dict[str, Any]:
        """마스터 관리 모드 ⇋ 간편 주소록 모드 전환."""
        if mode in ["MASTER", "SIMPLE"]:
            self.current_mode = mode
            return {
                "success": True,
                "data": {"mode": self.current_mode, "stats": self._calculate_stats()},
                "error": None,
            }
        return {"success": False, "data": None, "error": f"지원하지 않는 모드입니다: {mode}"}

    def _calculate_stats(self) -> Dict[str, Any]:
        if self.current_mode == "MASTER":
            total = len(self.master_records)
            verified_addr = sum(1 for r in self.master_records if r.verification_status in ["승인완료", "수기입력"])
            missing_addr = total - verified_addr
            verified_hp = sum(1 for r in self.master_records if r.homepage_status == "확인완료")
        else:
            total = len(self.simple_records)
            verified_addr = sum(1 for r in self.simple_records if r.address_status == "확인완료")
            missing_addr = total - verified_addr
            verified_hp = sum(1 for r in self.simple_records if r.homepage_status == "확인완료")

        return {
            "total_count": total,
            "verified_address_count": verified_addr,
            "missing_address_count": missing_addr,
            "verified_homepage_count": verified_hp,
        }

    # --- Grounding: Address Search & Confirmation ---

    def search_address(self, row_id: int, mode: Optional[str] = None) -> Dict[str, Any]:
        """주소 후보 하이브리드 탐색."""
        target_mode = mode or self.current_mode
        record = self._find_record(row_id, target_mode)
        if not record:
            return {"success": False, "data": None, "error": "해당 행을 찾을 수 없습니다."}

        church_name = getattr(record, "church_name", "")
        pastor = getattr(record, "pastor", "")
        region = getattr(record, "region", "")

        # 데모 탐색 후보 생성
        if "동성교회" in church_name:
            candidates = [
                AddressCandidate(
                    road_address="광주광역시 동구 필문대로 205",
                    jibun_address="광주 동구 계림동 301",
                    zip_code="61448",
                    confidence=94,
                    confidence_level="HIGH",
                    match_evidence=f"네이버 지도 대표자 '{pastor}' 목사 확인됨",
                    map_url=f"https://map.naver.com/p/search/{region}%20{church_name}",
                    place_name=church_name,
                    phone="062-225-0191",
                ),
                AddressCandidate(
                    road_address="광주광역시 북구 설죽로 315",
                    jibun_address="광주 북구 일곡동 840",
                    zip_code="61040",
                    confidence=68,
                    confidence_level="LOW",
                    match_evidence="동명 교회 (북구 소재 / 대표자 상이)",
                    map_url=f"https://map.naver.com/p/search/{region}%20{church_name}",
                    place_name="북부동성교회",
                    phone="062-571-0691",
                ),
            ]
        elif "샘물교회" in church_name:
            candidates = [
                AddressCandidate(
                    road_address="경기도 하남시 신평로 45",
                    jibun_address="경기 하남시 신장동 430",
                    zip_code="12998",
                    confidence=72,
                    confidence_level="MEDIUM",
                    match_evidence="교회명 및 하남시 일치 (목회자명 웹 미확인)",
                    map_url=f"https://map.naver.com/p/search/{region}%20{church_name}",
                    place_name=church_name,
                    phone="031-791-0191",
                )
            ]
        else:
            candidates = [
                AddressCandidate(
                    road_address=getattr(record, "address", "") or f"{region} 중앙로 100",
                    jibun_address=f"{region} 중앙동 1",
                    zip_code=getattr(record, "zip_code", "") or "12345",
                    confidence=95,
                    confidence_level="HIGH",
                    match_evidence=f"대표자 '{pastor}' 일치 확인",
                    map_url=f"https://map.naver.com/p/search/{region}%20{church_name}",
                    place_name=church_name,
                    phone="02-1234-5678",
                )
            ]

        return {"success": True, "data": {"candidates": [c.to_dict() for c in candidates]}, "error": None}

    def confirm_address(
        self, row_id: int, address: str, zip_code: str = "", mode: Optional[str] = None
    ) -> Dict[str, Any]:
        """주소 확정 반영."""
        target_mode = mode or self.current_mode
        record = self._find_record(row_id, target_mode)
        if not record:
            return {"success": False, "data": None, "error": "해당 행을 찾을 수 없습니다."}

        if target_mode == "MASTER":
            record.address = address
            record.zip_code = zip_code
            record.verification_status = "승인완료"
        else:
            record.road_address = address
            record.zip_code = zip_code
            record.address_status = "확인완료"

        return {"success": True, "data": {"updated_record": record.to_dict()}, "error": None}

    # --- Grounding: Homepage Search & Cascading Uncertainty ---

    def search_homepage(self, row_id: int, mode: Optional[str] = None) -> Dict[str, Any]:
        """주소 종속형 홈페이지 탐색 및 교차 검증 (Cascading Uncertainty 적용)."""
        target_mode = mode or self.current_mode
        record = self._find_record(row_id, target_mode)
        if not record:
            return {"success": False, "data": None, "error": "해당 행을 찾을 수 없습니다."}

        church_name = getattr(record, "church_name", "")
        addr = getattr(record, "address", "") if target_mode == "MASTER" else getattr(record, "road_address", "")
        addr_status = (
            getattr(record, "verification_status", "")
            if target_mode == "MASTER"
            else getattr(record, "address_status", "")
        )

        is_address_confirmed = addr_status in ["승인완료", "수기입력", "확인완료"] and bool(addr)

        # Cascading Uncertainty 적용: 주소가 미확정이거나 불확실하면 홈페이지도 필연적으로 불확실 강등
        if not is_address_confirmed:
            candidate = HomepageCandidate(
                url=f"http://www.{church_name.lower()}.org" if "동성" not in church_name else "http://www.dongsung.org",
                title=f"{church_name} 공식 홈페이지 (추정)",
                matched_address="",
                is_address_matched=False,
                confidence_level="LOW",
                evidence="⚠️ 1차 교회 주소 불확실에 따른 홈페이지 검증 보류 (Cascading Uncertainty)",
                is_dependent_uncertain=True,
            )
        else:
            # 주소가 확정된 경우: 웹사이트 내 주소 일치 교차 검증 수행
            candidate = HomepageCandidate(
                url=f"http://www.{church_name.lower()}.org" if "동성" not in church_name else "http://www.gjdongsung.or.kr",
                title=f"{church_name} - 오시는 길 및 안내",
                matched_address=addr,
                is_address_matched=True,
                confidence_level="HIGH",
                evidence=f"웹사이트 푸터 주소 '{addr}' 100% 일치 확인",
                is_dependent_uncertain=False,
            )

        return {"success": True, "data": {"candidate": candidate.to_dict()}, "error": None}

    def confirm_homepage(self, row_id: int, url: str, mode: Optional[str] = None) -> Dict[str, Any]:
        """홈페이지 URL 확정 반영."""
        target_mode = mode or self.current_mode
        record = self._find_record(row_id, target_mode)
        if not record:
            return {"success": False, "data": None, "error": "해당 행을 찾을 수 없습니다."}

        record.homepage = url
        if target_mode == "MASTER":
            record.homepage_status = "확인완료"
        else:
            record.homepage_status = "확인완료"

        return {"success": True, "data": {"updated_record": record.to_dict()}, "error": None}

    # --- Quick Dispatch ---

    def quick_search(self, keyword: str) -> Dict[str, Any]:
        """교회명/담임목사 초성 및 키워드 검색."""
        kw = keyword.strip().lower()
        if not kw:
            records = self.master_records if self.current_mode == "MASTER" else self.simple_records
            return {"success": True, "data": {"results": [r.to_dict() for r in records]}, "error": None}

        results = []
        source = self.master_records if self.current_mode == "MASTER" else self.simple_records
        for r in source:
            c_name = getattr(r, "church_name", "").lower()
            p_name = getattr(r, "pastor", "").lower()
            reg = getattr(r, "region", "").lower()
            if kw in c_name or kw in p_name or kw in reg:
                results.append(r.to_dict())

        return {"success": True, "data": {"results": results}, "error": None}

    # --- Analytics (Master Mode) ---

    def get_analytics(self, region_filter: Optional[str] = None) -> Dict[str, Any]:
        """교세·교단·5단계 규모 통계 집계."""
        records = [
            r for r in self.master_records
            if not region_filter or region_filter == "전체" or r.region == region_filter
        ]

        total_churches = len(records)
        sizes = [r.congregation_size for r in records if r.congregation_size is not None]
        total_members = sum(sizes) if sizes else 0
        avg_members = int(total_members / len(sizes)) if sizes else 0

        # 교단 분포
        denom_counts: Dict[str, int] = {}
        for r in records:
            d = r.denomination or "미지정"
            denom_counts[d] = denom_counts.get(d, 0) + 1

        denom_dist = [
            {"name": k, "count": v, "ratio": round(v / total_churches * 100, 1) if total_churches else 0}
            for k, v in denom_counts.items()
        ]

        # 5단계 규모 분포
        scale_counts = {"소형 (~100)": 0, "중형 (100~500)": 0, "중대형 (500~1000)": 0, "대형 (1000~3000)": 0, "초대형 (3000~)": 0, "미입력": 0}
        for r in records:
            category = classify_church_scale(r.congregation_size)
            scale_counts[category] = scale_counts.get(category, 0) + 1

        scale_dist = [
            {"scale": k, "count": v, "ratio": round(v / total_churches * 100, 1) if total_churches else 0}
            for k, v in scale_counts.items()
            if v > 0
        ]

        return {
            "success": True,
            "data": {
                "summary": {
                    "total_churches": total_churches,
                    "total_members": total_members,
                    "avg_members": avg_members,
                },
                "denomination_distribution": denom_dist,
                "scale_distribution": scale_dist,
                "churches": [r.to_dict() for r in records],
            },
            "error": None,
        }

    # --- Helper ---

    def _find_record(self, row_id: int, mode: str) -> Any:
        if mode == "MASTER":
            for r in self.master_records:
                if r.row_id == row_id:
                    return r
        else:
            for r in self.simple_records:
                if r.row_id == row_id:
                    return r
        return None
