"""Build script for church-partner-hub portable executable using PyInstaller."""

import os
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    print("=" * 60)
    print("church-partner-hub: Windows Portable Executable Builder")
    print("=" * 60)

    spec_file = PROJECT_ROOT / "church_partner_hub.spec"
    if not spec_file.exists():
        print(f"[Error] Spec file not found at: {spec_file}")
        return 1

    # Check PyInstaller availability
    try:
        import PyInstaller  # type: ignore
        print(f"[Info] Found PyInstaller version: {PyInstaller.__version__}")
    except ImportError:
        print("[Error] PyInstaller is not installed. Please install it with: pip install pyinstaller")
        return 1

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        str(spec_file),
        "--noconfirm",
        "--clean",
    ]

    print(f"[Build] Running command: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(PROJECT_ROOT))
    if result.returncode != 0:
        print(f"[Error] Build failed with exit code: {result.returncode}")
        return result.returncode

    dist_exe = PROJECT_ROOT / "dist" / "church-partner-hub.exe"
    if dist_exe.exists():
        size_mb = dist_exe.stat().st_size / (1024 * 1024)
        print("=" * 60)
        print(f"[Success] Build completed successfully!")
        print(f"[Output] Executable: {dist_exe}")
        print(f"[Size] File Size: {size_mb:.2f} MB")
        print("=" * 60)
        return 0
    else:
        print(f"[Warning] Build finished but {dist_exe} was not found.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
