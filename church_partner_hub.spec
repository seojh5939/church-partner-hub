# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller packaging specification for church-partner-hub.

Bundles HTML/CSS/JS frontend assets, pywebview backend, openpyxl excel engine,
and pure-python analytics & obsidian sync engines into a single standalone portable Windows executable.
"""

import sys
from pathlib import Path

block_cipher = None

project_root = Path.cwd().resolve()
ui_dir = project_root / "src" / "ui"

# Bundled static assets
datas = [
    (str(ui_dir), "ui"),
    (str(ui_dir), "src/ui"),
]

# Hidden imports required by pywebview (Windows forms / WebView2) & openpyxl
hiddenimports = [
    "clr",
    "webview",
    "webview.platforms.winforms",
    "webview.platforms.edgechromium",
    "openpyxl",
    "openpyxl.cell",
    "openpyxl.styles",
    "openpyxl.reader.excel",
    "openpyxl.writer.excel",
]

# Exclude unnecessary heavy packages to minimize executable size
excludes = [
    "tkinter",
    "unittest",
    "pytest",
    "IPython",
    "jupyter",
    "matplotlib",
    "numpy",
    "scipy",
    "pandas",
]

a = Analysis(
    ["src/main.py"],
    pathex=[str(project_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(
    a.pure,
    a.zipped_data,
    cipher=block_cipher,
)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="church-partner-hub",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # Desktop GUI mode without console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
