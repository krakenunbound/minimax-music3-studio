# MiniMax Music 3 Studio

The song action menu opens a native MiniMax multitrack Studio built around the app's local Demucs stems. It is the only editor shipped with the project: the older disconnected browser editor has been removed.

A standalone Windows music-production app for the open-weight [MiniMax Music 3](https://huggingface.co/MiniMaxAI/MiniMax-Music3) model.

The design and process-management pattern are adapted from the local MiniMax H3 Studio project, while the workflow follows Kraken Audio Studio: separate music description and lyrics, instrumental mode, queued generation, cancellation, logs, a local song library, and WAV playback.

## Current status

- Tauri 2 / Rust desktop host is implemented.
- The Rust host owns the Python sidecar and kills its complete process tree when the desktop app closes.
- The Python sidecar owns a hidden local GPU worker, queues jobs, reports progress, supports cancellation, saves WAV/JSON results, creates local SD 1.5 cover art, converts MP3/FLAC, extracts Demucs stems, and serves the local library.

Song actions are available from each song's `…` menu: edit details, regenerate its cover with optional visual direction, open Studio, extract two or four stems, reuse the prompt, and download WAV, MP3, or FLAC. MP3 exports use LAME V0 variable bitrate (`-q:a 0`, commonly about 220–260 kbps depending on the music); FLAC exports are lossless at compression level 8. Both formats embed the saved title, artist, album, genre, year, track number, description/comment, and cover artwork when present. Songs that already have stems also display a small cover-derived **Stems** branch badge: expand it to see the available parts, then choose **Move stems to Studio**.
- The React interface is implemented in the MiniMax H3 deep-sea theme.
- The worker uses the optimized INT8 Music 3 checkpoints and dynamic layer offloading for a single RTX 3090.
- Low-memory tiled audio decoding is enabled by default.
- There is no ComfyUI process, API connection, browser page, workflow graph, or shared model directory.

The implementation follows the same architecture as MiniMax H3 Studio: Tauri supervises the sidecar, the sidecar supervises an isolated resident GPU worker, and closing the app kills the complete process tree. The low-memory worker uses a pinned upstream implementation as a Python library, not as an application or server.

## Model installation

Run:

```text
Setup MiniMax Music 3.bat
```

Setup fetches the pinned inference source, creates a private CUDA Python runtime, and downloads only the three optimized files from [Comfy-Org/MiniMax-Music-3](https://huggingface.co/Comfy-Org/MiniMax-Music-3), approximately 11.1 GiB total:

Setup also installs a private FFmpeg binary through `imageio-ffmpeg`; MP3 and FLAC exports therefore work on a clean Windows installation without a separate system FFmpeg setup.

Expected key components:

```text
models\
├── diffusion_models\
│   └── minimax_music3_dit_int8_convrot.safetensors
├── text_encoders\
│   └── minimax_music3_text_encoder_pruned_int8_convrot.safetensors
└── vae\
    └── minimax_music3_dav.safetensors
```

You can set `MINIMAX_MUSIC3_MODEL_ROOT` to another folder containing those same three subdirectories. Models are never copied into source control.

## Standalone inference

MiniMaxM3 does not connect to ComfyUI or SGLang. The pinned implementation is imported as source by the private `python/runtime` process and driven directly by `python/music3_worker.py`. It performs:

- caption and tagged-lyrics tokenization;
- autoregressive musical structure/acoustic generation;
- 30-step flow-matching diffusion;
- tiled DAV stereo decoding;
- local PCM WAV saving.

Cancel immediately terminates the isolated worker. **Clear VRAM and Cache** is available when the queue is idle. Exiting the desktop app terminates the sidecar and every child worker.

## Timed lyrics and translation

Run `Setup Lyrics Sync.bat` once to install the optional local WhisperX alignment runtime. The aligner force-matches the exact saved lyrics against the finished WAV on the GPU and stores word timings under each song's `lyrics_sync` folder. English translation is saved separately for display only and is never sent back into Music 3's sung lyric input. Language and alignment models download into `models/lyrics` on first use.

To use it, choose the lyric language while creating or editing a song, optionally paste one English line for each sung line, then open the song's **…** menu and select **Sync lyrics**. Playback gains a scrolling lyric panel: the current line stays centered, completed words turn white, the word being sung glows cyan, and the English line appears underneath. The **Lyrics** playback toggle fully collapses or restores that panel and remembers the preference across songs. Re-sync after changing sung words; translation-only edits update immediately without rerunning alignment.

## Multitrack Studio

Choose **Studio** from a song's `…` menu, or expand its **Stems** badge and choose **Move stems to Studio**. If the song has no separated parts yet, the app queues a local four-stem Demucs split and fills the timeline when it finishes.

Studio treats the song as one synchronized document:

- the original full mix is preserved as a reference lane and is never doubled with the stems;
- Vocals, Drums, Bass, and **Other · guitars, keys, synths and FX** appear as honest source-separated lanes;
- each stem has Mute, Solo, and Volume controls plus a shared playhead and waveform;
- the selected lane has an in-app spectrum analyzer, so Tauri never needs browser popup permission;
- **Save session** stores the mixer state in the song's `song.json`;
- **Export custom mix**, **Instrumental**, and **Acapella** create new named WAV files in the song's `mixes` folder without replacing `song.wav`.
- The top-level **Effects** page is a separate Stable Audio 3 Small SFX library with generation presets, custom positive and negative prompting, playback, WAV download, deletion, and **Add to Studio**. Saved effects live under `outputs/effects/` and never appear as songs.
- **Add track** accepts any number of local audio files or opens the same optional Stable Audio generator. Sounds created from Studio are saved in Effects as reusable originals and copied into the current song at the playhead as editable lanes.

Optional sound generation uses its own short-lived CPU process. Run `Setup Sound Effects.bat` after placing the gated checkpoint, configuration, and `t5gemma-b-b-ul2` prompt-encoder folder in `models/sound_effects/stable-audio-3-small-sfx/` as shown in `MODEL_DOWNLOADS.md`. This deliberately leaves Music 3 resident on the RTX GPU and releases the sound model's CPU memory as soon as each effect is saved.

Demucs separation can contain bleed, especially around vocals and cymbals. The Studio labels these lanes as separated from the generated mix; it does not claim they are original recording multitracks.

## Development setup

```powershell
py -3.11 -m venv python\venv
python\venv\Scripts\python.exe -m pip install -r python\requirements.txt
npm install
npm run tauri dev
```

For actual generation, use the Setup script so the separate CUDA runtime and model files are installed correctly.

Use only one development instance at a time. The app uses port `7784`; MiniMax H3 Studio continues to use `7783`.

## License note

The application code in this folder does not redistribute MiniMax weights. MiniMax Music 3 uses the MiniMax-Music3 Community License. Review the official license before distributing or commercializing a product. Among other terms, commercial products must prominently display “MiniMax-Music3,” and additional authorization is required above the license's stated revenue threshold.
