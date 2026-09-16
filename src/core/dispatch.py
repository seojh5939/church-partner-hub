"""Quick Dispatch Manager for church-partner-hub.

Provides:
- Korean Chosung (initial consonant) decomposed search (e.g. 'ㄱㅈㅅ' -> '광주겨자씨교회')
- Multi-field search (church name, pastor name, region, address)
- Formatted clipboard text generation (Official dispatch, Parcel delivery, TSV table)
- Batch dispatch list Excel export
"""

from typing import Any, Dict, List, Optional, Union
import openpyxl

from src.core.models import ChurchRecord, SimpleAddressRecord

# 한글 초성 리스트 (19개)
CHOSUNG_LIST = [
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
    "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
]

# 검색 편의를 위한 된소리(쌍자음) -> 기본 자음 정규화 매핑
COMPLEX_CONSONANT_MAP = {
    "ㄲ": "ㄱ",
    "ㄸ": "ㄷ",
    "ㅃ": "ㅂ",
    "ㅆ": "ㅅ",
    "ㅉ": "ㅈ",
}


def extract_chosung(text: str, normalize_complex: bool = False) -> str:
    """한글 문자열에서 초성을 추출합니다.

    Args:
        text: 원본 문자열
        normalize_complex: True인 경우 쌍자음('ㅆ', 'ㄲ' 등)을 기본 자음('ㅅ', 'ㄱ')으로 정규화
    """
    result = []
    for char in text:
        code = ord(char)
        if 0xAC00 <= code <= 0xD7A3:
            chosung_index = (code - 0xAC00) // 588
            cho = CHOSUNG_LIST[chosung_index]
            if normalize_complex and cho in COMPLEX_CONSONANT_MAP:
                cho = COMPLEX_CONSONANT_MAP[cho]
            result.append(cho)
        else:
            result.append(char)
    return "".join(result)


def is_chosung_only(text: str) -> bool:
    """문자열이 자음(초성) 및 공백으로만 구성되어 있는지 확인합니다."""
    text_clean = text.replace(" ", "")
    if not text_clean:
        return False
    return all(
        c in CHOSUNG_LIST or 0x3131 <= ord(c) <= 0x314E
        for c in text_clean
    )


class DispatchManager:
    """공문/선물 퀵서처 및 발송 서식 생성 관리자."""

    @staticmethod
    def search(
        records: List[Union[ChurchRecord, SimpleAddressRecord, Dict[str, Any]]],
        query: str,
    ) -> List[Union[ChurchRecord, SimpleAddressRecord, Dict[str, Any]]]:
        """초성 및 일반 키워드로 레코드 목록을 필터링합니다.

        검색 대상 필드: church_name, pastor, region, address (또는 road_address)
        """
        q = query.strip()
        if not q:
            return records

        q_lower = q.lower()
        chosung_query = is_chosung_only(q)
        q_norm = "".join(COMPLEX_CONSONANT_MAP.get(c, c) for c in q.replace(" ", "").lower())

        matched = []
        for item in records:
            # item에서 필드 값 추출
            if isinstance(item, dict):
                c_name = item.get("church_name", "")
                p_name = item.get("pastor", "")
                reg = item.get("region", "")
                addr = item.get("address", "") or item.get("road_address", "")
            else:
                c_name = getattr(item, "church_name", "")
                p_name = getattr(item, "pastor", "")
                reg = getattr(item, "region", "")
                addr = getattr(item, "address", "") or getattr(item, "road_address", "")

            # 1. 일반 부분 검색 (소문자 기준)
            combined_raw = f"{c_name} {p_name} {reg} {addr}".lower()
            if q_lower in combined_raw:
                matched.append(item)
                continue

            # 2. 초성 검색 (검색어가 초성으로 구성된 경우)
            if chosung_query:
                # 일반 초성 대조
                c_cho = extract_chosung(c_name)
                p_cho = extract_chosung(p_name)
                combined_cho = f"{c_cho} {p_cho}".replace(" ", "")

                # 정규화된 초성 대조 (쌍자음 -> 단자음)
                c_cho_norm = extract_chosung(c_name, normalize_complex=True)
                p_cho_norm = extract_chosung(p_name, normalize_complex=True)
                combined_cho_norm = f"{c_cho_norm} {p_cho_norm}".replace(" ", "")

                if q.replace(" ", "") in combined_cho or q_norm in combined_cho_norm:
                    matched.append(item)
                    continue

        return matched

    @staticmethod
    def format_official(record: Union[ChurchRecord, SimpleAddressRecord, Dict[str, Any]]) -> str:
        """공문 발송용 규격 텍스트 포맷을 생성합니다."""
        data = record if isinstance(record, dict) else record.to_dict()
        church_name = data.get("church_name", "")
        pastor = data.get("pastor", "")
        zip_code = data.get("zip_code", "")
        addr = data.get("address", "") or data.get("road_address", "")
        remarks = data.get("remarks", "")

        zip_str = f"({zip_code}) " if zip_code else ""
        lines = [
            f"[공문 발송 규격]",
            f"수신: {church_name} ({pastor} 목사 귀하)",
            f"주소: {zip_str}{addr or '주소 미입력'}",
        ]
        if remarks:
            lines.append(f"비고: {remarks}")
        return "\n".join(lines)

    @staticmethod
    def format_parcel(record: Union[ChurchRecord, SimpleAddressRecord, Dict[str, Any]]) -> str:
        """택배/선물 발송용 규격 텍스트 포맷을 생성합니다."""
        data = record if isinstance(record, dict) else record.to_dict()
        church_name = data.get("church_name", "")
        pastor = data.get("pastor", "")
        zip_code = data.get("zip_code", "")
        addr = data.get("address", "") or data.get("road_address", "")
        remarks = data.get("remarks", "")

        lines = [
            f"[택배/선물 발송 정보]",
            f"받는분: {pastor} 목사 ({church_name})",
            f"우편번호: {zip_code or '미입력'}",
            f"배송주소: {addr or '주소 미입력'}",
        ]
        if remarks:
            lines.append(f"배송메모: {remarks}")
        return "\n".join(lines)

    @staticmethod
    def format_tsv(record: Union[ChurchRecord, SimpleAddressRecord, Dict[str, Any]]) -> str:
        """스프레드시트에 바로 붙여넣을 수 있는 TSV(탭 구분) 한 줄 문자열을 생성합니다."""
        data = record if isinstance(record, dict) else record.to_dict()
        church_name = data.get("church_name", "")
        pastor = data.get("pastor", "")
        region = data.get("region", "")
        addr = data.get("address", "") or data.get("road_address", "")
        zip_code = data.get("zip_code", "")
        homepage = data.get("homepage", "")
        remarks = data.get("remarks", "")

        cols = [church_name, pastor, region, zip_code, addr, homepage, remarks]
        return "\t".join(cols)

    @staticmethod
    def export_dispatch_list(
        records: List[Union[ChurchRecord, SimpleAddressRecord, Dict[str, Any]]],
        output_path: str,
    ) -> str:
        """발송 대상 목록을 엑셀(.xlsx) 파일로 내보냅니다."""
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "발송명단"

        headers = ["순번", "교회명", "담임목사", "지역", "우편번호", "도로명 주소", "홈페이지", "비고"]
        ws.append(headers)

        for idx, item in enumerate(records, start=1):
            data = item if isinstance(item, dict) else item.to_dict()
            c_name = data.get("church_name", "")
            pastor = data.get("pastor", "")
            region = data.get("region", "")
            zip_code = data.get("zip_code", "")
            addr = data.get("address", "") or data.get("road_address", "")
            homepage = data.get("homepage", "")
            remarks = data.get("remarks", "")

            ws.append([idx, c_name, pastor, region, zip_code, addr, homepage, remarks])

        wb.save(output_path)
        return output_path
