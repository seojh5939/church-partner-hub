"""Obsidian Vault synchronization bridge for Church Partner Hub.

Provides YAML frontmatter parsing/serialization, diff detection between Excel and Obsidian,
conflict resolution, gap-fill note creation with templates, and obsidian:// deep links.
Zero external dependencies (pure standard library).
"""

import os
import re
import urllib.parse
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from src.core.models import ChurchRecord


def clean_wiki_link(val: Any) -> str:
    """위키링크 [[ ... ]] 및 부가 접미사를 제거하고 순수한 텍스트를 추출합니다.

    예:
      - '[[광주]]' -> '광주'
      - '[[임도한 목사]]' -> '임도한'
      - '[[임도한]]' -> '임도한'
      - '나학수 목사' -> '나학수'
    """
    if val is None:
        return ""
    text = str(val).strip()

    # [[ ... ]] 패턴 추출
    m = re.match(r"^\[\[(.*?)\]\]$", text)
    if m:
        text = m.group(1).strip()

    # '목사' 접미사 제거
    text = re.sub(r"\s+목사$", "", text).strip()
    return text


def normalize_denomination(val: Any) -> str:
    """교단명을 정규화하여 비교합니다 (예: '예장합동' <-> '합동')."""
    if not val:
        return ""
    text = str(val).strip()
    # '예장' 접두사 제거
    text = re.sub(r"^예장\s*", "", text).strip()
    return text


def parse_frontmatter_and_body(content: str) -> Tuple[Dict[str, Any], str]:
    """마크다운 문서에서 YAML Frontmatter와 본문 마크다운을 엄격하게 분리합니다.

    Frontmatter가 없는 경우 빈 딕셔너리와 전체 본문을 반환합니다.
    본문 내용(Dataview 등)은 단 1글자도 변경되지 않습니다.
    """
    pattern = r"^---\r?\n(.*?)\r?\n---\r?\n?(.*)$"
    match = re.match(pattern, content, re.DOTALL)
    if not match:
        return {}, content

    fm_raw = match.group(1)
    body = match.group(2)

    frontmatter: Dict[str, Any] = {}
    for line in fm_raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        comment_idx = line.find("#")
        if comment_idx != -1 and not (
            (line.startswith('"') and line.endswith('"'))
            or (line.startswith("'") and line.endswith("'"))
        ):
            in_quote = False
            cut_idx = -1
            for i, ch in enumerate(line):
                if ch in ('"', "'"):
                    in_quote = not in_quote
                elif ch == "#" and not in_quote:
                    cut_idx = i
                    break
            if cut_idx != -1:
                line = line[:cut_idx].strip()

        if ":" not in line:
            continue

        key, val = line.split(":", 1)
        key = key.strip()
        val = val.strip()

        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        elif val == "[]":
            val = []  # type: ignore

        frontmatter[key] = val

    return frontmatter, body


def dump_frontmatter_and_body(frontmatter: Dict[str, Any], body: str) -> str:
    """Frontmatter 딕셔너리와 본문을 결합하여 표준 마크다운 문자열로 직렬화합니다."""
    lines = ["---"]
    for k, v in frontmatter.items():
        if isinstance(v, list):
            if not v:
                lines.append(f"{k}: []")
            else:
                items_str = ", ".join(f'"{item}"' for item in v)
                lines.append(f"{k}: [{items_str}]")
        elif isinstance(v, (int, float)):
            lines.append(f"{k}: {v}")
        elif v is None:
            lines.append(f'{k}: ""')
        else:
            s_val = str(v)
            if "[" in s_val or "]" in s_val or ":" in s_val or " " in s_val or not s_val:
                clean_s = s_val.replace('"', '\\"')
                lines.append(f'{k}: "{clean_s}"')
            else:
                lines.append(f'{k}: "{s_val}"')

    lines.append("---")
    lines.append("")
    lines.append(body.lstrip("\r\n"))
    return "\n".join(lines)


class ObsidianBridge:
    """Obsidian Vault ⇋ Excel 마스터시트 스마트 동기화 브릿지."""

    DEFAULT_CHURCH_SUBDIR = "20. Churches"
    DEFAULT_TEMPLATE_SUBDIR = "90. Templates"
    DEFAULT_CHURCH_TEMPLATE = "Template - Church (교회_조직).md"

    def check_vault_status(self, vault_path: str) -> Dict[str, Any]:
        """볼트 경로의 유효성 및 필수 하위 폴더(20. Churches, 90. Templates) 인식 상태 확인."""
        if not vault_path:
            return {
                "valid": False,
                "error": "볼트 경로가 지정되지 않았습니다.",
                "vault_name": "",
                "churches_count": 0,
                "has_template": False,
            }

        p = Path(vault_path)
        if not p.exists() or not p.is_dir():
            return {
                "valid": False,
                "error": f"볼트 폴더를 찾을 수 없습니다: {vault_path}",
                "vault_name": p.name,
                "churches_count": 0,
                "has_template": False,
            }

        churches_dir = p / self.DEFAULT_CHURCH_SUBDIR
        churches_count = 0
        if churches_dir.exists() and churches_dir.is_dir():
            churches_count = len(list(churches_dir.glob("*.md")))

        template_path = p / self.DEFAULT_TEMPLATE_SUBDIR / self.DEFAULT_CHURCH_TEMPLATE
        has_template = template_path.exists() and template_path.is_file()

        return {
            "valid": True,
            "error": None,
            "vault_name": p.name,
            "vault_path": str(p.resolve()),
            "has_churches_dir": churches_dir.exists(),
            "churches_count": churches_count,
            "has_templates_dir": (p / self.DEFAULT_TEMPLATE_SUBDIR).exists(),
            "has_template": has_template,
            "template_path": str(template_path.resolve()) if has_template else None,
        }

    def generate_deep_link(self, vault_path: str, church_name: str) -> str:
        """Obsidian URL scheme 딥링크를 생성합니다 (obsidian://open?vault=...&file=...)."""
        vault_name = Path(vault_path).name if vault_path else "Obsidian"
        encoded_vault = urllib.parse.quote(vault_name, safe="")
        # 파일 경로: 20. Churches/{교회명}
        file_param = f"{self.DEFAULT_CHURCH_SUBDIR}/{church_name}"
        encoded_file = urllib.parse.quote(file_param, safe="")
        return f"obsidian://open?vault={encoded_vault}&file={encoded_file}"

    def scan_vault_churches(self, vault_path: str) -> Dict[str, Dict[str, Any]]:
        """볼트 내 20. Churches 폴더의 모든 교회 노트를 스캔하여 딕셔너리로 반환합니다."""
        p = Path(vault_path)
        churches_dir = p / self.DEFAULT_CHURCH_SUBDIR
        if not churches_dir.exists() or not churches_dir.is_dir():
            return {}

        result: Dict[str, Dict[str, Any]] = {}
        for md_file in churches_dir.glob("*.md"):
            church_name = md_file.stem.strip()
            try:
                content = md_file.read_text(encoding="utf-8", errors="replace")
                fm, body = parse_frontmatter_and_body(content)
                result[church_name] = {
                    "church_name": church_name,
                    "file_path": str(md_file.resolve()),
                    "frontmatter": fm,
                    "body": body,
                    "normalized": {
                        "pastor": clean_wiki_link(fm.get("pastor")),
                        "region": clean_wiki_link(fm.get("region")),
                        "denomination": normalize_denomination(clean_wiki_link(fm.get("denomination"))),
                        "tier": str(fm.get("tier", "")).strip(),
                        "classification": str(fm.get("classification", "")).strip(),
                    },
                }
            except Exception:
                continue

        return result

    def diff_records(
        self, records: List[ChurchRecord], vault_path: str
    ) -> Dict[str, Any]:
        """엑셀 레코드와 옵시디언 볼트 간의 Diff를 대조 분석합니다."""
        status = self.check_vault_status(vault_path)
        if not status["valid"]:
            return {
                "success": False,
                "error": status["error"],
                "in_sync_count": 0,
                "diff_count": 0,
                "missing_in_vault_count": 0,
                "missing_in_excel_count": 0,
                "diffs": [],
                "missing_in_vault": [],
                "missing_in_excel": [],
            }

        vault_churches = self.scan_vault_churches(vault_path)
        vault_church_names = set(vault_churches.keys())

        in_sync_count = 0
        diffs: List[Dict[str, Any]] = []
        missing_in_vault: List[Dict[str, Any]] = []
        excel_church_names = set()

        for r in records:
            c_name = r.church_name.strip()
            excel_church_names.add(c_name)

            if c_name not in vault_churches:
                missing_in_vault.append(r.to_dict())
                continue

            v_info = vault_churches[c_name]
            v_norm = v_info["normalized"]

            item_diffs = []

            # 담임목사 대조
            clean_excel_pastor = clean_wiki_link(r.pastor)
            if clean_excel_pastor and v_norm["pastor"] and clean_excel_pastor != v_norm["pastor"]:
                item_diffs.append(
                    {
                        "field": "pastor",
                        "label": "담임목사",
                        "excel_val": r.pastor,
                        "obsidian_val": v_info["frontmatter"].get("pastor", ""),
                    }
                )

            # 교단 대조
            norm_excel_denom = normalize_denomination(r.denomination)
            if norm_excel_denom and v_norm["denomination"] and norm_excel_denom != v_norm["denomination"]:
                item_diffs.append(
                    {
                        "field": "denomination",
                        "label": "교단",
                        "excel_val": r.denomination,
                        "obsidian_val": v_info["frontmatter"].get("denomination", ""),
                    }
                )

            # 지역 대조
            clean_excel_region = clean_wiki_link(r.region)
            if clean_excel_region and v_norm["region"] and clean_excel_region != v_norm["region"]:
                item_diffs.append(
                    {
                        "field": "region",
                        "label": "지역",
                        "excel_val": r.region,
                        "obsidian_val": v_info["frontmatter"].get("region", ""),
                    }
                )

            # 관리 등급 대조
            if r.tier and v_norm["tier"] and r.tier.strip() != v_norm["tier"]:
                item_diffs.append(
                    {
                        "field": "tier",
                        "label": "관리 등급",
                        "excel_val": r.tier,
                        "obsidian_val": v_norm["tier"],
                    }
                )

            # 분류(classification) 대조
            if (
                r.classification
                and v_norm["classification"]
                and r.classification.strip() != v_norm["classification"]
            ):
                item_diffs.append(
                    {
                        "field": "classification",
                        "label": "구분(분류)",
                        "excel_val": r.classification,
                        "obsidian_val": v_norm["classification"],
                    }
                )

            if item_diffs:
                for d in item_diffs:
                    diffs.append(
                        {
                            "row_id": r.row_id,
                            "church_name": c_name,
                            "field": d["field"],
                            "label": d["label"],
                            "excel_val": d["excel_val"],
                            "obsidian_val": d["obsidian_val"],
                            "file_path": v_info["file_path"],
                            "obsidian_link": self.generate_deep_link(vault_path, c_name),
                        }
                    )
            else:
                in_sync_count += 1
                r.obsidian_link = self.generate_deep_link(vault_path, c_name)

        missing_in_excel: List[Dict[str, Any]] = []
        for v_name in vault_church_names - excel_church_names:
            v_info = vault_churches[v_name]
            fm = v_info["frontmatter"]
            missing_in_excel.append(
                {
                    "church_name": v_name,
                    "pastor": clean_wiki_link(fm.get("pastor", "")),
                    "region": clean_wiki_link(fm.get("region", "")),
                    "denomination": clean_wiki_link(fm.get("denomination", "")),
                    "classification": fm.get("classification", ""),
                    "tier": fm.get("tier", ""),
                    "file_path": v_info["file_path"],
                    "obsidian_link": self.generate_deep_link(vault_path, v_name),
                }
            )

        return {
            "success": True,
            "error": None,
            "vault_path": vault_path,
            "in_sync_count": in_sync_count,
            "diff_count": len(diffs),
            "missing_in_vault_count": len(missing_in_vault),
            "missing_in_excel_count": len(missing_in_excel),
            "diffs": diffs,
            "missing_in_vault": missing_in_vault,
            "missing_in_excel": missing_in_excel,
        }

    def create_church_note(
        self, vault_path: str, record: ChurchRecord
    ) -> Dict[str, Any]:
        """엑셀 레코드를 기반으로 옵시디언 20. Churches/{교회명}.md 노트를 생성합니다."""
        p = Path(vault_path)
        churches_dir = p / self.DEFAULT_CHURCH_SUBDIR
        churches_dir.mkdir(parents=True, exist_ok=True)

        target_file = churches_dir / f"{record.church_name.strip()}.md"
        if target_file.exists():
            return {
                "success": False,
                "error": f"이미 노드가 존재합니다: {target_file.name}",
                "file_path": str(target_file.resolve()),
                "obsidian_link": self.generate_deep_link(vault_path, record.church_name),
            }

        template_file = p / self.DEFAULT_TEMPLATE_SUBDIR / self.DEFAULT_CHURCH_TEMPLATE
        if template_file.exists() and template_file.is_file():
            template_content = template_file.read_text(encoding="utf-8", errors="replace")
            fm, body = parse_frontmatter_and_body(template_content)
        else:
            fm = {
                "type": "church",
                "region": "",
                "classification": "",
                "pastor": "",
                "denomination": "",
                "presbytery": "",
                "congregation_size": "",
                "tier": "",
                "active_campaigns": [],
            }
            body = (
                "# {{title}}\n\n"
                "## 🏢 교회 개요 & 특징\n"
                "- **목회 방향 및 성향:** \n"
                "- **인구/세대 구성:** \n"
                "- **선교/지역사회 관심도:** \n\n"
                "## 👥 소속 목회자 & 실무/중직자 네트워크\n\n"
                "## 📜 접촉 및 미팅 히스토리\n"
            )

        fm["type"] = "church"
        if record.region:
            fm["region"] = f"[[{record.region}]]"
        if record.classification:
            fm["classification"] = record.classification
        if record.pastor:
            fm["pastor"] = f"[[{record.pastor} 목사]]"
        if record.denomination:
            fm["denomination"] = record.denomination
        if record.congregation_size:
            fm["congregation_size"] = str(record.congregation_size)
        if record.tier:
            fm["tier"] = record.tier

        replaced_body = body.replace("{{title}}", record.church_name.strip())
        full_content = dump_frontmatter_and_body(fm, replaced_body)

        temp_file = churches_dir / f".temp_{os.urandom(4).hex()}_{record.church_name.strip()}.md"
        try:
            temp_file.write_text(full_content, encoding="utf-8")
            os.replace(temp_file, target_file)
        finally:
            if temp_file.exists():
                try:
                    temp_file.unlink()
                except Exception:
                    pass

        deep_link = self.generate_deep_link(vault_path, record.church_name)
        record.obsidian_link = deep_link

        return {
            "success": True,
            "error": None,
            "church_name": record.church_name,
            "file_path": str(target_file.resolve()),
            "obsidian_link": deep_link,
        }

    def resolve_diff(
        self,
        vault_path: str,
        record: ChurchRecord,
        field: str,
        choice: str,
    ) -> Dict[str, Any]:
        """Diff 해결: USE_EXCEL(마크다운 업데이트) 또는 USE_OBSIDIAN(엑셀 레코드 필드 업데이트)."""
        p = Path(vault_path)
        churches_dir = p / self.DEFAULT_CHURCH_SUBDIR
        target_file = churches_dir / f"{record.church_name.strip()}.md"

        if not target_file.exists():
            return {"success": False, "error": f"옵시디언 노트를 찾을 수 없습니다: {target_file.name}"}

        content = target_file.read_text(encoding="utf-8", errors="replace")
        fm, body = parse_frontmatter_and_body(content)

        if choice == "USE_EXCEL":
            excel_val = getattr(record, field, None)
            if field == "pastor" and excel_val:
                fm["pastor"] = f"[[{excel_val} 목사]]"
            elif field == "region" and excel_val:
                fm["region"] = f"[[{excel_val}]]"
            elif excel_val is not None:
                fm[field] = excel_val

            new_content = dump_frontmatter_and_body(fm, body)
            temp_file = churches_dir / f".temp_{os.urandom(4).hex()}.md"
            try:
                temp_file.write_text(new_content, encoding="utf-8")
                os.replace(temp_file, target_file)
            finally:
                if temp_file.exists():
                    try:
                        temp_file.unlink()
                    except Exception:
                        pass

            return {
                "success": True,
                "choice": "USE_EXCEL",
                "field": field,
                "updated_value": getattr(record, field),
                "target": "OBSIDIAN",
            }

        elif choice == "USE_OBSIDIAN":
            obs_raw = fm.get(field, "")
            cleaned_val = clean_wiki_link(obs_raw) if field in ["pastor", "region", "denomination"] else str(obs_raw).strip()

            if hasattr(record, field):
                setattr(record, field, cleaned_val)

            return {
                "success": True,
                "choice": "USE_OBSIDIAN",
                "field": field,
                "updated_value": cleaned_val,
                "target": "EXCEL",
            }

        return {"success": False, "error": f"알 수 없는 선택입니다: {choice}"}

    def import_obsidian_to_excel(
        self, vault_path: str, church_name: str, new_row_id: int
    ) -> Optional[ChurchRecord]:
        """옵시디언 노트를 읽어 신규 ChurchRecord 인스턴스를 생성합니다."""
        p = Path(vault_path)
        target_file = p / self.DEFAULT_CHURCH_SUBDIR / f"{church_name.strip()}.md"
        if not target_file.exists():
            return None

        content = target_file.read_text(encoding="utf-8", errors="replace")
        fm, _ = parse_frontmatter_and_body(content)

        size_raw = fm.get("congregation_size", "")
        size_val = None
        if size_raw:
            digits = re.findall(r"\d+", str(size_raw))
            if digits:
                size_val = int(digits[-1])

        record = ChurchRecord(
            row_id=new_row_id,
            region=clean_wiki_link(fm.get("region", "")),
            classification=str(fm.get("classification", "")).strip(),
            church_name=church_name.strip(),
            pastor=clean_wiki_link(fm.get("pastor", "")),
            address="",
            zip_code="",
            denomination=clean_wiki_link(fm.get("denomination", "")),
            congregation_size=size_val,
            tier=str(fm.get("tier", "")).strip() or "B",
            obsidian_link=self.generate_deep_link(vault_path, church_name),
        )
        return record
