# MiniMax Music 3 Studio — bug list

## Repair progress

Work started 2026-08-13. Items are marked complete only after a focused regression test passes.

- [x] 1. Preserve official Pre-Chorus / Post-Chorus tags
- [x] 2. Accept official structured caption headings without double-wrapping
- [x] 3. Enforce the 5,000-token prompt limit before expensive generation
- [x] 4. Make cancellation immediate during worker startup
- [x] 5. Remove failed and cancelled library folders
- [x] 6. Restore active jobs and keep concurrent task progress separate
- [x] 7. Show generation progress on Create
- [x] 8. Make Instrumental mode rewrite vocal conditioning
- [x] 9. Make vocal gender and exclusions always affect conditioning
- [x] 10. Restore Music 3 reference CFG default
- [x] 11. Build cover prompts from real description content
- [x] 12. Stop rejecting quiet valid songs
- [x] 13. Preserve titled filenames for downloads
- [x] 14. Recover logs after a sidecar restart
- [x] 15. Correct model download/layout documentation
- [x] 16. Install or clearly document FFmpeg for exports
- [x] 17. Restore all reusable generation settings
- [x] 18. Safely ignore malformed progress lines
- [x] 19. Move performance directions out of the lyric token stream
- [x] 20. Do not auto-select the newest song in Details
- [x] 21. Surface initial and watchdog sidecar spawn failures
- [x] 22. Add official hyphenated-tag regression coverage
- [x] 23. Recognize the payload-free worker completion signal
- [x] 24. Add GPU word-level lyric synchronization without duplicate render layers
- [x] 25. Invalidate stale timings when saved lyrics change
- [x] 26. Preserve translation-only edits without rerunning alignment
- [x] 27. Replace the disconnected AudioMass iframe with a native stem-aware Studio
- [x] 28. Load existing Demucs stems as synchronized editable lanes
- [x] 29. Add mute, solo, per-lane level, shared transport, and persistent sessions
- [x] 30. Keep the spectrum analyzer inside the app without popup permission
- [x] 31. Export custom, instrumental, and acapella WAV mixes back into the song folder
- [x] 32. Add larger cover-led song cards and an expandable cover-derived stem branch
- [x] 33. Add a remembered playback toggle that fully collapses synchronized lyrics
- [x] 34. Stop highlighting upcoming lyric lines early during instrumental gaps
- [x] 35. Replace the broken More Options arrow glyph with a proper animated control
- [x] 36. Return generation progress to the top and stop translation fields overlapping it
- [x] 37. Show live elapsed runtime beside every remaining-time prediction
- [x] 38. Stop Studio spectrum startup from crashing the whole interface when the captured media stream has no audio track
- [x] 39. Contain future Studio rendering failures inside a recoverable Studio panel instead of showing a blank application
- [x] 40. Add waveform range selection with optional loop playback
- [x] 41. Add non-destructive song trimming and selected-lane silence ranges
- [x] 42. Add song-wide fade-in and fade-out editing
- [x] 43. Import unlimited local audio lanes at the current playhead
- [x] 44. Add undo and redo for Studio edits
- [x] 45. Export only the selected timeline range when requested
- [x] 46. Make exported WAV mixes honor offsets, trims, fades, silent ranges, gain, mute, and solo
- [x] 47. Preserve the original song when adding audio before stem extraction
- [x] 48. Remove Studio-imported lanes without touching the user's source file
- [x] 49. Let waveform selections target This lane or All lanes
- [x] 50. Add region mute, quieter, and louder edits for exact passages
- [x] 51. Add adjustable echo and reverb regions
- [x] 52. Add automatic leveling, normalization, clarity EQ, and compression regions
- [x] 53. Preview region effects during playback and bake them into saved Studio WAV mixes
- [x] 54. Replace maximum-frame ETA extrapolation with phase-aware estimates that learn from successful local runs
- [x] 55. Remove the retired AudioMass bundle and unused browser-editor route now that native Studio supersedes it
- [x] 56. Add optional Stable Audio 3 Small SFX generation as a native Studio track source
- [x] 57. Add a separately branded Stable Audio Effects page and reusable effect library without polluting Songs
- [x] 58. Replace the flat song action list with a working-actions-only menu and nested WAV/MP3/FLAC download submenu
- [x] 59. Embed editable song metadata and cover art in MP3/FLAC exports and confirm downloads in-app
- [x] 60. Bring cover preview, upload, and AI regeneration into Edit Song Details
- [x] 61. Move song actions into a viewport-aware side pop-out that flips at the window edge
- [x] 62. Add persistent playlists with reusable song membership and in-menu assignment
- [x] 63. Replace Songs with a Library organized into My Songs, Playlists, Workspaces, and Studio Projects
- [x] 64. Add exclusive persistent workspaces with My Workspace as the safe default home
- [x] 65. Restore a native Video Studio with 16:9/9:16 visualizers, particles, backgrounds, karaoke lyrics, saved frames, and local MP4 rendering
- [x] 66. Stop reopening the desktop app from adopting a stale, incompatible Music 3 sidecar
- [x] 67. Prevent the watchdog from restarting a healthy server during long GPU generation
- [x] 68. Normalize smart quotes that crash the bundled Music 3 tokenizer and return useful prompt-preparation errors

### Final validation

- 88 focused MiniMaxM3 backend and contract regression tests passed for the repaired generation, library, lyric, stem, Studio, timing, and process-encoding paths.
- The production React interface compiled successfully.
- The expanded Studio was visually verified at desktop size with real library stems; its transport, compact edit strip, range-state affordances, larger timeline, inspector, and quick exports rendered without overlap.
- Rust/Tauri checks and the release application build completed successfully.
- MP3 export was verified with real FFmpeg output: LAME V0 audio, ID3 metadata, and a front-cover stream marked `attached_pic`; the focused Studio suite remains passing after metadata, cover-upload, playlist, workspace, Video Studio, and desktop-sidecar lifecycle changes.
- Desktop startup now retires orphaned MiniMaxM3 Python servers, requires the matching health-protocol version, and owns the replacement process. The watchdog now trusts the owned process handle while Music 3 is generating instead of mistaking a delayed HTTP health response for a crash and destroying an unsaved song.
- Windows child-process pipes are forced to UTF-8. A real packaged-path vocal smoke test containing smart quotes, apostrophes, and a bracketed performance direction completed through Music 3, WAV save, and automatic cover art; the original Unicode remains intact in saved metadata.
- Video Studio was visually checked with a real saved song, cover art, and 16 synchronized lyric lines. Landscape/portrait switching produced the correct 1280×720 and 720×1280 canvases, and a real WebM-to-H.264/AAC MP4 smoke render passed through the app's local FFmpeg endpoint.
- Exact Music 3 prompt-token counting was verified against the bundled tokenizer without loading the model or GPU.
- No full song generation was run during validation; model-quality checks remain user-listening tests.
- A post-repair live generation exposed and verified the worker completion-handshake fix. “Neon Undertow” completed as a valid 74.99-second, 44.1 kHz stereo WAV with automatic cover art and was restored to the library.
- A second live run passed through the repaired handshake normally: “Neon Undertow (Full Length)” completed at 209.99 seconds with its deterministic seed, complete metadata, and automatic cover art.
- The optional WhisperX 3.8.4 CUDA runtime completed a live forced-alignment pass on “Neon Undertow”: 18 lyric lines and 81 individual words were timed against the 74.99-second WAV. The runtime and its downloaded weights remained inside the MiniMaxM3 project.
- A real local FFmpeg smoke test mixed two generated WAV lanes through the Studio bounce path and produced a valid named custom-mix WAV; this was not only a mocked command test.
- The complete gated Stable Audio 3 Small SFX snapshot was moved into the documented app-local model tree. A real offline CPU pass produced a peak-normalized 4.00-second, stereo 44.1 kHz car-pass WAV; Music 3 was not unloaded and the short-lived sound worker exited normally. The Effects library/storage split and copy-to-Studio path are covered by automated tests.

The findings below came from the original read-only audit against official MiniMax Music 3 behavior (Hugging Face model card, ComfyUI tutorial, MiniMax Music Generation API, and the vendor copy of `comfy/ldm/minimax_music`). The repair checklist above now tracks implementation and validation.

**What this app is supposed to do:** a standalone Windows studio for the open-weight MiniMax Music 3 model. The user writes a music description (ideally a structured caption: Global Metadata / Vocal Details / Arrangement) plus tagged lyrics. The local worker should tokenize those two inputs, run the hierarchical AR + 30-step flow-matching path, and save a stereo WAV (this Comfy-Org/DAV pipeline is 44.1 kHz, not the original 32 kHz checkpoint). Official lyric section tags are `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Post-Chorus]`, `[Bridge]`, `[Instrumental]`, `[Solo]`, `[Outro]`. The tokenized prompt is hard-capped at 5,000 tokens. The model may end a song before `max_duration` when it emits an end token.

---

## Critical — wrong Music 3 input

### 1. Official `[Pre-Chorus]` / `[Post-Chorus]` tags are stripped from the lyric stream

**Expected:** Those hyphenated tags are first-class Music 3 structure. ComfyUI and the model card list them as the way to control song form. They must remain in the lyrics as their own lines.

**Actual:** `prepare_music3_lyrics()` only recognizes unhyphenated keys (`"pre chorus"`, `"prechorus"`, `"post chorus"`, `"postchorus"`). After `casefold()`, `[Pre-Chorus]` becomes `"pre-chorus"`, misses the table, and is treated as a verbose stage direction. The tag is **removed from the lyrics** and stuffed into the caption.

Worse, the UI’s “Prepare pasted lyrics” and the prompt-helper cheat sheet **emit** `[Pre-Chorus]` / `[Post-Chorus]`. Pasting `[Pre chorus]` (space) is rewritten to `[Pre-Chorus]` (hyphen), which the backend then deletes.

A second error: even if the hyphenated form were recognized, the backend maps post-chorus to `Chorus`, collapsing a distinct official section.

**Evidence:**

- `python/main.py` 94–112, 147–171 — lookup table and the “unrecognized tag → direction, drop from lyrics” fallback
- `src/App.tsx` 149–167 — frontend normalizer writes `[Pre-Chorus]` / `[Post-Chorus]`
- `src/App.tsx` 683 — helper advertises those official tags
- `outputs/library/20260813-181704_norse-test_fb8fc3/song.json` — a real song whose source lyrics contain `[Pre-Chorus – Female softer…]`; that tag never reached the model as a section boundary
- Official refs: [ComfyUI MiniMax Music 3](https://docs.comfy.org/tutorials/audio/minimax/minimax-music-3), [MiniMaxAI/MiniMax-Music3](https://huggingface.co/MiniMaxAI/MiniMax-Music3)

**Impact:** Verses bleed into what should be a pre-chorus; post-chorus hooks are not modeled. Structure control, the main reason Music 3 uses tagged lyrics, is broken for the two most common transitional sections.

---

### 2. Official structured captions are mis-detected and double-wrapped

**Expected:** A caption already in Music 3’s three-section form is sent through as the description. MiniMax’s own `music-caption-rewriter` skill writes markdown headings:

```text
### Global Metadata
### Vocal Details
### Arrangement
```

**Actual:** `createSong()` only treats a caption as structured if three lines match `^Global Metadata\s*$`, `^Vocal Details\s*$`, and `^Arrangement\s*$`. A colon (`Global Metadata:`), a markdown `###`, or extra wording fails the test. The entire pasted caption is then used as **both** genre and arrangement inside a new `buildStructuredCaption()` wrapper.

**Evidence:** `src/App.tsx` 406–408; official output contract in [music-caption-rewriter](https://github.com/MiniMax-AI/MiniMax-Music3/blob/main/skills/music-caption-rewriter/SKILL.md).

**Impact:** A correct official caption is duplicated, inflated, and distorted. That also makes bug 3 much more likely.

---

### 3. No guard for Music 3’s 5,000-token prompt limit

**Expected:** The fused caption+lyrics prompt must be ≤ 5,000 tokens. The AR encoder raises `ValueError` if it is over.

**Actual:** The API accepts `description` up to 12,000 characters and `lyrics` up to 24,000. The UI never counts tokens. The worker only fails after models are loaded, often many minutes in.

**Evidence:**

- `python/vendor/ComfyUI/comfy/ldm/minimax_music/ar.py` 20, 236–237 — `MAX_PROMPT_TOKENS = 5000`
- `python/main.py` 65–66 — oversized request fields
- Hugging Face limitations: “The tokenized text prompt is limited to 5,000 tokens.”

**Impact:** Long templates + full lyrics, or a double-wrapped official caption (bug 2), fail after the expensive load/AR start. The error is a raw exception, not a field-level warning.

---

## High — jobs, cancel, leftover files

### 4. Cancel deadlocks during worker startup

**Expected:** README: “Cancel immediately terminates the isolated worker.”

**Actual:** `generate()` holds `_LOCK` for the whole of `_start()`, which blocks until `MUSIC3_READY` (model load, can be minutes). `cancel()` → `unload()` needs the same lock, so it waits. The FastAPI cancel handler is sync, so the Cancel request hangs.

After `_start()` finally returns, the payload is written **before** the lock is released. A cancel that was waiting can therefore start a generation and only then kill it.

**Evidence:** `python/music3_engine.py` 86–118, 144–154, 206–210; `python/main.py` 318–325; README line 57.

**Impact:** First-song and post-cancel reloads ignore Cancel. The UI looks frozen. GPU work continues.

---

### 5. Failed or cancelled jobs leave orphan library folders

**Expected:** A failed/cancelled generate should not leave a half-written song directory, or the library should ignore *and* clean it.

**Actual:** `generate()` creates `LIBRARY_ROOT/{stamp}_{slug}_{id}` before the worker finishes. `song.json` is only written after `inspect_wav()` succeeds. Cancel, crash, or a “silent WAV” rejection leaves a folder behind. The library skips folders without `song.json`, so the debris is invisible but consumes disk.

**Evidence already on disk:**

- `outputs/library/20260813-142432_untitled-song_15d697/` — empty folder
- `outputs/library/20260813-162303_private-pulse_3866a2/` — `song.wav` only, no `song.json`

Code: `python/main.py` 224–234; `python/music3_engine.py` 157–181.

**Impact:** Repeated failures accumulate multi-hundred-MB WAVs the UI cannot see or delete.

---

### 6. Active jobs are not restored; a second generate can be queued over a live one

**Expected:** After a reload or sidecar blip, the running job should reappear and Create should stay locked.

**Actual:** Boot calls `getStatus()` / `getLibrary()` but never hydrates `job` from `status.jobs`. Create is disabled only from local React `job` state. Job poll failures are swallowed (`catch { /* retain current state */ }`), so a vanished job can also leave Create disabled forever.

Starting cover art or stems does `setJob(result.job)` and **replaces** the in-flight music job in the UI. Progress for the real generate disappears; Cancel then targets the new job.

**Evidence:** `src/App.tsx` 342–369, 394, 505–518, 594.

**Impact:** Users can stack a second generate behind a still-running one after F5, or lose all progress UI by opening Refine cover / Extract stems.

---

### 7. Create view has no progress; success is the first signal

**Expected:** A local studio should show phase, percent, and ETA on the screen that started the job.

**Actual:** Create only grows a Cancel button. The progress banner lives on the Songs page and in the JOB drawer, which is not opened automatically. The user is jumped to Songs only when the job succeeds.

**Evidence:** `src/App.tsx` 593–596 vs 603.

**Impact:** A 5-minute (or failed) run looks like a dead UI unless the user already knows about the JOB tab.

---

## High — generation controls do not do what they say

### 8. Instrumental checkbox does not rewrite a vocal caption

**Expected:** Official instrumental mode: `is_instrumental` / lyrics omitted or `[Instrumental]`, and the caption must say the piece is instrumental with a lead *instrument*. MiniMax’s rewriter: “Preserve an explicit instrumental request. Do not add vocals.”

**Actual:** Toggling Instrumental only hides the lyrics box and sends `lyrics=""` (worker then injects `[Instrumental]`). The description is left as-is, including “Singer A (Female)…” if a template was applied first.

The Lo-fi study beats template is written as instrumental (`voice: "Instrumental; no vocals…"`) but does **not** set the Instrumental checkbox, so default `[Verse]/[Chorus]` lyrics are still submitted against a “no vocals” caption.

**Evidence:** `src/App.tsx` 48, 264, 410, 573; `python/music3_engine.py` 191.

**Impact:** Instrumental requests still condition the AR on a sung vocalist. The inverse (lo-fi template + leftover lyric skeleton) fights itself.

---

### 9. Vocal gender and “Exclude styles” are often no-ops

**Expected:** Gender and exclusions should change what Music 3 is conditioned on.

**Actual:**

- `vocalGender` is only written into the caption when the unstructured-caption rewriter runs (`src/App.tsx` 399, 406–407). After a template or “Use this description”, changing Male/Female does nothing.
- Exclusions are spliced only onto a line matching `Embellishments, Textures & Spatial FX:`. Official or hand-written captions without that exact heading silently drop the field (`src/App.tsx` 409).

Music 3 has no negative-prompt channel (the UI says this correctly). The replacement path still has to land in the caption or the control is fiction.

---

### 10. Direction strength default is not Music 3’s CFG

**Expected:** Vendor / ComfyUI default `cfg_scale` is **1.5** (`CFG_SCALE` in `comfy/ldm/minimax_music/ar.py`).

**Actual:** The 50% slider maps to `1.1 + 0.5 * 1.2 = 1.7`. The Pydantic default is also 1.7.

**Evidence:** `src/App.tsx` 401; `python/main.py` 71; `python/vendor/ComfyUI/comfy/ldm/minimax_music/ar.py` 17.

**Impact:** Every “default” generate is more CFG-aggressive than the reference workflow. High CFG is known to trade natural phrasing for stiff adherence.

---

## Medium — library, playback, covers, stems

### 11. Automatic cover art ignores the real description

**Expected:** Cover prompt should use genre, mood, and imagery from the structured caption.

**Actual:** `cover_art.build_prompt()` takes `description.splitlines()[0]`. For every in-app caption that line is the heading `Global Metadata`. The SD prompt becomes roughly `professional square album cover, <title>, Global Metadata, …`.

**Evidence:** `python/cover_art.py` 33–43; any saved `song.json` (e.g. the Norse test).

**Impact:** Thumbnails are generic. “Refine cover” with a blank direction box has the same problem.

---

### 12. Quiet but valid songs can be discarded as “silent”

**Expected:** A finished WAV is a song. Ambient / lo-fi / sparse ritual mixes can be very quiet.

**Actual:** `inspect_wav()` rejects `peak < 32` or `rms < 8` (16-bit PCM). That is after the worker already wrote `song.wav`. The job fails and the folder becomes an orphan (bug 5).

**Evidence:** `python/music3_engine.py` 179–180. The Lo-fi and Nordic templates ask for restrained dynamics.

---

### 13. Download “title.wav” does not work from the Tauri UI

**Expected:** Download WAV/MP3/FLAC uses the song title.

**Actual:** The player is served from `http://127.0.0.1:7784` while the UI origin is the Tauri/Vite host. The HTML `download` attribute is ignored for cross-origin URLs. `FileResponse` names the file `song.wav` / `song.mp3` / `song.flac`.

**Evidence:** `src/App.tsx` 487–501; `python/main.py` 500–505, 412–421.

**Impact:** Every download overwrites the same generic filename in the user’s Downloads folder.

---

### 14. Logs go blank after a sidecar restart

**Expected:** LOGS shows the new process output.

**Actual:** `Logs.tsx` keeps `lastId` in React state and polls `since_id=lastId`. The ring buffer restarts IDs at 0. After watchdog restart, `since_id` is in the hundreds and the panel stays empty.

**Evidence:** `src/Logs.tsx` 8–22; `src-tauri/src/lib.rs` 150–166 (`sidecar-restarted` does not reset logs).

---

### 15. `MODEL_SOURCES.md` points at a layout the app will not load

**Expected:** Docs and the engine agree on where weights live.

**Actual:** `MODEL_SOURCES.md` says put official `MiniMaxAI/MiniMax-Music3` files in `models\MiniMax-Music3\`. The engine only accepts the three Comfy-Org files under `models/diffusion_models|text_encoders|vae/`. Following the sources doc produces “not installed” forever.

**Evidence:** `MODEL_SOURCES.md` vs `python/music3_engine.py` 27–31 and `README.md` / `MODEL_DOWNLOADS.md`.

---

### 16. FFmpeg is required for MP3/FLAC but never installed or documented

**Expected:** A menu item that is enabled should work after Setup.

**Actual:** Setup does not install FFmpeg. `exports.ready` is `bool(shutil.which("ffmpeg"))`. On a clean Windows box the MP3/FLAC actions stay disabled with no setup hint in the README.

**Evidence:** `python/main.py` 196–197, 286; `Setup MiniMax Music 3.bat`; `README.md`.

---

### 17. Reuse as new song is incomplete

**Expected:** “Reuse as new song” should recreate the same generate request (or clearly say what it does not restore).

**Actual:** Only title, description, lyrics, and the instrumental flag are copied. Seed, duration, steps, CFG, top-k, tiled decode, exclude-styles, and vocal gender are left at whatever is currently in the form. Seed is shown in the library but cannot be one-clicked back into the seed box.

**Evidence:** `src/App.tsx` 471–475.

---

## Lower — correctness nits

### 18. Malformed `MUSIC3_PROGRESS` lines kill the parent and leave the worker running

`_worker_event()` returns `""` when the line is exactly `MUSIC3_PROGRESS`. Empty string is not `None`, so `json.loads("")` throws. The job fails, the parent stops reading stdout, and the worker can block on a full pipe.

**Evidence:** `python/music3_engine.py` 34–39, 222–230.

---

### 19. Performance tags left in the lyric stream are not official Music 3 section tags

The UI inserts `[Spoken]`, `[Whispered]`, `[Rapped]`, etc. and claims they stay “performable.” Official docs treat non-section brackets as caption/arrangement directives, not lyric structure. MiniMax’s rewriter moves those tags out of the lyric text. The backend already does that for verbose `[Section – direction]` lines, but keeps the Insert-pill tags in the words-to-sing stream, where they can be sung or parsed as fake sections.

**Evidence:** `src/App.tsx` 590; `python/main.py` 113–162; official rewriter: “Treat only bracketed tags as executable structural… directives” and keep lyric text as words.

---

### 20. Details drawer always falls back to the newest song

`selectedSong = songs.find(...) ?? songs[0]`. Opening DETAILS with nothing clicked shows whoever is first in the newest-first list, which is easy to mistake for the track you are looking at.

**Evidence:** `src/App.tsx` 393, 660.

---

### 21. Initial sidecar spawn errors are discarded

`src-tauri/src/lib.rs` 148: `if let Ok(child) = spawn_sidecar()`. A missing venv python fails silently. The UI only says “engine unavailable” after 20 seconds of retries. Watchdog spawn failures are also silent.

---

### 22. Tests never exercise official hyphenated section tags

`python/tests/test_studio.py` covers `[Intro – …]`, `[Verse 1 – …]`, `[Bridge – …]`, and performance tags. It does not assert that `[Pre-Chorus]` / `[Post-Chorus]` survive. That is why bug 1 shipped.

---

## What is working as designed (not bugs)

- Auto duration sending `300` and letting the AR stop early matches official `max_duration` + end token. The Norse test saved at 144 s / 44.1 kHz, which is correct for this DAV pipeline (`latent_length` is defined in 44.1 kHz terms; the original full-weight model is 32 kHz).
- Creative latitude 50% → `top_k = 50` matches `CFG_TOP_K`.
- Tiled decode + std normalization matches ComfyUI `VAEDecodeAudio`.
- Path traversal on library folders is rejected.
- Stem / cover jobs share the one worker queue so they do not fight the 3090 at once.
- Instrumental lyrics become `[Instrumental]` inside the worker, which `normalize_lyrics()` turns into the official `[start]\n[instrumental]` skeleton.

---

## Suggested fix order

1. Teach `STRUCTURE_TAGS` (and the frontend normalizer) the hyphenated official names; stop mapping Post-Chorus to Chorus; add contract tests for `[Pre-Chorus]` / `[Post-Chorus]`.
2. Detect official captions (`###` headings, `Global Metadata:`) and never double-wrap; count tokens before submit.
3. Do not hold `_LOCK` across `_start()`; make cancel kill the PID immediately; delete the song folder on failure/cancel.
4. Restore `status.jobs[0]` into `job` on boot; do not replace an in-flight music job when starting cover/stems; show progress on Create.
5. Rebuild the caption when Instrumental / vocal gender changes; put exclusions into a heading that always exists.
6. Pull cover-art style from Basic Attributes / imagery, not the first heading line.
