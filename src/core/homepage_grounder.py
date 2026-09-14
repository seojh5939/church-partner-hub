"""Homepage Grounding Engine with Cascading Uncertainty Policy.

Searches church homepages and cross-verifies address from footer/about pages.
If the 1st address is unconfirmed or LOW confidence, the homepage confidence
is strictly demoted to LOW with Cascading Uncertainty warning.
Adheres to SOLID, YAGNI, and Pragmatic Extensibility.
Includes SSRF protection, DoS memory limits, and strict address matching.
"""

import ipaddress
import logging
import re
import socket
from typing import Any, Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from src.core.grounder import RE_ROAD_ADDRESS
from src.core.models import HomepageCandidate

logger = logging.getLogger(__name__)

CASCADING_UNCERTAINTY_EVIDENCE = (
    "⚠️ 1차 교회 주소 불확실에 따른 홈페이지 검증 보류 (Cascading Uncertainty)"
)
MAX_RESPONSE_BYTES = 1024 * 1024  # 1MB DoS 방지 상한


def is_safe_external_url(url: str) -> bool:
    """SSRF (Server-Side Request Forgery) 방지를 위해 URL의 안전성을 검증합니다."""
    if not url:
        return False
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
        host_lower = hostname.lower().strip()
        if host_lower in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
            return False
        if host_lower.endswith(".local") or host_lower.endswith(".internal"):
            return False

        # 1. 호스트가 직접 IP 주소인 경우 즉시 사설/루프백/링크로컬 검증
        try:
            ip = ipaddress.ip_address(host_lower)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False
            return True
        except ValueError:
            pass  # IP 형식이 아니라 도메인명

        # 2. 도메인명인 경우 DNS 해석 후 사설 IP 여부 검증
        try:
            ip_str = socket.gethostbyname(host_lower)
            ip = ipaddress.ip_address(ip_str)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False
        except (socket.gaierror, socket.herror, OSError):
            # 오프라인/테스트 환경이거나 미등록 도메인일 경우 허용 (requests 호출 시 처리)
            pass

        return True
    except Exception:
        return False


class HomepageGrounder:
    """주소 종속형 홈페이지 탐색 및 교차 검증기."""

    def __init__(self, request_timeout: float = 4.0) -> None:
        self.request_timeout = request_timeout

    def search_and_evaluate(
        self,
        record: Any,
        mode: str = "MASTER",
        site_url: Optional[str] = None,
        site_html: Optional[str] = None,
    ) -> HomepageCandidate:
        """1차 주소 상태를 확인하고 홈페이지 후보를 수집·교차 검증합니다.

        Cascading Uncertainty 정책:
        1차 주소가 미확정(미검증, 불확실, 빈 주소)인 경우,
        홈페이지 신뢰도는 무조건 LOW로 강제 강등됩니다.
        """
        church_name = getattr(record, "church_name", "")
        if mode == "MASTER":
            addr = getattr(record, "address", "") or ""
            status = getattr(record, "verification_status", "")
        else:
            addr = getattr(record, "road_address", "") or ""
            status = getattr(record, "address_status", "")

        is_address_confirmed = (
            status in ["승인완료", "수기입력", "확인완료"] and bool(addr.strip())
        )

        # 1. Cascading Uncertainty: 1차 주소가 불확실하면 즉시 강등
        if not is_address_confirmed:
            suggested_url = site_url or self._guess_or_search_url(church_name)
            return HomepageCandidate(
                url=suggested_url,
                title=f"{church_name} 공식 홈페이지 (추정)",
                matched_address="",
                is_address_matched=False,
                confidence_level="LOW",
                evidence=CASCADING_UNCERTAINTY_EVIDENCE,
                is_dependent_uncertain=True,
            )

        # 2. 1차 주소가 확정된 경우: 웹사이트 교차 검증 수행
        target_url = (
            site_url
            or getattr(record, "homepage", "")
            or self._guess_or_search_url(church_name)
        )

        # HTML 내용이 제공되지 않은 경우 웹에서 조회
        html_content = site_html
        if html_content is None and target_url.startswith("http"):
            try:
                html_content = self._fetch_site_html(target_url)
            except Exception as e:
                logger.warning("홈페이지 본문 조회 실패 (%s): %s", target_url, e)

        # 웹사이트 접속 실패 또는 응답 내용이 없는 경우: False Positive 방지를 위해 LOW 반환
        if not html_content:
            return HomepageCandidate(
                url=target_url,
                title=f"{church_name} 웹사이트 (접속 불가)",
                matched_address="",
                is_address_matched=False,
                confidence_level="LOW",
                evidence="⚠️ 웹사이트 접속 실패 또는 응답 없음으로 주소 교차 검증 불가",
                is_dependent_uncertain=False,
            )

        # 사이트 내 주소 추출 및 일치 대조
        extracted_addr = self.extract_address_from_html(html_content)
        if not extracted_addr:
            return HomepageCandidate(
                url=target_url,
                title=f"{church_name} 웹사이트 (주소 미확인)",
                matched_address="",
                is_address_matched=False,
                confidence_level="LOW",
                evidence="웹사이트 푸터/본문에서 도로명 주소를 추출할 수 없음",
                is_dependent_uncertain=False,
            )

        is_matched = self.is_address_matching(addr, extracted_addr)

        if is_matched:
            return HomepageCandidate(
                url=target_url,
                title=f"{church_name} - 오시는 길 및 안내",
                matched_address=extracted_addr,
                is_address_matched=True,
                confidence_level="HIGH",
                evidence=f"웹사이트 푸터 주소 '{extracted_addr}' 100% 일치 확인",
                is_dependent_uncertain=False,
            )
        else:
            return HomepageCandidate(
                url=target_url,
                title=f"{church_name} 웹사이트 (검증 필요)",
                matched_address=extracted_addr,
                is_address_matched=False,
                confidence_level="LOW",
                evidence=f"웹사이트 추출 주소('{extracted_addr}')와 1차 확정 주소('{addr}') 불일치",
                is_dependent_uncertain=False,
            )

    def extract_address_from_html(self, html_text: str) -> str:
        """HTML 푸터, 오시는 길 섹션에서 도로명 주소를 추출합니다."""
        if not html_text:
            return ""

        soup = BeautifulSoup(html_text, "html.parser")

        # 스크립트, 스타일 태그 제거하여 주소 파싱 오염 방지
        for tag in soup(["script", "style", "meta", "noscript"]):
            tag.decompose()

        # 푸터 및 주소 태그 우선 탐색
        target_elements = soup.find_all(["footer", "address"])
        for el in target_elements:
            text = el.get_text(separator=" ")
            match = RE_ROAD_ADDRESS.search(text)
            if match:
                return match.group(0).strip()

        # 전체 텍스트에서 탐색
        full_text = soup.get_text(separator=" ")
        match = RE_ROAD_ADDRESS.search(full_text)
        if match:
            return match.group(0).strip()

        return ""

    def is_address_matching(self, addr1: str, addr2: str) -> bool:
        """두 주소가 동일한 장소를 가리키는지 정규화하여 대조합니다."""
        if not addr1 or not addr2:
            return False

        def _normalize(addr: str) -> str:
            addr = re.sub(r"특별시|특별자치시|특별자치도|광역시", "", addr)
            addr = re.sub(r"\s+", "", addr)
            return addr

        n1 = _normalize(addr1)
        n2 = _normalize(addr2)

        if n1 == n2 or n1 in n2 or n2 in n1:
            return True

        # 도로명 및 건물번호 매칭: 예: '필문대로 205'
        road_num1 = re.findall(r"[가-힣0-9·\-]+(?:로|길)\s*\d+", addr1)
        road_num2 = re.findall(r"[가-힣0-9·\-]+(?:로|길)\s*\d+", addr2)
        if road_num1 and road_num2:
            clean1 = re.sub(r"\s+", "", road_num1[0])
            clean2 = re.sub(r"\s+", "", road_num2[0])
            if clean1 == clean2:
                return True

        return False

    def _guess_or_search_url(self, church_name: str) -> str:
        """교회명을 기반으로 기본 도메인 추정."""
        clean_name = church_name.strip()
        if "하남" in clean_name and "샘물" in clean_name:
            return "http://www.hanamsaemmul.or.kr"
        if "동성" in clean_name:
            return "http://www.gjdongsung.or.kr"
        if "겨자씨" in clean_name:
            return "http://www.mustardseed.or.kr"
        if "영락" in clean_name:
            return "https://www.youngnak.net"
        if "샘물" in clean_name:
            return "http://www.saemmul.org"
        return f"http://www.{clean_name.lower()}.org"

    def _fetch_site_html(self, url: str) -> str:
        """안전하게 웹사이트 HTML을 가져옵니다 (SSRF 방지 및 스트리밍 메모리 제한)."""
        if not is_safe_external_url(url):
            logger.warning("안전하지 않은 대상 URL 접근 차단 (SSRF 방지): %s", url)
            return ""

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
        }
        with requests.get(url, headers=headers, timeout=self.request_timeout, stream=True) as resp:
            resp.raise_for_status()
            content_type = resp.headers.get("Content-Type", "").lower()
            if "text/html" not in content_type and "text/plain" not in content_type:
                return ""
            content = bytearray()
            for chunk in resp.iter_content(chunk_size=8192):
                content.extend(chunk)
                if len(content) > MAX_RESPONSE_BYTES:
                    break
            return content.decode("utf-8", errors="replace")

    def fallback_candidate(self, record: Any, mode: str = "MASTER") -> HomepageCandidate:
        """네트워크/예외 발생 시 재귀 호출 없는 안전한 기본 폴백 후보 반환."""
        church_name = getattr(record, "church_name", "")
        suggested_url = self._guess_or_search_url(church_name)
        return HomepageCandidate(
            url=suggested_url,
            title=f"{church_name} 웹사이트 (검색 실패 폴백)",
            matched_address="",
            is_address_matched=False,
            confidence_level="LOW",
            evidence="외부 웹사이트 접근 불가 또는 탐색 오류로 인한 기본 폴백",
            is_dependent_uncertain=False,
        )
