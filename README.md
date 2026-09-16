# 🏛️ church-partner-hub

> **교회 파트너십 관리 허브 (Church Partner Hub)**  
> 엑셀 마스터시트 관리, 옵시디언(Obsidian) 사역 일지 연계, 주소/규모 추정 인텔리전스 및 공문·선물 발송 지원 시스템

---

## 📌 프로젝트 비전 & 목표 (Vision & Goals)

1. **정확한 교회 주소 & 홈페이지 추정 (Cascading Grounding Intelligence)**
   - `[담임목사명, 교회명, 지역]` 시트 데이터를 기반으로 포털 지도 및 웹 검색을 통해 해당 교회의 정확한 도로명 주소와 공식 홈페이지를 추정.
   - **근거 중심(Grounding)**: 신뢰도 점수, 포털 지도 링크, 목회자/교단 일치 근거를 제공하여 사용자가 최종 검증하는 반자동 워크플로우.
   - **종속적 불확실성(Cascading Uncertainty)**: 홈페이지는 교회 실제 주소를 대조하여 검증하므로, **교회 주소가 불확실하면 홈페이지 역시 당연히 '불확실'로 종속 처리**하여 오정보 방지.

2. **이원화된 운영 모드 (Dual-Track Schema & Mode)**
   - **마스터 관리 모드 (내부 운영자용)**: 17개 고유 헤더 컬럼 100% 보존, 제안사업 현황, 후속조치 사항, 교세 분석, 옵시디언 동기화 지원.
   - **간편 주소록 모드 (외부/일반 사용자용)**: 17개 컬럼 없이 `[담임목사, 지역, 교회명]` 3개만 입력하면 정제된 **주소록과 공식 홈페이지 URL**을 자동 생성하여 엑셀/CSV로 출력.

3. **옵시디언(Obsidian)과의 유기적 연계**
   - **엑셀 시트**: 제안사업, 후속조치, 공문/선물 발송 등 한눈에 파악하는 고수준 관리
   - **옵시디언**: 교회 상세 프로필(`20. Churches`), 목회자 네트워크(`10. People`), 접촉/미팅 히스토리(`50. Meetings`) 등 심층 정보 관리
   - 두 저장소 간의 데이터 불일치를 방지하고 유기적인 동기화 보장

4. **지역별 교세·교단·규모 분석 (Regional Church Analytics)**
   - **지역별 기본 통계**: 지역별 등록 교회 수, 총 성도 수, 평균 성도 수
   - **지역별 교단 분포**: 지역 내 교단별(합동, 통합, 백석 등) 교회 수 및 점유율(%)
   - **5단계 규모별 세그먼트**: 소형(~100), 중형(100~500), 중대형(500~1,000), 대형(1,000~3,000), 초대형(3,000~)별 교회 수 및 분포도 시각화
   - **인터랙티브 드릴다운**: 특정 지역/교단/규모 클릭 시 해당하는 교회 상세 목록 즉시 조회

## 📂 프로젝트 문서 및 지침서 (Documentation)

* 🔄 [**작업 및 PR·배포 워크플로우 지침서 (`workflow-guide.md`)**](file:///C:/Users/20260602/Documents/github/church-partner-hub/docs/plans/workflow-guide.md)
* 📐 [**서비스 상세 기획안 (`product-specification.md`)**](file:///C:/Users/20260602/Documents/github/church-partner-hub/docs/plans/product-specification.md)
* ⚙️ [**프로그램 기술 설계지침서 (`technical-architecture-guide.md`)**](file:///C:/Users/20260602/Documents/github/church-partner-hub/docs/plans/technical-architecture-guide.md)
* 📋 [**요구사항 정의 및 개발 계획서 (`implementation-plan.md`)**](file:///C:/Users/20260602/Documents/github/church-partner-hub/docs/plans/implementation-plan.md)
* 📝 [**기본 설계서 (`design-church-partner-hub.md`)**](file:///C:/Users/20260602/Documents/github/church-partner-hub/docs/plans/designs/design-church-partner-hub.md)

---

## 📜 기획 및 구현 진행 상태

- [x] 프로젝트명 선정 (`church-partner-hub`)
- [x] Git 저장소 초기화 및 GitHub Public 연동
- [x] 서비스 상세 기획안 및 기술 설계지침서 (SOLID, YAGNI, 2~3회 확장성) 확정
- [x] 작업 워크플로우 지침서 및 GitHub Actions CI/CD 파이프라인 구성
- [x] **Phase 1: 기반 구조 및 UI 셸 구축 완료** (`pywebview`, 도메인 모델, IPC 브릿지, 단위 테스트 통과)
- [x] **Phase 2: 이원화 엑셀 엔진 & 공문/선물 퀵서처 구현 완료** (PR #1 머지)
- [x] **Phase 3: 2단계 하이브리드 주소·홈페이지 연계 Grounding & 종속적 불확실성 엔진 완료** (PR #2 머지)
- [x] **Phase 4: 지역별 교세·교단·5단계 규모 분석 & 교차 집계 대시보드 완료** (PR #3 머지)
- [x] **Phase 5: 옵시디언 ↔ 엑셀 스마트 동기화 및 템플릿 기반 Gap-fill 완료** (PR #4 머지)
- [x] **Phase 6: 포터블 윈도우 `.exe` 패키징 사양 구성 & 사용자 매뉴얼 작성 완료**

---

## 🚀 빠른 시작 (Quick Start)

### 1. 개발 환경 실행
```powershell
# 패키지 설치
pip install -r requirements.txt

# 앱 실행 (pywebview 데스크톱 GUI)
python src/main.py

# 무결성 스모크 테스트
python src/main.py --smoke-test

# 전체 단위 테스트 실행 (55종 100% PASS)
python -m pytest -v
```

### 2. 포터블 윈도우 `.exe` 빌드
별도의 파이썬 설치 없이 배포/사용 가능한 단일 실행 파일을 빌드할 수 있습니다:
```powershell
.\scripts\build_exe.bat
# 또는
python scripts/build_exe.py
```
생성된 실행 파일은 `dist/church-partner-hub.exe`에 위치합니다.

### 3. 사용자 가이드
상세한 기능별 사용법은 [**사용자 매뉴얼 (`docs/USER_MANUAL.md`)**](file:///C:/Users/20260602/Documents/github/church-partner-hub/docs/USER_MANUAL.md)을 참조하세요.

