# 📋 [요구사항 정의 및 개발 계획서] church-partner-hub

> **문서 버전:** v1.1.0  
> **상위 기획안:** [product-specification.md](file:///C:/Users/20260602/Documents/github/church-partner-hub/docs/plans/product-specification.md)  
> **설계 지침서:** [technical-architecture-guide.md](file:///C:/Users/20260602/Documents/github/church-partner-hub/docs/plans/technical-architecture-guide.md)  
> **프로젝트 루트:** `C:\Users\20260602\Documents\github\church-partner-hub`

---

## 📌 개요 및 핵심 목표
1. 구글 스프레드시트 엑셀 파일(`.xlsx`)을 기반으로 `[담임목사, 교회명, 지역]` 데이터를 활용해 **정확한 도로명 주소를 신뢰도 및 근거(Grounding)와 함께 추정/확정**
2. **지역별 교세·교단·규모 분석(소형/중형/중대형/대형/초대형 및 교단 분포, 개수, 점유율, 드릴다운)**
3. 회사 요구 시 신속한 대응을 위한 **공문/선물 발송 퀵서처(원클릭 복사)**
4. 팀원/본부 범용 기본 모드 + 개인용 **옵시디언 스마트 동기화(Diff 대조, 상호보완)**
5. 윈도우 환경 무설치 **단일 포터블 `.exe` (PyInstaller + pywebview)**


---

## 🗓️ 단계별 구현 마일스톤 (Milestones)

### Phase 1: 기반 구조 및 데스크톱 UI 셸 구축
- [ ] Python 패키지 의존성 정의 (`requirements.txt`: `pywebview`, `pandas`, `openpyxl`, `beautifulsoup4`, `requests`, `pyinstaller`)
- [ ] `pywebview` 기반 데스크톱 네이티브 윈도우 러너 (`src/main.py`)
- [ ] 모던 반응형 프론트엔드 뷰 (`src/ui/`: 대시보드 탭, 주소검증 탭, 퀵서치 탭, 교세분석 탭, 설정 탭)
- [ ] Python 백엔드 ↔ JS 프론트엔드 간 양방향 IPC 통신 브릿지 (`src/bridge.py`)

### Phase 2: 17개 컬럼 엑셀 엔진 & 공문/선물 퀵서처
- [ ] `ExcelEngine` 구현 (`src/core/excel_engine.py`):
  - 사용자 구글 스프레드시트 17개 기본 컬럼 보존 및 서식/수식 손상 없는 입출력
  - 부가 컬럼(`우편번호`, `주소검증상태`, `Obsidian링크`) 안전 자동 관리
  - 엑셀 파일 락 충돌 방지(임시 파일 원자적 교체 및 파일 열림 사전 감지)
- [ ] `DispatchManager` 구현 (`src/core/dispatch.py`):
  - 교회명 초성 검색(`ㄱㅈㅅ` ➡️ 광주겨자씨교회) 및 목회자명 필터
  - 공문용 규격 텍스트 / 택배 선물용 규격 텍스트 / 스프레드시트용 TSV 원클릭 클립보드 복사
  - 선택 교회 일괄 발송용 미니 엑셀 다운로드

### Phase 3: 하이브리드 주소 추정기 & 대화형 Grounding 검증 UI
- [ ] `AddressGrounder` 구현 (`src/core/grounder.py`):
  - 1차: 무설정 웹 탐색(네이버 플레이스/포털)으로 주소 및 목회자 일치 스니펫 수집
  - 2차: `.env` 또는 설정에 카카오/네이버 API 등록 시 공식 API 고속 자동 전환
  - 신뢰도(Confidence) 산출: High (90%+), Medium (70~89%), Low (<70%)
  - 로컬 캐시(`address_cache.json`) 및 IP 차단 방지 지연(1.0~1.5초 Jitter)
- [ ] 대화형 Grounding 검증 뷰:
  - 후보 주소, 우편번호, 신뢰도 배지, 포털 지도 바로가기 버튼 표시
  - `[원클릭 승인]`, `[직접 수정]`, `[보류]` 액션 처리

### Phase 4: 지역별 교세·교단·규모 분석 엔진 & 시각화 (User Requirements)
- [ ] `AnalyticsEngine` 구현 (`src/core/analytics.py`):
  1. **지역별 기본 통계**:
     - 지역별 등록 교회 수, 총 성도 수, 평균 성도 수
  2. **지역별 교단(Denomination) 분포**:
     - 각 지역 내 교단별(합동, 통합, 백석, 기성 등) 교회 수 집계
     - 지역별 주요 교단 점유율(%) 산출
  3. **5단계 교회 규모(성도 수) 정밀 세그먼트**:
     - 🟢 **소형 교회**: ~100명 미만
     - 🔵 **중형 교회**: 100명 ~ 500명 미만
     - 🟡 **중대형 교회**: 500명 ~ 1,000명 미만
     - 🟠 **대형 교회**: 1,000명 ~ 3,000명 미만
     - 🔴 **초대형 교회**: 3,000명 이상
     - *(성도 수 누락 교회: '규모 미입력' 카테고리)*
  4. **규모별 교회 수 및 분포도(Distribution)**:
     - 각 규모 구간별 교회 수(개) 및 비율(%) 산출
     - 교단 × 규모 교차 집계표 (Cross-tabulation)
- [ ] 인터랙티브 교세 대시보드 뷰 (`src/ui/analytics.html`):
  - 지역별 규모 분포 누적 바 차트(Stacked Bar) 및 교단/규모 도넛 차트
  - **드릴다운(Drill-down)**: 특정 지역/교단/규모 클릭 시 하단에 해당 교회 상세 목록(교회명, 담임목사, 성도 수, 교단, 관리등급, 주소) 즉시 필터링 표시

### Phase 5: 옵시디언 ↔ 엑셀 스마트 동기화 모드
- [ ] `ObsidianBridge` 구현 (`src/sync/obsidian_bridge.py`):
  - 설정에서 `볼트 경로` 지정 시 활성화
  - **Diff 대조 및 해결**: 엑셀 ↔ 옵시디언 Frontmatter 불일치 시 사용자 선택(엑셀 기준 / 옵시디언 기준)
  - **상호 보완 (Gap-fill)**: 엑셀 신규 교회 ➡️ `20. Churches/{교회명}.md` 템플릿 자동 생성, 옵시디언 신규 교회 ➡️ 엑셀 행 추가 제안
  - 엑셀 내 `obsidian://` 딥링크 자동 생성

### Phase 6: 포터블 윈도우 `.exe` 패키징 및 최종 검증
- [ ] PyInstaller 스펙 파일 (`church_partner_hub.spec`) 구성 (웹 정적 에셋 번들링, 경량화)
- [ ] 단일 실행 파일 빌드 및 무설치 환경 실행 테스트
- [ ] 회귀 테스트 및 사용자 매뉴얼 작성
