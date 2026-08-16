"""Download only the three optimized checkpoints used by MiniMaxM3."""
from __future__ import annotations

from pathlib import Path

from huggingface_hub import hf_hub_download

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"
REPO = "Comfy-Org/MiniMax-Music-3"
FILES = (
    "diffusion_models/minimax_music3_dit_int8_convrot.safetensors",
    "text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors",
    "vae/minimax_music3_dav.safetensors",
)


def main() -> int:
    MODELS.mkdir(parents=True, exist_ok=True)
    for index, filename in enumerate(FILES, 1):
        print(f"[{index}/{len(FILES)}] {filename}", flush=True)
        hf_hub_download(REPO, filename=filename, local_dir=MODELS)
    print(f"Music 3 models ready in {MODELS}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
