"""church-partner-hub: Desktop Application Entry Point (pywebview runner)."""

import os
import sys
from pathlib import Path

# Windows 콘솔 및 CI 환경 UTF-8 인코딩 보장
if sys.platform == "win32":
    try:
        if sys.stdout and hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if sys.stderr and hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.bridge import ChurchBridge


def get_ui_path() -> str:
    """PyInstaller 번들링 환경 및 로컬 개발 환경 모두에서 ui/index.html 경로 해결."""
    if hasattr(sys, "_MEIPASS"):
        # PyInstaller 번들 실행 환경
        base_path = Path(sys._MEIPASS)  # type: ignore
        ui_path = base_path / "ui" / "index.html"
        if not ui_path.exists():
            ui_path = base_path / "src" / "ui" / "index.html"
    else:
        # 로컬 개발 환경
        ui_path = PROJECT_ROOT / "src" / "ui" / "index.html"

    return str(ui_path.resolve())


def main() -> None:
    """데스크톱 앱 실행."""
    # Smoke-test CLI 모드 지원 (CI 또는 테스트 환경용)
    if "--smoke-test" in sys.argv:
        print("[Smoke-Test] Initializing ChurchBridge and Core Engines...")
        bridge = ChurchBridge()
        state = bridge.get_initial_state()
        assert state["success"] is True
        print(f"[Smoke-Test] Successfully loaded {len(state['data']['master_records'])} master records.")
        print(f"[Smoke-Test] UI Entrypoint verified at: {get_ui_path()}")

        # Phase 2 component smoke test
        search_res = bridge.quick_search("ㄱㅈㅅ")
        assert search_res["success"] is True
        assert len(search_res["data"]["results"]) == 1
        c_name = search_res["data"]["results"][0]["church_name"]
        print(f"[Smoke-Test] DispatchManager Chosung Search verified: found '{c_name}'.")

        # Phase 3 component smoke test (Grounding & Cascading Uncertainty)
        addr_res = bridge.search_address(2, mode="MASTER")
        assert addr_res["success"] is True and len(addr_res["data"]["candidates"]) > 0
        print(f"[Smoke-Test] AddressGrounder verified: {len(addr_res['data']['candidates'])} candidates found.")

        hp_res = bridge.search_homepage(2, mode="MASTER")
        assert hp_res["success"] is True
        cand = hp_res["data"]["candidate"]
        assert cand["is_dependent_uncertain"] is True and cand["confidence_level"] == "LOW"
        print("[Smoke-Test] HomepageGrounder & Cascading Uncertainty policy verified.")

        # Phase 4 component smoke test (AnalyticsEngine, Crosstab & Drilldown)
        analytics_res = bridge.get_analytics()
        assert analytics_res["success"] is True
        analytics_data = analytics_res["data"]
        assert analytics_data["summary"]["total_churches"] == len(state["data"]["master_records"])
        assert "crosstab" in analytics_data
        assert analytics_data["crosstab"]["grand_total"] == len(state["data"]["master_records"])
        assert len(analytics_data["denomination_distribution"]) > 0
        assert len(analytics_data["scale_distribution"]) == 6

        # Phase 4 Drill-down verification
        drilldown_res = bridge.get_analytics(denomination_filter="예장합동")
        assert drilldown_res["success"] is True
        assert drilldown_res["data"]["drilldown_count"] > 0
        assert all(c["denomination"] == "예장합동" for c in drilldown_res["data"]["churches"])
        print(f"[Smoke-Test] AnalyticsEngine & Drilldown verified: {analytics_data['summary']['total_churches']} churches, {len(analytics_data['crosstab']['rows'])} denominations.")

        # Phase 5 component smoke test (ObsidianBridge Smart Sync)
        import tempfile
        with tempfile.TemporaryDirectory() as temp_vault:
            t_path = Path(temp_vault)
            (t_path / "90. Templates").mkdir(parents=True, exist_ok=True)
            (t_path / "20. Churches").mkdir(parents=True, exist_ok=True)
            (t_path / "90. Templates" / "Template - Church (교회_조직).md").write_text(
                "---\ntype: church\npastor: ''\n---\n# {{title}}\n\n## 🏢 개요\n",
                encoding="utf-8",
            )
            obs_status = bridge.check_obsidian_status(temp_vault)
            assert obs_status["success"] is True and obs_status["data"]["valid"] is True

            # Create note test
            note_res = bridge.create_obsidian_note(1, vault_path=temp_vault)
            assert note_res["success"] is True
            assert Path(note_res["data"]["file_path"]).exists()

            # Diff test
            diff_res = bridge.diff_obsidian(temp_vault)
            assert diff_res["success"] is True
            assert diff_res["data"]["in_sync_count"] >= 1
            print(f"[Smoke-Test] ObsidianBridge verified: created note '{note_res['data']['church_name']}', link='{note_res['data']['obsidian_link']}'.")

        print("[Smoke-Test] All Phase 1, 2, 3, 4 & 5 components operational.")
        return

    import webview  # type: ignore

    ui_file = get_ui_path()
    bridge_api = ChurchBridge()

    window = webview.create_window(
        title="church-partner-hub (교회 파트너십 허브)",
        url=f"file:///{ui_file.replace(os.sep, '/')}",
        js_api=bridge_api,
        width=1280,
        height=840,
        min_size=(980, 640),
        text_select=True,
    )

    webview.start(debug=False)


if __name__ == "__main__":
    main()
