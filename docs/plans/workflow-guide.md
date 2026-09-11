# 🔄 [워크플로우 지침서] Git 브랜치 전략, PR 및 CI/CD 배포 파이프라인

> **문서 버전:** v1.0.0  
> **작성일:** 2026-09-11  
> **상태:** 작업 표준 확정 (Operational Workflow Guideline)  
> **적용 대상:** church-partner-hub 개발 및 유지보수 전 과정

---

## 1. 핵심 개요 (Overview)

본 문서는 **`church-partner-hub`** 프로젝트의 품질 관리, 안전한 배포, 그리고 체계적인 협업을 위해 준수해야 할 **브랜치 운영 전략, PR(Pull Request) 워크플로우, GitHub Actions CI/CD 자동화 지침**을 정의합니다.

앞으로 진행되는 모든 기능 개발, 버그 수정, 리팩토링 작업은 반드시 본 지침서의 절차를 따릅니다.

---

## 2. 브랜치 전략 및 역할 (Branch Strategy)

```text
[feature/xxx] ──(작업/테스트)──> [PR to develop] ──(사용자 승인 Merge)──> [develop]
                                                                             │
                                                                   (배포 판단 시)
                                                                             ▼
[GitHub Release 배포] <──(버전 비교 자동 릴리즈)──<──(사용자 승인)──<── [PR to main]
```

### 2.1 브랜치 구조 및 명명 규칙
| 브랜치명 | 기준 분기점 | 역할 및 설명 | 병합 대상 (Target) |
|:---|:---|:---|:---|
| **`main`** | - | **실제 배포(Production) 전용 브랜치**. 항상 사용자 승인을 거쳐 릴리즈 가능한 안정적인 코드만 유지. | - |
| **`develop`** | `main` | **개발 통합 브랜치**. 모든 최신 개발 결과물이 최종 집약되는 중심 브랜치. | `main` |
| **`feat/{주제}`** | `develop` | 새로운 기능/Phase 개발용 작업 브랜치 (예: `feat/phase-2-excel-engine`). | `develop` |
| **`fix/{주제}`** | `develop` | 버그 수정 전용 작업 브랜치 (예: `fix/address-jitter-cache`). | `develop` |
| **`refactor/{주제}`** | `develop` | 기능 변경 없는 리팩토링 전용 브랜치. | `develop` |

> [!IMPORTANT]
> **절대 규칙**:
> 1. `main`이나 `develop` 브랜치에 직접 코드를 작성하고 커밋하는 것을 엄격히 금지합니다.
> 2. 모든 작업은 반드시 `develop`에서 분기한 작업 브랜치(`feat/...` 등)에서 수행합니다.
> 3. 에이전트는 단독으로 PR을 병합(Merge)할 수 없으며, **반드시 사용자의 검토 및 승인**을 거쳐야 합니다.

---

## 3. 단계별 작업 및 PR 라이프사이클 (Work & PR Lifecycle)

### 1단계: 작업 브랜치 생성 (Branch Out)
* 작업 착수 전 `develop` 브랜치를 최신 상태로 동기화한 후, 작업 주제에 맞는 브랜치를 생성합니다.
  ```bash
  git checkout develop
  git pull origin develop
  git checkout -b feat/phase-2-excel-engine
  ```

### 2단계: 기능 개발 및 로컬 테스트 (Develop & Test)
* S.O.L.I.D, YAGNI, 실용적 확장성 원칙을 준수하여 코드를 작성합니다.
* 단위 테스트(`pytest`) 및 Smoke-Test를 실행하여 100% 통과를 확인합니다.
  ```bash
  python -m pytest -v
  python src/main.py --smoke-test
  ```

### 3단계: 작업 커밋 및 푸시 (Commit & Push)
* Conventional Commits 규칙(`feat:`, `fix:`, `docs:` 등)을 준수하여 의미 있는 단위로 커밋 후 원격 작업 브랜치로 푸시합니다.
  ```bash
  git add .
  git commit -m "feat: implement ExcelEngine with dual-mode support"
  git push -u origin feat/phase-2-excel-engine
  ```

### 4단계: PR(Pull Request) 생성 및 사용자 검토 요청
* GitHub CLI(`gh pr create`)를 통해 `develop` 브랜치를 타깃으로 PR을 생성합니다.
* PR에는 **명확한 제목**과 **상세한 설명(작업 목적, 변경 파일, 테스트 결과, 특이사항)**을 포함합니다.
  ```bash
  gh pr create --base develop --head feat/phase-2-excel-engine --title "feat: Phase 2 이원화 엑셀 엔진 및 퀵서처 구현" --body "..."
  ```
* PR 생성 후 사용자에게 PR 링크와 작업 완료 요약을 보고하고 **사용자의 검토 및 병합 승인**을 기다립니다.

### 5단계: 사용자 승인 후 다음 작업 진행
* 사용자가 PR을 검토하고 병합을 승인하면, 다음 단계 작업 지시에 따라 새로운 작업 브랜치를 생성하고 순환합니다.

---

## 4. 릴리즈 및 배포 파이프라인 (Release & Deployment)

### 4.1 배포 결정 (`develop` ➡️ `main`)
* `develop`에 누적된 개발 결과물이 하나의 완성된 배포 단위(마일스톤/Phase)에 도달했다고 **사용자가 판단**할 때 배포 프로세스를 개시합니다.
* 에이전트는 `develop`을 `main`으로 병합하기 위한 Release PR을 생성합니다.
  ```bash
  gh pr create --base main --head develop --title "release: vX.Y.Z 배포" --body "..."
  ```

### 4.2 GitHub Actions 자동 릴리즈 트리거
사용자가 `main`으로의 PR 병합을 승인하면 GitHub Actions의 `release.yml` 워크플로우가 자동으로 실행됩니다:

1. **버전 감지 (Version Inspection)**:
   * 코드 내 버전(`src/__init__.py`의 `__version__`)을 파싱합니다.
2. **최신 Release 비교 (Version Comparison)**:
   * GitHub Repository의 가장 최근 릴리즈 태그(예: `v1.0.0`)와 현재 코드의 버전을 비교합니다.
3. **버전 상승 시 자동 배포 (Automated Publish)**:
   * **현재 코드의 버전이 최신 릴리즈 버전보다 높은 경우**:
     - 새 Git 태그(`vX.Y.Z`) 자동 생성 및 푸시
     - GitHub Release 자동 생성 (PR 내역 기반 Release Notes 작성)
     - PyInstaller 기반 윈도우 단일 포터블 바이너리(`.exe`) 빌드 후 릴리즈 에셋에 자동 첨부
   * **버전이 동일하거나 낮은 경우**:
     - 릴리즈를 건너뛰고 단순 동기화 커밋으로 처리 (중복 배포 방지)

---

## 5. GitHub Actions 워크플로우 구성 사양

### 5.1 CI 워크플로우 (`.github/workflows/ci.yml`)
* **트리거**:
  * `develop`, `main` 브랜치로 향하는 모든 Pull Request
  * `develop` 브랜치로의 Push
* **수행 작업**:
  * Python 3.14 환경 세팅
  * 의존성 패키지 설치 (`requirements.txt`)
  * `pytest` 전체 단위 테스트 실행
  * `src/main.py --smoke-test` 구동성 검증

### 5.2 Release 워크플로우 (`.github/workflows/release.yml`)
* **트리거**:
  * `main` 브랜치로의 Push (PR 병합 완료 시점)
* **수행 작업**:
  * `src/__init__.py` 버전과 최신 GitHub Release 태그 비교
  * 신규 버전일 시 Git Tag 생성 및 GitHub Release 발행
  * Windows runner 환경에서 PyInstaller 포터블 `.exe` 빌드 및 릴리즈 첨부
