# 📐 [설계지침서] church-partner-hub 소프트웨어 설계 및 구현 지침서

> **문서 버전:** v1.1.0  
> **작성일:** 2026-09-09 (개정일: 2026-09-10)  
> **상태:** 구현 표준 확정 (Technical Guideline)  
> **기준 기획안:** [product-specification.md](file:///C:/Users/20260602/Documents/github/church-partner-hub/docs/plans/product-specification.md)

---

## 1. 아키텍처 개요 및 모듈 구성 (Module Architecture)

### 1.1 계층 구조 (Layered Architecture)

```text
┌─────────────────────────────────────────────────────────────┐
│               Desktop UI Layer (pywebview)                  │
│   [마스터 모드 / 간편 모드] HTML5 + TailwindCSS + Lucide    │
└──────────────────────────────┬──────────────────────────────┘
                               │  pywebview.api (JSON-RPC IPC)
┌──────────────────────────────▼──────────────────────────────┐
│                  Bridge Layer (IPC Gateway)                 │
│                      src/bridge.py                          │
└──────────────────────────────┬──────────────────────────────┘
                               │  Typed Method Calls
┌──────────────────────────────▼──────────────────────────────┐
│                    Core Service Engine                      │
│ ┌───────────────┐ ┌───────────────┐ ┌─────────────────────┐ │
│ │  ExcelEngine  │ │AddressGrounder│ │  HomepageGrounder   │ │
│ │(Master/Simple)│ │(Hybrid Search)│ │ (Cascading Ground)  │ │
│ └───────────────┘ └───────────────┘ └─────────────────────┘ │
│ ┌───────────────┐ ┌───────────────┐ ┌─────────────────────┐ │
│ │DispatchManager│ │ObsidianBridge │ │   AnalyticsEngine   │ │
│ │(Quick Copy)   │ │ (Diff & Sync) │ │ (Denom/Size 5-Tiers)│ │
│ └───────────────┘ └───────────────┘ └─────────────────────┘ │
│ ┌───────────────┐                                           │
│ │ CacheManager  │                                           │
│ │ (SQLite/JSON) │                                           │
│ └───────────────┘                                           │
└──────────────────────────────┬──────────────────────────────┘
                               │  File / Network IO
┌──────────────────────────────▼──────────────────────────────┐
│                    External Interfaces                      │
│  - Google Sheets Export (.xlsx)   - Local File System       │
│  - Simple Address Book (.csv/xlsx)- Web Search / Places API │
│  - Obsidian Vault (.md)                                     │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 소스코드 디렉토리 구조 (Directory Structure)

```text
church-partner-hub/
├── docs/
│   └── plans/
│       ├── product-specification.md        # 서비스 기획안 (이원화 모드 & 홈페이지 종속 검증 반영)
│       ├── technical-architecture-guide.md # 프로그램 설계지침서
│       └── implementation-plan.md          # 요구사항/구현계획서
├── src/
│   ├── __init__.py
│   ├── main.py                             # 데스크톱 앱 엔트리포인트 (pywebview 실행)
│   ├── bridge.py                           # UI ↔ 백엔드 IPC API 게이트웨이
│   ├── core/
│   │   ├── __init__.py
│   │   ├── models.py                       # 도메인 데이터 클래스 (Master & Simple models)
│   │   ├── excel_engine.py                 # 엑셀 입출력 (마스터 17컬럼 보존 & 간편 3입력 처리)
│   │   ├── grounder.py                     # 하이브리드 주소 추정기 (1차 주소 탐색)
│   │   ├── homepage_grounder.py            # 주소 종속형 홈페이지 탐색 및 교차 검증 엔진
│   │   ├── dispatch.py                     # 공문/선물 퀵서치 및 클립보드 포맷터
│   │   ├── analytics.py                    # 교세/교단/5단계 규모 통계 집계 엔진
│   │   └── cache.py                        # 주소/홈페이지 검색 결과 로컬 캐싱 관리자
│   ├── sync/
│   │   ├── __init__.py
│   │   └── obsidian_bridge.py              # 옵시디언 Frontmatter 파싱, Diff, 생성
│   └── ui/
│       ├── index.html                      # 메인 단일 페이지 웹 대시보드 (모드 전환 토글 포함)
│       ├── css/                            # 스타일시트 (Tailwind 빌드/번들)
│       └── js/                             # UI 인터랙션 및 IPC 호출 스크립트
├── tests/                                  # 유닛 및 통합 테스트
├── church_partner_hub.spec                 # PyInstaller 빌드 스펙
├── requirements.txt                        # 파이썬 런타임 의존성
└── README.md
```

---

## 2. 데이터 모델 명세 (Data Models)

### 2.1 `ChurchRecord` (마스터 레코드 - 내부 기획자용)
```python
from dataclasses import dataclass, field
from typing import Optional, List

@dataclass
class ChurchRecord:
    row_id: int                            # 엑셀 행 고유 인덱스 (1-based)
    region: str                            # 1. 지역 (광주, 동대문 등)
    classification: str                    # 2. 구분 (이사교회, 타겟교회 등)
    church_name: str                       # 3. 교회명
    pastor: str                            # 4. 담임목사 성함
    address: str                           # 5. 교회 주소 (도로명)
    denomination: str                      # 6. 교단 (예장합동, 예장통합 등)
    congregation_size: Optional[int]       # 7. 성도 수(명) (None = 미입력)
    tier: str                              # 8. 관리등급 (A, B, C)
    temperature: str                       # 9. 온도감
    management_type: str                   # 10. 관리유형
    primary_campaign: str                  # 11. 1차 제안사업
    primary_campaign_date: str             # 12. 1차 제안일 (YYYY-MM-DD)
    campaign_status: str                   # 13. 현재 제안단계
    followup_campaign: str                 # 14. 후속 제안사업
    next_action: str                       # 15. 다음 액션
    next_contact_date: str                 # 16. 다음 접촉일 (YYYY-MM-DD)
    remarks: str                           # 17. 비고
    
    # 시스템 확장 메타데이터 (부가 컬럼)
    zip_code: str = ""                     # 우편번호 (5자리)
    homepage: str = ""                     # 공식 홈페이지 URL
    verification_status: str = "미검증"     # 주소 검증상태: 승인완료 | 수기입력 | 미검증
    homepage_status: str = "미검증"         # 홈페이지 상태: 확인완료 | 불확실(주소불확실종속) | 미발견 | 미검증
    obsidian_link: str = ""                # obsidian:// 딥링크
```

### 2.2 `SimpleAddressRecord` (간편 주소록 레코드 - 외부/일반 사용자용)
```python
@dataclass
class SimpleAddressRecord:
    row_id: int                            # 행 번호
    church_name: str                       # 필수 입력 1: 교회명
    pastor: str                            # 필수 입력 2: 담임목사 성함
    region: str                            # 필수 입력 3: 지역
    road_address: str = ""                 # 생성 결과: 정규 도로명 주소
    zip_code: str = ""                     # 생성 결과: 5자리 우편번호
    homepage: str = ""                     # 생성 결과: 공식 홈페이지 URL
    address_status: str = "미검증"          # 주소 검증 상태 (확인완료 / 불확실 / 미검증)
    homepage_status: str = "미검증"         # 홈페이지 상태 (확인완료 / 불확실 / 미발견)
```

### 2.3 `AddressCandidate` (주소 추정 후보)
```python
@dataclass
class AddressCandidate:
    road_address: str                      # 정규 도로명 주소
    jibun_address: str                     # 지번 주소
    zip_code: str                          # 5자리 우편번호
    confidence: int                        # 신뢰도 점수 (0 ~ 100)
    confidence_level: str                  # HIGH (90+) | MEDIUM (70~89) | LOW (<70)
    match_evidence: str                    # 근거 (예: "네이버 지도 대표자 '나학수' 일치 확인")
    map_url: str                           # 포털 지도 바로가기 URL
    place_name: str                        # 포털에 등록된 공식 장소명
    phone: str = ""                        # 등록된 대표 전화번호
```

### 2.4 `HomepageCandidate` (홈페이지 추정 후보 및 종속 검증 결과)
```python
@dataclass
class HomepageCandidate:
    url: str                               # 후보 홈페이지 URL
    title: str                             # 웹사이트 타이틀
    matched_address: str                   # 웹사이트(푸터/오시는길)에서 추출된 주소
    is_address_matched: bool               # 1차 확정 주소와 일치 여부
    confidence_level: str                  # HIGH | MEDIUM | LOW
    evidence: str                          # 검증 근거 (예: "사이트 내 도로명 주소 일치")
    is_dependent_uncertain: bool = False   # 주소 불확실에 의해 강제 강등(Uncertain)되었는지 여부
```

### 2.5 `ChurchScaleCategory` (교회 규모 5단계 정의)
```python
def classify_church_scale(size: Optional[int]) -> str:
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
```

---

## 3. IPC 통신 인터페이스 규격 (`pywebview.api`)

프론트엔드 자바스크립트는 `window.pywebview.api.<method>(...)` 형태로 비동기 호출하며, 모든 응답은 `{ "success": bool, "data": ..., "error": str }` 공통 포맷을 준수한다.

### 3.1 파일 및 엑셀 인터페이스
* `api.load_excel(file_path: str) -> dict`
  * 엑셀 파일의 헤더를 자동 스캔하여 **운영 모드 자동 판별**:
    * **`MASTER` 모드**: 17개 고유 헤더 감지 시 ➡️ `List[ChurchRecord]` 파싱
    * **`SIMPLE` 모드**: `[담임목사, 지역, 교회명]` 3개 필수 헤더 감지 시 ➡️ `List[SimpleAddressRecord]` 파싱
  * 반환: `{ "mode": "MASTER"|"SIMPLE", "rows": [...], "stats": { "total": int, "missing_address": int, "missing_homepage": int } }`
* `api.save_excel(output_path: Optional[str] = None) -> dict`
  * 원본 마스터시트의 수식과 스타일을 100% 보존하며 업데이트된 레코드 저장
* `api.export_simple_address_book(output_path: str, format: str = "xlsx") -> dict`
  * 간편 주소록 모드 전용 내보내기: 불필요한 사내 컬럼을 배제하고 `[교회명, 담임목사, 지역, 도로명 주소, 우편번호, 교회 홈페이지, 검증 상태]` 7개 컬럼만 정제하여 `.xlsx` 또는 `.csv` 파일로 생성

### 3.2 2단계 주소·홈페이지 연계 Grounding 인터페이스
* `api.search_address(row_id: int, mode: str = "MASTER") -> dict`
  * 해당 행의 `[지역, 교회명, 담임목사]`로 1차 지도/웹 하이브리드 검색 수행
  * 반환: `{ "candidates": List[AddressCandidate] }`
* `api.confirm_address(row_id: int, candidate_index: int, custom_address: Optional[str] = None, mode: str = "MASTER") -> dict`
  * 선택된 주소 후보(또는 직접 입력 주소)를 레코드에 확정 반영
* `api.search_homepage(row_id: int, mode: str = "MASTER") -> dict`
  * **주소 종속형 홈페이지 탐색**:
    1. 해당 교회의 1차 주소 확정 상태 및 신뢰도를 조회.
    2. 포털 웹 검색을 통해 교회 공식 웹사이트 후보를 수집.
    3. 수집된 웹사이트의 '오시는 길' 페이지나 푸터 소재지 주소를 1차 주소와 교차 대조.
    4. **Cascading Uncertainty 적용**: 1차 주소가 `LOW`이거나 미확정인 경우, `is_dependent_uncertain = True`, `confidence_level = "LOW"`로 강제 강등 처리.
  * 반환: `{ "candidates": List[HomepageCandidate] }`
* `api.confirm_homepage(row_id: int, candidate_index: int, custom_url: Optional[str] = None, mode: str = "MASTER") -> dict`
  * 선택된 홈페이지(또는 직접 입력 URL)를 레코드에 확정 반영

### 3.3 공문/선물 퀵서치 인터페이스
* `api.quick_search(keyword: str) -> dict`
  * 초성 또는 교회명/목사명으로 실시간 필터링
  * 반환: `{ "results": List[ChurchRecord] }`

### 3.4 지역별 교세 분석 인터페이스 (마스터 모드)
* `api.get_analytics(region_filter: Optional[str] = None) -> dict`
  * 반환:
    * `summary`: 총 교회 수, 총 성도 수, 평균 성도 수
    * `denomination_distribution`: `[ { "name": "합동", "count": 12, "ratio": 45.2 }, ... ]`
    * `scale_distribution`: `[ { "scale": "소형", "count": 5, "ratio": 20.0 }, ... ]`
    * `cross_tab`: 교단 × 규모 교차 데이터 매트릭스
    * `churches`: 현재 조건에 부합하는 교회 상세 리스트 (드릴다운용)

### 3.5 옵시디언 스마트 동기화 인터페이스 (마스터 모드)
* `api.check_obsidian_status(vault_path: str) -> dict`
  * 볼트 유효성 검사 및 `20. Churches`, `90. Templates` 인식 확인
* `api.diff_obsidian(vault_path: str) -> dict`
  * 엑셀과 볼트 간 차이점 추출 (`diffs`, `missing_in_vault`, `missing_in_excel`)
* `api.resolve_diff(row_id: int, choice: str) -> dict`
  * `choice`: `"USE_EXCEL"` 또는 `"USE_OBSIDIAN"` 반영
* `api.create_obsidian_note(row_id: int) -> dict`
  * `Template - Church.md` 기반으로 신규 마크다운 노트 자동 생성

---

## 4. 예외 처리 및 기술 안전 지침 (Safety Guidelines)

1. **파일 락(PermissionError) 방지**:
   * 엑셀 저장 시 `~$`로 시작하는 잠금 파일 존재 여부를 먼저 확인.
   * `temp_{uuid}.xlsx`에 먼저 기록 완료 후, 원자적(Atomic)으로 원본 파일과 교체(`os.replace`).
   * 사용자가 엑셀을 열어두어 쓰기 실패 시 "파일이 열려 있습니다. 엑셀을 닫고 다시 시도해주세요" 모달 경고 표시.
2. **웹 요청 차단 방지 (Anti-Scraping / Rate Limiting)**:
   * 검색 요청마다 `1.0 ~ 1.5초` 무작위 지연(Jitter) 적용.
   * 동일한 `[지역+교회명]` 검색 결과는 로컬 SQLite/JSON 캐시에 영구 저장하여 불필요한 재검색 방지.
3. **옵시디언 마크다운 보존**:
   * YAML Frontmatter 수정 시 본문의 Dataview 쿼리나 본문 텍스트가 절대 훼손되지 않도록 `python-frontmatter` 또는 엄격한 정규식 블록 치환기 적용.
   * 파일 수정 전 `.trash/` 또는 `.bak` 백업 생성.
4. **홈페이지 검증의 종속적 불확실성(Cascading Uncertainty) 강제 로직**:
   * **원칙**: 홈페이지 검증 엔진(`HomepageGrounder`)은 단독으로 신뢰도를 결정하지 않고 1차 주소 검증 결과를 파이프라인 종속 변수로 삼는다.
   * **판정 알고리즘**:
     ```python
     def evaluate_homepage(church: ChurchRecord, site_url: str, site_text: str) -> HomepageCandidate:
         # 1. 1차 주소 신뢰도 검사
         is_address_confirmed = (church.verification_status in ["승인완료", "수기입력"])
         
         # 2. 사이트 내 주소 추출 및 일치 대조
         matched_addr = extract_address_from_html(site_text)
         is_matched = is_address_similar(church.address, matched_addr) if church.address else False
         
         # 3. Cascading Uncertainty 강제 적용
         if not is_address_confirmed or not is_matched:
             # 주소가 불확실하거나 대조 불일치 시 필연적으로 LOW 강등
             return HomepageCandidate(
                 url=site_url,
                 title=extract_title(site_text),
                 matched_address=matched_addr,
                 is_address_matched=is_matched,
                 confidence_level="LOW",
                 evidence="⚠️ 1차 교회 주소 불확실 또는 사이트 내 주소 불일치로 인한 홈페이지 검증 보류",
                 is_dependent_uncertain=True
             )
         
         # 4. 주소 일치 및 목회자 교차 검증 통과 시 HIGH 부여
         return HomepageCandidate(
             url=site_url,
             title=extract_title(site_text),
             matched_address=matched_addr,
             is_address_matched=True,
             confidence_level="HIGH",
             evidence=f"도로명 주소 '{church.address}' 사이트 내 일치 확인 완료",
             is_dependent_uncertain=False
         )
     ```
   * 사용자가 검증 스튜디오에서 주소를 수기 입력하거나 승인하면, 즉시 `evaluate_homepage`가 재호출되어 홈페이지의 신뢰도가 정상적으로 재평가된다.

---

## 5. 빌드 및 패키징 가이드라인 (Packaging Specification)

* **도구**: `PyInstaller` (단일 파일 모드: `--onefile --noconsole`)
* **프론트엔드 에셋**: `src/ui/` 디렉토리를 바이너리 내부 리소스(`sys._MEIPASS`)로 안전하게 번들링.
* **최적화**: 불필요한 대형 패키지(`torch`, `scipy`, `matplotlib` 등) 명시적 제외(`--exclude-module`).
* **실행 명령**:
  ```bash
  pyinstaller --noconfirm --onedir --windowed --name "ChurchPartnerHub" --add-data "src/ui;ui" src/main.py
  ```
