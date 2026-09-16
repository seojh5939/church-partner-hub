"""Unit tests for Phase 5 Obsidian synchronization bridge."""

import os
from pathlib import Path
import pytest

from src.core.models import ChurchRecord
from src.sync.obsidian_bridge import (
    ObsidianBridge,
    clean_wiki_link,
    dump_frontmatter_and_body,
    normalize_denomination,
    parse_frontmatter_and_body,
)
from src.bridge import ChurchBridge


@pytest.fixture
def mock_vault(tmp_path: Path) -> Path:
    """테스트용 가상 Obsidian 볼트 생성."""
    vault_dir = tmp_path / "TestVault"
    vault_dir.mkdir(parents=True, exist_ok=True)

    # 1. 90. Templates 및 교회 템플릿 생성
    templates_dir = vault_dir / "90. Templates"
    templates_dir.mkdir(parents=True, exist_ok=True)
    template_content = """---
type: church
region: ""
classification: ""
pastor: ""
denomination: ""
presbytery: ""
congregation_size: ""
tier: ""
active_campaigns: []
---

# {{title}}

## 🏢 교회 개요 & 특징
- **목회 방향 및 성향:** 
- **인구/세대 구성:** 

## 👥 소속 목회자 & 실무/중직자 네트워크
```dataview
TABLE role FROM "10. People"
```

## 📜 접촉 및 미팅 히스토리
```dataview
TABLE date FROM "50. Meetings"
```
"""
    (templates_dir / "Template - Church (교회_조직).md").write_text(
        template_content, encoding="utf-8"
    )

    # 2. 20. Churches 및 샘플 노트 생성
    churches_dir = vault_dir / "20. Churches"
    churches_dir.mkdir(parents=True, exist_ok=True)

    # Note 1: 광주겨자씨교회 (일치)
    c1 = """---
type: church
region: "[[광주]]"
classification: "이사교회"
pastor: "[[나학수 목사]]"
denomination: "합동"
tier: "A"
---

# 광주겨자씨교회

## 🏢 교회 개요 & 특징
- 광주 대표 교회
"""
    (churches_dir / "광주겨자씨교회.md").write_text(c1, encoding="utf-8")

    # Note 2: 광주동성교회 (목회자명 불일치: 엑셀 '안성주' vs 옵시디언 '홍길동')
    c2 = """---
type: church
region: "[[광주]]"
classification: "협력교회"
pastor: "[[홍길동 목사]]"
denomination: "통합"
tier: "B"
---

# 광주동성교회
"""
    (churches_dir / "광주동성교회.md").write_text(c2, encoding="utf-8")

    # Note 3: 옵시디언에만 있는 신규 교회
    c3 = """---
type: church
region: "[[서울]]"
classification: "타겟교회"
pastor: "[[김바울 목사]]"
denomination: "백석"
tier: "B"
congregation_size: "300~500"
---

# 서울새빛교회
"""
    (churches_dir / "서울새빛교회.md").write_text(c3, encoding="utf-8")

    return vault_dir


def test_clean_wiki_link_and_normalize():
    assert clean_wiki_link("[[광주]]") == "광주"
    assert clean_wiki_link("[[임도한 목사]]") == "임도한"
    assert clean_wiki_link("[[임도한]]") == "임도한"
    assert clean_wiki_link("나학수 목사") == "나학수"
    assert clean_wiki_link("나학수") == "나학수"
    assert clean_wiki_link("") == ""
    assert clean_wiki_link(None) == ""

    assert normalize_denomination("예장합동") == "합동"
    assert normalize_denomination("합동") == "합동"
    assert normalize_denomination("예장통합") == "통합"


def test_parse_and_dump_frontmatter():
    sample = """---
type: church
region: "[[광주]]"
classification: "이사교회"
pastor: "[[나학수 목사]]"
active_campaigns: []
---

# 교회 제목

```dataview
TABLE date FROM "50. Meetings"
```
"""
    fm, body = parse_frontmatter_and_body(sample)
    assert fm["type"] == "church"
    assert fm["region"] == "[[광주]]"
    assert fm["classification"] == "이사교회"
    assert fm["pastor"] == "[[나학수 목사]]"
    assert "TABLE date FROM" in body

    # 직렬화 후 재파싱 일치성 검증 (Dataview 본문 보존 불변식)
    dumped = dump_frontmatter_and_body(fm, body)
    fm2, body2 = parse_frontmatter_and_body(dumped)
    assert fm2 == fm
    assert body2.strip() == body.strip()


def test_vault_status_check(mock_vault: Path):
    bridge = ObsidianBridge()
    # 1. 유효한 볼트
    status = bridge.check_vault_status(str(mock_vault))
    assert status["valid"] is True
    assert status["vault_name"] == "TestVault"
    assert status["has_churches_dir"] is True
    assert status["churches_count"] == 3
    assert status["has_template"] is True

    # 2. 유효하지 않은 볼트
    invalid_status = bridge.check_vault_status("C:/non_existent_vault_12345")
    assert invalid_status["valid"] is False
    assert invalid_status["error"] is not None


def test_generate_deep_link():
    bridge = ObsidianBridge()
    link = bridge.generate_deep_link("C:/Vaults/Obsidian", "광주겨자씨교회")
    assert "obsidian://open?vault=Obsidian&file=20.%20Churches%2F" in link
    assert urllib_check(link, "광주겨자씨교회")


def urllib_check(link: str, church_name: str) -> bool:
    import urllib.parse
    return urllib.parse.quote(church_name) in link or church_name in link


def test_diff_records(mock_vault: Path):
    bridge = ObsidianBridge()
    records = [
        ChurchRecord(
            row_id=1,
            region="광주",
            classification="이사교회",
            church_name="광주겨자씨교회",
            pastor="나학수",
            denomination="예장합동",
            tier="A",
        ),
        ChurchRecord(
            row_id=2,
            region="광주",
            classification="협력교회",
            church_name="광주동성교회",
            pastor="안성주",  # 옵시디언에는 '홍길동'
            denomination="예장통합",
            tier="B",
        ),
        ChurchRecord(
            row_id=3,
            region="서울",
            classification="이사교회",
            church_name="서울영동교회",  # 볼트에 없음
            pastor="정현구",
            denomination="예장고신",
            tier="A",
        ),
    ]

    diff_res = bridge.diff_records(records, str(mock_vault))
    assert diff_res["success"] is True
    assert diff_res["in_sync_count"] == 1  # 광주겨자씨교회
    assert diff_res["diff_count"] >= 1     # 광주동성교회 pastor 불일치
    assert diff_res["missing_in_vault_count"] == 1  # 서울영동교회
    assert diff_res["missing_in_excel_count"] == 1  # 서울새빛교회

    # 광주겨자씨교회에 obsidian_link가 채워졌는지 확인
    assert records[0].obsidian_link != ""


def test_resolve_diff_use_excel(mock_vault: Path):
    bridge = ObsidianBridge()
    rec = ChurchRecord(
        row_id=2,
        region="광주",
        classification="협력교회",
        church_name="광주동성교회",
        pastor="안성주",
        denomination="예장통합",
    )

    # choice="USE_EXCEL" -> 옵시디언 파일의 pastor가 '[[안성주 목사]]'로 업데이트되어야 함
    res = bridge.resolve_diff(str(mock_vault), rec, field="pastor", choice="USE_EXCEL")
    assert res["success"] is True
    assert res["choice"] == "USE_EXCEL"

    # 파일 직접 확인
    file_path = mock_vault / "20. Churches" / "광주동성교회.md"
    content = file_path.read_text(encoding="utf-8")
    fm, _ = parse_frontmatter_and_body(content)
    assert clean_wiki_link(fm["pastor"]) == "안성주"


def test_resolve_diff_use_obsidian(mock_vault: Path):
    bridge = ObsidianBridge()
    rec = ChurchRecord(
        row_id=2,
        region="광주",
        classification="협력교회",
        church_name="광주동성교회",
        pastor="안성주",
        denomination="예장통합",
    )

    # choice="USE_OBSIDIAN" -> rec.pastor가 '홍길동'으로 업데이트되어야 함
    res = bridge.resolve_diff(str(mock_vault), rec, field="pastor", choice="USE_OBSIDIAN")
    assert res["success"] is True
    assert res["choice"] == "USE_OBSIDIAN"
    assert rec.pastor == "홍길동"


def test_create_church_note_with_template(mock_vault: Path):
    bridge = ObsidianBridge()
    new_rec = ChurchRecord(
        row_id=4,
        region="서울",
        classification="타겟교회",
        church_name="서울서문교회",
        pastor="이영훈",
        denomination="예장합동",
        congregation_size=1200,
        tier="A",
    )

    res = bridge.create_church_note(str(mock_vault), new_rec)
    assert res["success"] is True
    assert res["church_name"] == "서울서문교회"
    assert new_rec.obsidian_link != ""

    # 생성된 파일 검증
    target_file = mock_vault / "20. Churches" / "서울서문교회.md"
    assert target_file.exists()
    content = target_file.read_text(encoding="utf-8")
    fm, body = parse_frontmatter_and_body(content)
    assert fm["type"] == "church"
    assert clean_wiki_link(fm["pastor"]) == "이영훈"
    assert fm["denomination"] == "예장합동"
    assert fm["tier"] == "A"
    assert "# 서울서문교회" in body
    assert "TABLE role FROM" in body  # 템플릿 Dataview 정상 보존


def test_import_obsidian_to_excel(mock_vault: Path):
    bridge = ObsidianBridge()
    # 볼트의 '서울새빛교회'를 엑셀 레코드로 가져오기
    rec = bridge.import_obsidian_to_excel(str(mock_vault), "서울새빛교회", new_row_id=99)
    assert rec is not None
    assert rec.row_id == 99
    assert rec.church_name == "서울새빛교회"
    assert rec.pastor == "김바울"
    assert rec.region == "서울"
    assert rec.denomination == "백석"
    assert rec.tier == "B"
    assert rec.congregation_size == 500  # '300~500' -> 500


def test_bridge_obsidian_integration(mock_vault: Path, populated_bridge):
    bridge = populated_bridge
    bridge.obsidian_vault_path = str(mock_vault)

    # 1. 볼트 상태 확인
    status = bridge.check_obsidian_status()
    assert status["success"] is True
    assert status["data"]["valid"] is True

    # 2. Diff 분석
    diff_res = bridge.diff_obsidian()
    assert diff_res["success"] is True
    assert diff_res["data"]["in_sync_count"] >= 1

    # 3. 누락 노트 일괄 생성
    create_res = bridge.create_all_missing_notes()
    assert create_res["success"] is True

    # 4. 볼트 전용 교회 엑셀 가져오기
    import_res = bridge.import_obsidian_church("서울새빛교회")
    assert import_res["success"] is True
    assert any(r.church_name == "서울새빛교회" for r in bridge.master_records)
