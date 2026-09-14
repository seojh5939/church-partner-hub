"""church-partner-hub: Desktop Application Entry Point (pywebview runner)."""

import os
import sys
from pathlib import Path

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
        print(f"[Smoke-Test] DispatchManager Chosung Search verified ('ㄱㅈㅅ' -> {search_res['data']['results'][0]['church_name']}).")

        print("[Smoke-Test] All Phase 1 & 2 components operational.")
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
