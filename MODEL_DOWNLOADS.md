# Model downloads

## Lyrics synchronization

Run `Setup Lyrics Sync.bat`. It installs WhisperX in `python/lyrics_runtime` and keeps downloaded speech/alignment weights in `models/lyrics`. These files are optional: song generation and playback remain available without them, while **Sync lyrics** stays disabled until the runtime is installed.

MiniMax Music 3 Studio is standalone. It reads models only from its own `models` folder and never reaches into ComfyUI, KAS, or another installation.

## Music 3 models

Download the optimized files from [Comfy-Org/MiniMax-Music-3](https://huggingface.co/Comfy-Org/MiniMax-Music-3) and place them at:

```text
models/
├── diffusion_models/minimax_music3_dit_int8_convrot.safetensors
├── text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors
└── vae/minimax_music3_dav.safetensors
```

## Optional automatic cover-art model

Download **Juggernaut Aftermath** from [Civitai model version 127207](https://civitai.com/models/46422/juggernaut?modelVersionId=127207), keep the exact filename, and place it at:

```text
models/cover_art/juggernaut_aftermath.safetensors
```

If this optional file is missing, song generation remains available and automatic cover art is disabled. The System panel reports the missing model and its required location.

## Optional stem-extraction model

Stem extraction uses the standard Demucs **htdemucs** model locally on the GPU. Put these files at:

```text
models/stems/955717e8-8726e21a.th
models/stems/htdemucs.yaml
```

When either file or the Demucs runtime is missing, **Extract stems** is disabled and the System panel shows the required folder. MP3 and FLAC conversion do not require this model.

## Optional local sound-effects model

Accept the publisher's gated license and download the complete **Stable Audio 3 Small SFX** snapshot from [Stability AI](https://huggingface.co/stabilityai/stable-audio-3-small-sfx). Keep the prompt encoder inside its original subfolder:

```text
models/sound_effects/stable-audio-3-small-sfx/model.safetensors
models/sound_effects/stable-audio-3-small-sfx/model_config.json
models/sound_effects/stable-audio-3-small-sfx/t5gemma-b-b-ul2/config.json
models/sound_effects/stable-audio-3-small-sfx/t5gemma-b-b-ul2/model.safetensors
models/sound_effects/stable-audio-3-small-sfx/t5gemma-b-b-ul2/special_tokens_map.json
models/sound_effects/stable-audio-3-small-sfx/t5gemma-b-b-ul2/tokenizer.json
models/sound_effects/stable-audio-3-small-sfx/t5gemma-b-b-ul2/tokenizer.model
models/sound_effects/stable-audio-3-small-sfx/t5gemma-b-b-ul2/tokenizer_config.json
```

The small files `generation_config.json`, `README.md`, and `.gitattributes` in that subfolder are safe to keep but are not required at runtime. Then run `Setup Sound Effects.bat` once. It creates a separate CPU-only runtime under `python/sfx_runtime`. The top-level **Effects** page and **Studio → Add track → Generate a sound** remain disabled until the complete local model and runtime are present. Generated originals are stored in `outputs/effects/`; adding one to Studio copies it into that song without creating an item in Songs. Effects run in a short-lived CPU process, so the Music 3 checkpoint can remain loaded on the GPU and the sound model's memory is reclaimed after every result. Generation is forced into offline mode; the app does not fetch missing prompt-encoder files in the background.

## MP3 and FLAC exporter

`Setup MiniMax Music 3.bat` installs a private FFmpeg binary through the pinned `imageio-ffmpeg` Python package. A system-wide FFmpeg installation is not required. If exports are unavailable, rerun Setup so the private sidecar environment receives the exporter.
