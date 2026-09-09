# 📐 [설계지침서] church-partner-hub 소프트웨어 설계 및 구현 지침서

> **문서 버전:** v1.0.0  
> **작성일:** 2026-09-09  
> **상태:** 구현 표준 확정 (Technical Guideline)  
> **기준 기획안:** [product-specification.md](file:///C:/Users/20260602/Documents/github/church-partner-hub/docs/plans/product-specification.md)

---

## 1. 아키텍처 개요 및 모듈 구성 (Module Architecture)

### 1.1 계층 구조 (Layered Architecture)

```text
┌─────────────────────────────────────────────────────────────┐
│               Desktop UI Layer (pywebview)                  │
│       HTML5 + TailwindCSS + Lucide Icons + Chart.js         │
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
│ │  ExcelEngine  │ │AddressGrounder│ │   AnalyticsEngine   │ │
│ │ (openpyxl/pd) │ │(Hybrid Search)│ │(Denom/Size 5-Tiers) │ │
│ └───────────────┘ └───────────────┘ └─────────────────────┘ │
│ ┌───────────────┐ ┌───────────────┐ ┌─────────────────────┐ │
│ │DispatchManager│ │ObsidianBridge │ │    CacheManager     │ │
│ │(Quick Copy)   │ │ (Diff & Sync) │ │   (SQLite/JSON)     │ │
│ └───────────────┘ └───────────────┘ └─────────────────────┘ │
└──────────────────────────────┬──────────────────────────────┘
                               │  File / Network IO
┌──────────────────────────────▼──────────────────────────────┐
│                    External Interfaces                      │
│  - Google Sheets Export (.xlsx)   - Local File System       │
│  - Naver/Kakao Places (Web/API)   - Obsidian Vault (.md)    │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 소스코드 디렉토리 구조 (Directory Structure)

```text
church-partner-hub/
├── docs/
│   └── plans/
│       ├── product-specification.md       # 서비스 기획안
│       ├── technical-architecture-guide.md # 프로그램 설계지침서
│       └── implementation-plan.md         # 요구사항/구현계획서
├── src/
│   ├── __init__.py
│   ├── main.py                            # 데스크톱 앱 엔트리포인트 (pywebview 실행)
│   ├── bridge.py                          # UI ↔ 백엔드 IPC API 게이트웨이
│   ├── core/
│   │   ├── __init__.py
│   │   ├── models.py                      # 도메인 데이터 클래스 (Pydantic / Dataclasses)
│   │   ├── excel_engine.py                # 17개 컬럼 엑셀 입출력 & 서식 보존
│   │   ├── grounder.py                    # 하이브리드 주소 추정 및 근거 추출 엔진
│   │   ├── dispatch.py                    # 공문/선물 퀵서치 및 클립보드 포맷터
│   │   ├── analytics.py                   # 교세/교단/5단계 규모 통계 집계 엔진
│   │   └── cache.py                       # 검색 결과 로컬 캐싱 관리자
│   ├── sync/
│   │   ├── __init__.py
│   │   └── obsidian_bridge.py             # 옵시디언 Frontmatter 파싱, Diff, 생성
│   └── ui/
│       ├── index.html                     # 메인 단일 페이지 웹 대시보드
│       ├── css/                           # 스타일시트 (Tailwind 빌드/번들)
│       └── js/                            # UI 인터랙션 및 IPC 호출 스크립트
├── tests/                                 # 유닛 및 통합 테스트
├── church_partner_hub.spec                # PyInstaller 빌드 스펙
├── requirements.txt                       # 파이썬 런타임 의존성
└── README.md
```

---

## 2. 데이터 모델 명세 (Data Models)

### 2.1 `ChurchRecord` (마스터 레코드)
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
    verification_status: str = "미검증"     # 승인완료 | 직접입력 | 미검증
    obsidian_link: str = ""                # obsidian:// 딥링크
```

### 2.2 `AddressCandidate` (주소 추정 후보)
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

### 2.3 `ChurchScaleCategory` (교회 규모 5단계 정의)
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
  * 엑셀 로드 및 17개 컬럼 유효성 검증
  * 반환: `{ "rows": List[ChurchRecord], "stats": { "total": int, "missing_address": int } }`
* `api.save_excel(output_path: Optional[str] = None) -> dict`
  * 원본 서식을 유지하며 업데이트된 레코드 저장

### 3.2 주소 추정 및 검증 인터페이스
* `api.search_address(row_id: int) -> dict`
  * 해당 행의 `[지역, 교회명, 담임목사]`로 하이브리드 검색 수행
  * 반환: `{ "candidates": List[AddressCandidate] }`
* `api.confirm_address(row_id: int, candidate_index: int, custom_address: Optional[str] = None) -> dict`
  * 선택된 후보(또는 직접 입력 주소)를 레코드에 확정 반영

### 3.3 공문/선물 퀵서치 인터페이스
* `api.quick_search(keyword: str) -> dict`
  * 초성 또는 교회명/목사명으로 실시간 필터링
  * 반환: `{ "results": List[ChurchRecord] }`

### 3.4 지역별 교세 분석 인터페이스
* `api.get_analytics(region_filter: Optional[str] = None) -> dict`
  * 반환:
    * `summary`: 총 교회 수, 총 성도 수, 평균 성도 수
    * `denomination_distribution`: `[ { "name": "합동", "count": 12, "ratio": 45.2 }, ... ]`
    * `scale_distribution`: `[ { "scale": "소형", "count": 5, "ratio": 20.0 }, ... ]`
    * `cross_tab`: 교단 × 규모 교차 데이터 매트릭스
    * `churches`: 현재 조건에 부합하는 교회 상세 리스트 (드릴다운용)

### 3.5 옵시디언 스마트 동기화 인터페이스
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

---

## 5. 빌드 및 패키징 가이드라인 (Packaging Specification)

* **도구**: `PyInstaller` (단일 파일 모드: `--onefile --noconsole`)
* **프론트엔드 에셋**: `src/ui/` 디렉토리를 바이너리 내부 리소스(`sys._MEIPASS`)로 안전하게 번들링.
* **최적화**: 불필요한 대형 패키지(`torch`, `scipy`, `matplotlib` 등) 명시적 제외(`--exclude-module`).
* **실행 명령**:
  ```bash
  pyinstaller --noconfirm --onedir --windowed --name "ChurchPartnerHub" --add-data "src/ui;ui" src/main.py
  ```
