# MiniMax Music 3 model sources

Use original publisher sources. Do not download model files from anonymous mirrors.

| Item | Official source | Local destination |
|---|---|---|
| Optimized standalone Music 3 checkpoints used by this app | https://huggingface.co/Comfy-Org/MiniMax-Music-3 | the three exact paths shown below |
| Original full MiniMax Music 3 release | https://huggingface.co/MiniMaxAI/MiniMax-Music3 | reference only; this app does not load the original 53.2 GiB layout |
| Reference implementation and prompts | https://github.com/MiniMax-AI/MiniMax-Music3 | documentation/reference only |
| Current serving runtime | https://github.com/sgl-project/sglang-omni | separate inference environment or host |
| Official examples | https://minimax-ai.github.io/music3-demo/ | listen in browser; not required by the app |
| Optional local lyric aligner | https://github.com/m-bain/whisperX | installed by `Setup Lyrics Sync.bat` into `python/lyrics_runtime` |
| Whisper transcription weights | https://huggingface.co/Systran/faster-whisper-large-v3-turbo | downloaded on first lyric sync into `models/lyrics` |
| Optional sound-effect generator | https://huggingface.co/stabilityai/stable-audio-3-small-sfx | `models/sound_effects/stable-audio-3-small-sfx/` |
| Stable Audio 3 inference source | https://github.com/Stability-AI/stable-audio-3 | pinned to commit `a0b57f5483c4588f827f3552b7d5c6ca2a9687be` by `Setup Sound Effects.bat` |

The standalone studio loads only this approximately 11.1 GiB optimized layout:

```text
models/
├── diffusion_models/minimax_music3_dit_int8_convrot.safetensors
├── text_encoders/minimax_music3_text_encoder_pruned_int8_convrot.safetensors
└── vae/minimax_music3_dav.safetensors
```

The original publisher snapshot was approximately 53.2 GiB when inspected on August 13, 2026. It is useful as a reference but is not compatible with the three-file loader in this application.

Lyric synchronization is optional and fully local. The app pins WhisperX 3.8.4 because the withdrawn 3.8.2 build can omit word timestamps for digits and symbols. This matters for lyrics containing countdowns such as “4, 3, 2, 1.”

Stable Audio 3 Small SFX is optional and gated. Users must accept the Stability AI Community License and Gemma Terms before downloading it. The application does not redistribute those weights. Download both the top-level checkpoint and the repository's `t5gemma-b-b-ul2` prompt-encoder folder into the same local model tree described in `MODEL_DOWNLOADS.md`. Its 44.1 kHz stereo output matches the Music 3 Studio timeline without a sample-rate conversion step.
