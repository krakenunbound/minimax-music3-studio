from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_ROOT = Path(os.environ.get("MINIMAX_MUSIC3_MODEL_ROOT", ROOT / "models")).expanduser()
ENGINE_ROOT = ROOT / "python" / "vendor" / "ComfyUI"
WORKER_PYTHON = Path(
    os.environ.get("MINIMAX_MUSIC3_WORKER_PYTHON", ROOT / "python" / "runtime" / "Scripts" / "python.exe")
).expanduser()
OUTPUTS_ROOT = ROOT / "outputs"
LIBRARY_ROOT = OUTPUTS_ROOT / "library"
LOGS_ROOT = OUTPUTS_ROOT / "logs"
SIDECAR_HOST = "127.0.0.1"
SIDECAR_PORT = 7784
