"""Install the pinned private inference source used by MiniMaxM3."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "python" / "vendor" / "ComfyUI"
REPOSITORY = "https://github.com/Comfy-Org/ComfyUI.git"
REVISION = "8f37cf8c833a8f2d3c62e2adbccebfd165623481"


def run(*args: str) -> None:
    subprocess.run(args, check=True, cwd=ROOT)


def main() -> int:
    if (DESTINATION / "comfy" / "sd.py").is_file():
        print(f"Pinned Music 3 engine is already present at {DESTINATION}")
        return 0
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    temporary = DESTINATION.parent / "ComfyUI.installing"
    if temporary.exists():
        shutil.rmtree(temporary)
    run("git", "clone", "--filter=blob:none", "--no-checkout", REPOSITORY, str(temporary))
    run("git", "-C", str(temporary), "checkout", REVISION)
    shutil.rmtree(temporary / ".git")
    temporary.rename(DESTINATION)
    print(f"Pinned Music 3 engine ready at {DESTINATION}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
