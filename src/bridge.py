"""Bridge Layer: Python backend ↔ JS frontend IPC API Gateway.

Follows SOLID and YAGNI principles. All methods return a standard dict:
{"success": bool, "data": Any, "error": Optional[str]}.
"""

from typing import Any, Dict, List, Optional, Tuple
import os

from src.core.analytics import AnalyticsEngine
from src.core.church114_engine import Church114Engine
from src.core.dispatch import DispatchManager
from src.core.excel_engine import ExcelEngine, ExcelFileLockedError
from src.core.grounder import AddressGrounder
from src.core.homepage_grounder import HomepageGrounder
from src.sync.obsidian_bridge import ObsidianBridge
from src.core.models import (
    AddressCandidate,
    ChurchRecord,
    HomepageCandidate,
    SimpleAddressRecord,
    classify_church_scale,
)

try:
    import webview
except ImportError:
    webview = None


class ChurchBridge:
    """pywebview에 노출되는 JSON-RPC 브릿지 API."""

    def __init__(self) -> None:
        self.current_mode: str = "MASTER"  # "MASTER" | "SIMPLE"
        self.master_records: List[ChurchRecord] = []
        self.simple_records: List[SimpleAddressRecord] = []
        self.excel_engine = ExcelEngine()
        self.dispatch_manager = DispatchManager()
        self.address_grounder = AddressGrounder()
        self.homepage_grounder = HomepageGrounder()
        self.analytics_engine = AnalyticsEngine()
        self.obsidian_bridge = ObsidianBridge()
        self.church114_engine = Church114Engine()
        self.obsidian_vault_path: str = r"C:\Users\20260602\Documents\github\Obsidian"
        self.loaded_file_path: Optional[str] = None

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
                "obsidian_vault_path": self.obsidian_vault_path,
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
            "loaded_file_path": self.loaded_file_path,
        }

    # --- Excel & File I/O ---

    def select_file_dialog(self, dialog_type: str = "open") -> Dict[str, Any]:
        """데스크톱 파일 선택 다이얼로그를 표시합니다."""
        if not webview or not webview.windows:
            return {"success": False, "data": None, "error": "파일 대화상자를 열 수 있는 윈도우 환경이 아닙니다."}

        try:
            window = webview.windows[0]
            if dialog_type == "open":
                file_types = ("Excel / CSV Files (*.xlsx;*.csv)", "All files (*.*)")
                result = window.create_file_dialog(webview.OPEN_DIALOG, allow_multiple=False, file_types=file_types)
                if result and len(result) > 0:
                    return {"success": True, "data": {"file_path": result[0]}, "error": None}
            elif dialog_type == "save":
                file_types = ("Excel Workbook (*.xlsx)", "CSV UTF-8 (*.csv)", "All files (*.*)")
                result = window.create_file_dialog(webview.SAVE_DIALOG, save_filename="church_partners.xlsx", file_types=file_types)
                if result:
                    path = result if isinstance(result, str) else result[0]
                    return {"success": True, "data": {"file_path": path}, "error": None}
            return {"success": False, "data": None, "error": "파일이 선택되지 않았습니다."}
        except Exception as e:
            return {"success": False, "data": None, "error": f"파일 대화상자 오류: {e}"}

    def load_excel(self, file_path: Optional[str] = None) -> Dict[str, Any]:
        """엑셀 또는 CSV 파일을 열어 스키마 모드를 자동 감지하고 데이터를 로드합니다."""
        target_path = file_path
        if not target_path:
            dialog_res = self.select_file_dialog("open")
            if not dialog_res["success"] or not dialog_res["data"]:
                return {"success": False, "data": None, "error": dialog_res.get("error") or "파일이 선택되지 않았습니다."}
            target_path = dialog_res["data"]["file_path"]

        try:
            detected_mode = self.excel_engine.detect_mode(target_path)
            self.current_mode = detected_mode
            self.loaded_file_path = target_path

            if detected_mode == "MASTER":
                records = self.excel_engine.load_master_records(target_path)
                self.master_records = records
            else:
                records = self.excel_engine.load_simple_records(target_path)
                self.simple_records = records

            return {
                "success": True,
                "data": {
                    "mode": self.current_mode,
                    "file_path": target_path,
                    "records": [r.to_dict() for r in records],
                    "master_records": [r.to_dict() for r in self.master_records],
                    "simple_records": [r.to_dict() for r in self.simple_records],
                    "stats": self._calculate_stats(),
                },
                "error": None,
            }
        except ExcelFileLockedError as e:
            return {"success": False, "data": None, "error": str(e)}
        except Exception as e:
            return {"success": False, "data": None, "error": f"파일 로드 실패: {e}"}

    def save_excel(self, output_path: Optional[str] = None) -> Dict[str, Any]:
        """현재 모드의 데이터를 엑셀로 저장합니다."""
        target_path = output_path or self.loaded_file_path
        if not target_path:
            dialog_res = self.select_file_dialog("save")
            if not dialog_res["success"] or not dialog_res["data"]:
                return {"success": False, "data": None, "error": "저장할 파일 경로가 지정되지 않았습니다."}
            target_path = dialog_res["data"]["file_path"]

        try:
            if self.current_mode == "MASTER":
                saved_path = self.excel_engine.save_master_records(self.master_records, target_path)
            else:
                saved_path = self.excel_engine.export_simple_address_book(self.simple_records, target_path)
            self.loaded_file_path = saved_path
            return {
                "success": True,
                "data": {"file_path": saved_path, "mode": self.current_mode},
                "error": None,
            }
        except ExcelFileLockedError as e:
            return {"success": False, "data": None, "error": str(e)}
        except Exception as e:
            return {"success": False, "data": None, "error": f"파일 저장 실패: {e}"}

    def export_simple_address_book(
        self, output_path: Optional[str] = None, format: str = "xlsx"
    ) -> Dict[str, Any]:
        """간편 주소록 모드 전용 7개 정제 컬럼 내보내기."""
        target_path = output_path
        if not target_path:
            dialog_res = self.select_file_dialog("save")
            if not dialog_res["success"] or not dialog_res["data"]:
                return {"success": False, "data": None, "error": "저장할 경로를 지정해주세요."}
            target_path = dialog_res["data"]["file_path"]

        try:
            saved_path = self.excel_engine.export_simple_address_book(
                self.simple_records, target_path, file_format=format
            )
            return {"success": True, "data": {"file_path": saved_path, "count": len(self.simple_records)}, "error": None}
        except ExcelFileLockedError as e:
            return {"success": False, "data": None, "error": str(e)}
        except Exception as e:
            return {"success": False, "data": None, "error": f"간편 주소록 내보내기 실패: {e}"}

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

        try:
            candidates = self.address_grounder.search(
                church_name=church_name, pastor=pastor, region=region
            )
        except Exception:
            candidates = self.address_grounder.fallback_candidates(church_name, pastor, region)

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

        try:
            candidate = self.homepage_grounder.search_and_evaluate(record, mode=target_mode)
        except Exception:
            candidate = self.homepage_grounder.fallback_candidate(record, mode=target_mode)

        return {"success": True, "data": {"candidate": candidate.to_dict()}, "error": None}

    def confirm_homepage(self, row_id: int, url: str, mode: Optional[str] = None) -> Dict[str, Any]:
        """홈페이지 URL 확정 반영 (Cascading Uncertainty 정책 준수)."""
        target_mode = mode or self.current_mode
        record = self._find_record(row_id, target_mode)
        if not record:
            return {"success": False, "data": None, "error": "해당 행을 찾을 수 없습니다."}

        # Cascading Uncertainty 불변식 검증: 1차 주소가 미확정된 상태에서는 홈페이지 확정 불가
        addr_status = getattr(
            record,
            "verification_status" if target_mode == "MASTER" else "address_status",
            "",
        )
        addr = getattr(
            record, "address" if target_mode == "MASTER" else "road_address", ""
        )
        if addr_status not in ["승인완료", "수기입력", "확인완료"] or not (
            addr and addr.strip()
        ):
            return {
                "success": False,
                "data": None,
                "error": "1차 도로명 주소가 미확정된 상태에서는 홈페이지를 확정할 수 없습니다 (Cascading Uncertainty 정책).",
            }

        record.homepage = url
        record.homepage_status = "확인완료"
        return {"success": True, "data": {"updated_record": record.to_dict()}, "error": None}

    # --- Quick Dispatch ---

    def quick_search(self, keyword: str) -> Dict[str, Any]:
        """교회명/담임목사 초성 및 키워드 검색."""
        source = self.master_records if self.current_mode == "MASTER" else self.simple_records
        matched = self.dispatch_manager.search(source, keyword)
        return {"success": True, "data": {"results": [r.to_dict() for r in matched]}, "error": None}

    def copy_dispatch_text(
        self, row_id: int, format_type: str = "official", mode: Optional[str] = None
    ) -> Dict[str, Any]:
        """공문용, 택배용, TSV 규격 텍스트를 생성하여 반환합니다."""
        target_mode = mode or self.current_mode
        record = self._find_record(row_id, target_mode)
        if not record:
            return {"success": False, "data": None, "error": "해당 행을 찾을 수 없습니다."}

        fmt = format_type.lower()
        if fmt == "official":
            text = self.dispatch_manager.format_official(record)
        elif fmt == "parcel":
            text = self.dispatch_manager.format_parcel(record)
        elif fmt == "tsv":
            text = self.dispatch_manager.format_tsv(record)
        else:
            return {"success": False, "data": None, "error": f"지원하지 않는 포맷입니다: {format_type}"}

        return {"success": True, "data": {"text": text, "format": fmt}, "error": None}

    def export_dispatch_list(
        self,
        output_path: Optional[str] = None,
        row_ids: Optional[List[int]] = None,
        mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        """선택된 교회(또는 전체) 목록을 발송용 엑셀로 내보냅니다."""
        target_mode = mode or self.current_mode
        source = self.master_records if target_mode == "MASTER" else self.simple_records

        if row_ids:
            target_records = [r for r in source if getattr(r, "row_id", 0) in row_ids]
        else:
            target_records = source

        target_path = output_path
        if not target_path:
            dialog_res = self.select_file_dialog("save")
            if not dialog_res["success"] or not dialog_res["data"]:
                return {"success": False, "data": None, "error": "저장할 경로를 지정해주세요."}
            target_path = dialog_res["data"]["file_path"]

        try:
            saved_path = self.dispatch_manager.export_dispatch_list(target_records, target_path)
            return {"success": True, "data": {"file_path": saved_path, "count": len(target_records)}, "error": None}
        except Exception as e:
            return {"success": False, "data": None, "error": f"발송 명단 내보내기 실패: {e}"}

    # --- Analytics (Master Mode) ---

    def get_analytics(
        self,
        region_filter: Optional[str] = None,
        denomination_filter: Optional[str] = None,
        scale_filter: Optional[str] = None,
    ) -> Dict[str, Any]:
        """교세·교단·5단계 규모 통계 집계 및 드릴다운 조회."""
        analytics_data = self.analytics_engine.calculate_analytics(
            records=self.master_records,
            region_filter=region_filter,
            denomination_filter=denomination_filter,
            scale_filter=scale_filter,
        )
        return {"success": True, "data": analytics_data, "error": None}

    # --- Obsidian Smart Sync (Master Mode) ---

    def set_obsidian_vault_path(self, vault_path: str) -> Dict[str, Any]:
        """옵시디언 볼트 경로 설정 및 상태 검증."""
        self.obsidian_vault_path = vault_path
        status = self.obsidian_bridge.check_vault_status(vault_path)
        return {"success": True, "data": status, "error": None}

    def check_obsidian_status(self, vault_path: Optional[str] = None) -> Dict[str, Any]:
        """옵시디언 볼트 유효성 및 템플릿 인식 상태 확인."""
        target_path = vault_path or self.obsidian_vault_path
        status = self.obsidian_bridge.check_vault_status(target_path)
        return {"success": status["valid"], "data": status, "error": status["error"]}

    def diff_obsidian(self, vault_path: Optional[str] = None) -> Dict[str, Any]:
        """엑셀 마스터 레코드와 옵시디언 볼트 간의 Diff 분석."""
        target_path = vault_path or self.obsidian_vault_path
        res = self.obsidian_bridge.diff_records(self.master_records, target_path)
        return {"success": res["success"], "data": res, "error": res["error"]}

    def resolve_obsidian_diff(
        self,
        row_id: int,
        field: str,
        choice: str,
        vault_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """엑셀 ⇋ 옵시디언 정보 불일치 해결 (USE_EXCEL 또는 USE_OBSIDIAN)."""
        target_path = vault_path or self.obsidian_vault_path
        record = self._find_record(row_id, "MASTER")
        if not record:
            return {"success": False, "data": None, "error": f"레코드를 찾을 수 없습니다: row_id={row_id}"}

        res = self.obsidian_bridge.resolve_diff(target_path, record, field, choice)
        return {
            "success": res["success"],
            "data": res,
            "error": res.get("error"),
            "record": record.to_dict(),
        }

    def create_obsidian_note(
        self, row_id: int, vault_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """엑셀 레코드를 기반으로 신규 옵시디언 노트 자동 생성 (Gap-fill)."""
        target_path = vault_path or self.obsidian_vault_path
        record = self._find_record(row_id, "MASTER")
        if not record:
            return {"success": False, "data": None, "error": f"레코드를 찾을 수 없습니다: row_id={row_id}"}

        res = self.obsidian_bridge.create_church_note(target_path, record)
        return {"success": res["success"], "data": res, "error": res.get("error")}

    def create_all_missing_notes(
        self, vault_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """볼트에 누락된 모든 엑셀 교회의 마크다운 노트를 일괄 자동 생성."""
        target_path = vault_path or self.obsidian_vault_path
        diff_res = self.obsidian_bridge.diff_records(self.master_records, target_path)
        if not diff_res["success"]:
            return {"success": False, "data": None, "error": diff_res["error"]}

        created_count = 0
        errors = []
        for item in diff_res["missing_in_vault"]:
            rec = self._find_record(item["row_id"], "MASTER")
            if rec:
                c_res = self.obsidian_bridge.create_church_note(target_path, rec)
                if c_res["success"]:
                    created_count += 1
                else:
                    errors.append(f"{rec.church_name}: {c_res['error']}")

        return {
            "success": True,
            "data": {"created_count": created_count, "errors": errors},
            "error": None,
        }

    def import_obsidian_church(
        self, church_name: str, vault_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """옵시디언 전용 교회를 엑셀 마스터 레코드 목록에 신규 행으로 가져오기 (Gap-fill)."""
        target_path = vault_path or self.obsidian_vault_path
        new_row_id = (max([r.row_id for r in self.master_records], default=0)) + 1
        new_record = self.obsidian_bridge.import_obsidian_to_excel(
            target_path, church_name, new_row_id
        )
        if not new_record:
            return {"success": False, "data": None, "error": f"노트를 찾을 수 없습니다: {church_name}"}

        self.master_records.append(new_record)
        return {
            "success": True,
            "data": {"record": new_record.to_dict(), "total_master_count": len(self.master_records)},
            "error": None,
        }

    # --- Phase 4.5: Church114 Orthodox Engine & Map Hierarchy IPC API ---

    def get_church114_analytics(
        self,
        sido: Optional[str] = None,
        sigungu: Optional[str] = None,
        eupmyeondong: Optional[str] = None,
    ) -> Dict[str, Any]:
        """교회114 정통교단 계층형 교세 분석 및 밀도 단계구분도 데이터 산출."""
        try:
            data = self.church114_engine.get_hierarchy_analytics(sido, sigungu, eupmyeondong)
            return {"success": True, "data": data, "error": None}
        except Exception as e:
            return {"success": False, "data": None, "error": str(e)}

    def get_church114_top10(
        self,
        sido: Optional[str] = None,
        sigungu: Optional[str] = None,
        eupmyeondong: Optional[str] = None,
    ) -> Dict[str, Any]:
        """해당 지역의 성도 수 상위 TOP 10 랭킹 (모든 핵심 지표 포함)."""
        try:
            top10 = self.church114_engine.get_top10_churches(sido, sigungu, eupmyeondong)
            return {"success": True, "data": top10, "error": None}
        except Exception as e:
            return {"success": False, "data": [], "error": str(e)}

    def get_church114_grid(
        self,
        sido: Optional[str] = None,
        sigungu: Optional[str] = None,
        eupmyeondong: Optional[str] = None,
        denomination: Optional[str] = None,
        scale: Optional[str] = None,
        keyword: Optional[str] = None,
    ) -> Dict[str, Any]:
        """지역 상세 페이지용 전체 교회 목록 그리드 데이터 반환."""
        try:
            churches = self.church114_engine.get_church_grid_list(
                sido, sigungu, eupmyeondong, denomination, scale, keyword
            )
            return {"success": True, "data": churches, "error": None}
        except Exception as e:
            return {"success": False, "data": [], "error": str(e)}

    def refresh_church114_from_portal(
        self,
        region_query: str,
        api_provider: str = "KAKAO",
        api_key: str = "",
    ) -> Dict[str, Any]:
        """사용자 API Key를 사용하여 특정 지역 최신 교세 데이터 재조사 & 갱신."""
        try:
            res = self.church114_engine.enrich_from_portal_api(
                region_query, api_provider, api_key
            )
            return res
        except Exception as e:
            return {"success": False, "count": 0, "error": str(e)}

    def fetch_church114_from_web(
        self, region_query: str = "전국"
    ) -> Dict[str, Any]:
        """API Key 없이도 인터넷(교회114 공개 웹/정통교단 목록)에서 교회를 수집하여 적재."""
        try:
            return self.church114_engine.fetch_orthodox_churches_from_web(region_query)
        except Exception as e:
            return {"success": False, "count": 0, "error": str(e)}

    def import_church114_file(
        self, file_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """사용자가 보유한 엑셀(.xlsx) 또는 CSV 파일에서 교세 분석 데이터를 임포트."""
        try:
            if not file_path:
                file_types = ("엑셀/CSV 파일 (*.xlsx;*.csv)", "모든 파일 (*.*)")
                result = self._open_file_dialog(file_types)
                if not result:
                    return {"success": False, "count": 0, "error": "파일 선택이 취소되었습니다."}
                file_path = result

            return self.church114_engine.import_churches_from_file(file_path)
        except Exception as e:
            return {"success": False, "count": 0, "error": str(e)}

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

