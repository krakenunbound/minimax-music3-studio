from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import threading
import time
import atexit
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.base import BaseHTTPMiddleware

from config import LIBRARY_ROOT, LOGS_ROOT, OUTPUTS_ROOT, SIDECAR_HOST, SIDECAR_PORT
from jobs import Job, manager
from log_buffer import install, ring
import music3_engine
import cover_art
import lyrics_sync
import generation_timing
import stable_sfx

install(LOGS_ROOT)
log = logging.getLogger("music3.studio")
app = FastAPI(title="MiniMax Music 3 Studio", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class TauriWebViewCORSMiddleware(BaseHTTPMiddleware):
    """Let the Tauri WebView2 UI call this sidecar.

    GET /api/status is a simple request so it works. POST /api/generate is
    preflighted. WebView2 also flags https://tauri.localhost -> 127.0.0.1 as a
    private-network request. Without Allow-Private-Network the preflight is
    dropped, fetch() throws, and the UI shows 'service is not running'
    even while this process is healthy.
    """

    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin") or "*"
        if request.method == "OPTIONS":
            requested = request.headers.get("access-control-request-headers") or "*"
            return Response(status_code=204, headers={
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
                "Access-Control-Allow-Headers": requested,
                "Access-Control-Allow-Private-Network": "true",
                "Access-Control-Max-Age": "600",
            })
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response


app.add_middleware(TauriWebViewCORSMiddleware)
VIDEO_STUDIO_ROOT = Path(__file__).resolve().parent / "video_studio"
VIDEO_RENDER_ROOT = OUTPUTS_ROOT / "videos"
app.mount("/video-studio-static", StaticFiles(directory=VIDEO_STUDIO_ROOT), name="video-studio-static")


def is_expected_windows_disconnect(context: dict) -> bool:
    """Identify the harmless Proactor callback raised when a local UI socket closes."""
    error = context.get("exception")
    message = str(context.get("message") or "")
    return (
        isinstance(error, ConnectionResetError)
        and getattr(error, "winerror", None) == 10054
        and "_ProactorBasePipeTransport._call_connection_lost" in message
    )


def cleanup_orphan_library() -> int:
    """Remove incomplete job folders left by an interrupted older process."""
    LIBRARY_ROOT.mkdir(parents=True, exist_ok=True)
    removed = 0
    for folder in LIBRARY_ROOT.iterdir():
        if not folder.is_dir() or (folder / "song.json").is_file():
            continue
        try:
            shutil.rmtree(folder)
            removed += 1
            log.info("Removed incomplete song folder: %s", folder.name)
        except OSError as error:
            log.warning("Could not remove incomplete song folder %s: %s", folder.name, error)
    return removed


@app.on_event("startup")
async def quiet_expected_windows_disconnects() -> None:
    cleanup_orphan_library()
    loop = asyncio.get_running_loop()
    previous = loop.get_exception_handler()

    def handle_exception(active_loop: asyncio.AbstractEventLoop, context: dict) -> None:
        if is_expected_windows_disconnect(context):
            return
        if previous is not None:
            previous(active_loop, context)
        else:
            active_loop.default_exception_handler(context)

    loop.set_exception_handler(handle_exception)

class GenerateRequest(BaseModel):
    title: str = Field(default="Untitled Song", max_length=120)
    artist: str = Field(default="", max_length=160)
    album: str = Field(default="", max_length=160)
    genre: str = Field(default="", max_length=120)
    description: str = Field(min_length=1, max_length=12000)
    lyrics: str = Field(default="", max_length=24000)
    instrumental: bool = False
    seed: int | None = None
    duration: float = Field(default=120, ge=10, le=300)
    auto_duration: bool = False
    steps: int = Field(default=30, ge=10, le=60)
    cfg: float = Field(default=1.5, ge=0.1, le=10.0)
    top_k: int = Field(default=50, ge=1, le=16384)
    tiled_decode: bool = True
    exclude_styles: str = Field(default="", max_length=2000)
    vocal_gender: str = Field(default="auto", pattern="^(auto|female|male)$")
    english_translation: str = Field(default="", max_length=24000)
    lyrics_language: str = Field(default="en", min_length=2, max_length=12)


class SongUpdateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    artist: str = Field(default="", max_length=160)
    album: str = Field(default="", max_length=160)
    genre: str = Field(default="", max_length=120)
    year: str = Field(default="", pattern="^$|^[0-9]{4}$")
    track_number: str = Field(default="", pattern="^$|^[0-9]{1,3}(/[0-9]{1,3})?$")
    description: str = Field(default="", max_length=12000)
    lyrics: str = Field(default="", max_length=24000)
    english_translation: str = Field(default="", max_length=24000)
    lyrics_language: str = Field(default="en", min_length=2, max_length=12)


class PlaylistCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class CoverArtRequest(BaseModel):
    direction: str = Field(default="", max_length=1200)


class StemRequest(BaseModel):
    mode: str = Field(default="2", pattern="^(2|4)$")


class SoundEffectRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=1000)
    name: str = Field(default="", max_length=80)
    negative_prompt: str = Field(default="music, speech, singing, narration, clipping, distortion", max_length=500)
    duration: float = Field(default=5.0, ge=0.5, le=120.0)
    seed: int | None = Field(default=None, ge=0, le=2147483647)


class StudioRange(BaseModel):
    start: float = Field(ge=0.0, le=10800.0)
    end: float = Field(gt=0.0, le=10800.0)


class StudioEffectRegion(StudioRange):
    id: str = Field(min_length=1, max_length=80)
    kind: str = Field(pattern="^(gain_up|gain_down|echo|reverb|auto_level|normalize|clarity|compressor)$")
    amount: float = Field(default=0.5, ge=0.0, le=1.0)


class StudioClip(BaseModel):
    """One movable, razor-cuttable region of a source file on the Studio timeline."""

    id: str = Field(default="", max_length=80)
    start: float = Field(default=0.0, ge=0.0, le=10800.0)
    source_in: float = Field(default=0.0, ge=0.0, le=10800.0)
    source_out: float | None = Field(default=None, gt=0.0, le=10800.0)
    fade_in: float = Field(default=0.0, ge=0.0, le=120.0)
    fade_out: float = Field(default=0.0, ge=0.0, le=120.0)
    gain: float = Field(default=1.0, ge=0.0, le=4.0)
    gain_left: float = Field(default=1.0, ge=0.0, le=4.0)
    gain_right: float = Field(default=1.0, ge=0.0, le=4.0)


class StudioTrackState(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    gain: float = Field(default=1.0, ge=0.0, le=1.0)
    muted: bool = False
    solo: bool = False
    offset: float = Field(default=0.0, ge=0.0, le=10800.0)
    trim_start: float = Field(default=0.0, ge=0.0, le=10800.0)
    trim_end: float | None = Field(default=None, gt=0.0, le=10800.0)
    fade_in: float = Field(default=0.0, ge=0.0, le=120.0)
    fade_out: float = Field(default=0.0, ge=0.0, le=120.0)
    cuts: list[StudioRange] = Field(default_factory=list, max_length=64)
    effects: list[StudioEffectRegion] = Field(default_factory=list)
    clips: list[StudioClip] = Field(default_factory=list, max_length=256)
    use_clips: bool = False


class StudioSessionRequest(BaseModel):
    tracks: list[StudioTrackState] = Field(default_factory=list)


class StudioBounceRequest(StudioSessionRequest):
    variant: str = Field(default="custom", pattern="^(custom|instrumental|acapella)$")
    selection: StudioRange | None = None


STEMS_ROOT = Path(__file__).resolve().parent.parent / "models" / "stems"
STEM_MODEL = STEMS_ROOT / "955717e8-8726e21a.th"
STEM_CONFIG = STEMS_ROOT / "htdemucs.yaml"

STRUCTURE_TAGS = {
    "intro": "Intro",
    "verse": "Verse",
    "pre chorus": "Pre-Chorus",
    "prechorus": "Pre-Chorus",
    "pre-chorus": "Pre-Chorus",
    "chorus": "Chorus",
    "final chorus": "Chorus",
    "post chorus": "Post-Chorus",
    "postchorus": "Post-Chorus",
    "post-chorus": "Post-Chorus",
    "bridge": "Bridge",
    "interlude": "Interlude",
    "break": "Interlude",
    "breakdown": "Interlude",
    "hook": "Hook",
    "instrumental": "Instrumental",
    "inst": "Instrumental",
    "solo": "Solo",
    "outro": "Outro",
}
PERFORMANCE_TAGS = {
    "spoken": "Spoken",
    "spoken countdown": "Spoken Countdown",
    "whispered": "Whispered",
    "chanted": "Chanted",
    "rapped": "Rapped",
    "call and response": "Call and Response",
}


def prepare_music3_lyrics(value: str) -> tuple[str, list[str]]:
    """Keep lyrics literal and move verbose bracket directions into the caption."""
    output: list[str] = []
    directions: list[str] = []
    last_tag = ""
    current_section = ""
    for raw_line in value.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        match = re.fullmatch(r"\s*\[([^\[\]\n]{1,500})\]\s*", raw_line)
        if not match:
            output.append(raw_line.rstrip())
            last_tag = ""
            continue
        content = re.sub(r"\s+", " ", match.group(1)).strip()
        parts = re.split(r"\s+[-–—]\s+", content, maxsplit=1)
        head = re.sub(r"\s+", " ", re.sub(r"\d+$", "", parts[0]).strip()).casefold()
        detail = parts[1].strip() if len(parts) > 1 else ""
        if head in {"start", "end"}:
            continue
        if head == "fade in":
            directions.append("Opening: fade in")
            continue
        if head == "fade out":
            directions.append("Ending: fade out")
            continue
        tag = STRUCTURE_TAGS.get(head)
        if tag:
            current_section = tag
            rendered = f"[{tag}]"
            if rendered != last_tag:
                output.append(rendered)
                last_tag = rendered
            if detail:
                directions.append(f"{tag}: {detail}")
            continue
        performance = PERFORMANCE_TAGS.get(head)
        if performance:
            note = detail or "perform the following lyric line in this style"
            directions.append(f"{current_section}, {performance}: {note}" if current_section else f"{performance}: {note}")
            continue
        if head in {"female", "woman", "singer a"}:
            singer_note = f"Singer A (Female): {detail or 'takes the following local part'}"
            directions.append(f"{current_section}, {singer_note}" if current_section else singer_note)
            continue
        if head in {"male", "man", "singer b"}:
            singer_note = f"Singer B (Male): {detail or 'takes the following local part'}"
            directions.append(f"{current_section}, {singer_note}" if current_section else singer_note)
            continue
        directions.append(f"{current_section}: {content}" if current_section else content)

    cleaned: list[str] = []
    for line in output:
        if line or (cleaned and cleaned[-1]):
            cleaned.append(line)
    return "\n".join(cleaned).strip(), directions


def music3_caption(description: str, directions: list[str]) -> str:
    if not directions:
        return description
    notes = "; ".join(directions)[:3000]
    direction_line = (
        "Section Performance and Singer Assignments: "
        f"{notes}. These are production instructions only; never sing, speak, or recite the wording of these notes."
    )
    arrangement = re.search(r"(?im)^\s*(?:#{1,6}\s*)?Arrangement\s*:?\s*$", description)
    if arrangement:
        before = description[: arrangement.start()].rstrip()
        after = description[arrangement.start() :].lstrip()
        return f"{before}\n{direction_line}\n\n{after}"
    return f"{description.rstrip()}\n{direction_line}"


_MUSIC3_PUNCTUATION = str.maketrans({
    "\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'",
    "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"',
    "\u00ab": '"', "\u00bb": '"',
    "\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-", "\u2014": "-", "\u2212": "-",
    "\u2026": "...", "\u00a0": " ", "\u202f": " ", "\ufeff": "",
})


def music3_safe_text(value: str) -> str:
    """Normalize punctuation rejected by the bundled Music 3 tokenizer.

    The checkpoint tokenizer currently raises ``TextInputSequence must be str``
    for typographic double quotes even though the input is a Python string.
    Smart punctuation is common in pasted lyrics, so normalize the generation
    copy while preserving the user's original text in song metadata.
    """
    return value.translate(_MUSIC3_PUNCTUATION)


def prepare_generation_params(params: dict) -> dict:
    """Create the exact caption/lyrics pair the worker will tokenize and validate it."""
    prepared = dict(params)
    safe_description = music3_safe_text(prepared["description"])
    safe_lyrics = music3_safe_text(prepared["lyrics"])
    if prepared["instrumental"]:
        prepared["rendered_lyrics"] = "[Instrumental]"
        prepared["generation_description"] = safe_description
    else:
        rendered_lyrics, directions = prepare_music3_lyrics(safe_lyrics)
        prepared["rendered_lyrics"] = rendered_lyrics
        prepared["generation_description"] = music3_caption(safe_description, directions)
        if directions:
            log.info("Moved %d bracketed performance direction(s) out of the lyric stream", len(directions))
    counted = music3_engine.count_prompt_tokens(
        prepared["generation_description"], prepared["rendered_lyrics"]
    )
    prepared["prompt_tokens"] = counted["tokens"]
    if counted["tokens"] > counted["maximum"]:
        raise HTTPException(
            422,
            detail=(
                f"Music description and lyrics use {counted['tokens']:,} tokens; "
                f"Music 3 accepts at most {counted['maximum']:,}. Shorten the description or lyrics before generating."
            ),
        )
    return prepared


def ffmpeg_path() -> str | None:
    system = shutil.which("ffmpeg")
    if system:
        return system
    try:
        import imageio_ffmpeg
        bundled = imageio_ffmpeg.get_ffmpeg_exe()
        return bundled if Path(bundled).is_file() else None
    except (ImportError, OSError):
        return None


def stems_status() -> dict:
    check = (music3_engine.WORKER_PYTHON.parent.parent / "Lib" / "site-packages" / "demucs").is_dir()
    ready = bool(check and STEM_MODEL.is_file() and STEM_CONFIG.is_file())
    return {"ready": ready, "model": "htdemucs", "root": str(STEMS_ROOT), "detail": "GPU stem extraction ready" if ready else f"Install htdemucs in {STEMS_ROOT}"}


def slug(value: str) -> str:
    result = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    return result[:64] or "untitled-song"


def download_filename(song_dir: Path, suffix: str) -> str:
    title = "song"
    try:
        metadata = json.loads((song_dir / "song.json").read_text(encoding="utf-8"))
        title = str(metadata.get("title") or title)
    except (OSError, json.JSONDecodeError):
        pass
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "-", title).strip(" .")[:120] or "song"
    return f"{safe}{suffix.lower()}"


def gpu_status() -> dict:
    result = {"detected": False, "name": None, "vram_total_mb": None, "vram_free_mb": None, "usage": None, "temperature": None, "driver": None}
    try:
        line = subprocess.check_output([
            "nvidia-smi", "--query-gpu=name,memory.total,memory.free,utilization.gpu,temperature.gpu,driver_version",
            "--format=csv,noheader,nounits",
        ], text=True, timeout=5).splitlines()[0]
        values = [item.strip() for item in line.split(",")]
        result.update({"detected": True, "name": values[0], "vram_total_mb": int(values[1]), "vram_free_mb": int(values[2]), "usage": int(values[3]), "temperature": int(values[4]), "driver": values[5]})
    except Exception: pass
    return result


def generate(job: Job) -> dict:
    request = job.params
    stamp = time.strftime("%Y%m%d-%H%M%S")
    song_dir = LIBRARY_ROOT / f"{stamp}_{slug(request['title'])}_{job.id[:6]}"
    song_dir.mkdir(parents=True, exist_ok=True)
    output = song_dir / "song.wav"
    manifest = song_dir / "song.json"
    try:
        job.phase, job.progress = "Starting standalone Music 3 worker", 0.01; job.emit()
        engine_result = music3_engine.generate(job, request, output)
        if job.cancel.is_set(): raise RuntimeError("cancelled")
        metadata = {
            "id": job.id, "title": request["title"], "description": request["description"],
            "artist": request.get("artist", ""), "album": request.get("album", ""),
            "genre": request.get("genre", ""), "year": time.strftime("%Y"), "track_number": "",
            "lyrics": request["lyrics"], "instrumental": request["instrumental"],
            "seed": request["seed"], "duration": engine_result["duration"],
            "requested_duration": request["duration"], "auto_duration": request.get("auto_duration", False),
            "steps": request["steps"], "cfg": request["cfg"], "top_k": request.get("top_k", 50),
            "tiled_decode": request["tiled_decode"], "exclude_styles": request.get("exclude_styles", ""),
            "vocal_gender": request.get("vocal_gender", "auto"), "prompt_tokens": request.get("prompt_tokens"),
            "english_translation": request.get("english_translation", ""),
            "lyrics_language": request.get("lyrics_language", "en"),
            "sample_rate": engine_result["sample_rate"], "audio": output.name,
            "cover": None, "cover_error": None, "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        manifest.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
        log.info("Saved Music 3 song: %s", output)
        cover_seconds: float | None = None
        timing_profile = generation_timing.predict(request)
        if cover_art.available():
            cover_started = time.monotonic()
            job.phase, job.progress, job.eta_seconds, job.stage_progress = "Generating thumbnail", 0.91, timing_profile.cover_seconds, 0.0; job.emit()
            try:
                cover_art.render(job, request["title"], request["description"], request["lyrics"], song_dir / "cover.png")
                metadata["cover"] = "cover.png"
                cover_seconds = time.monotonic() - cover_started
            except Exception as error:
                if job.cancel.is_set(): raise
                metadata["cover_error"] = str(error); log.warning("Song saved, but thumbnail failed: %s", error)
        else:
            log.info("Cover model is not installed; skipping automatic thumbnail")
        measured = engine_result.get("generation_timing") or {}
        if measured:
            generation_timing.record(
                request,
                float(measured.get("compose_seconds") or 0.0),
                float(measured.get("refine_seconds") or 0.0),
                cover_seconds,
            )
        manifest.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
        return {**metadata, "folder": str(song_dir), "folder_name": song_dir.name, "audio_url": f"/api/library/{song_dir.name}/song.wav", "cover_url": f"/api/library/{song_dir.name}/cover.png" if metadata["cover"] else None}
    except Exception:
        if not manifest.is_file():
            shutil.rmtree(song_dir, ignore_errors=True)
        raise


def library() -> list[dict]:
    LIBRARY_ROOT.mkdir(parents=True, exist_ok=True)
    items = []
    for manifest in LIBRARY_ROOT.glob("*/song.json"):
        try:
            item = json.loads(manifest.read_text(encoding="utf-8"))
            audio = manifest.parent / str(item.get("audio") or "song.wav")
            if audio.is_file():
                items.append({
                    **item,
                    "folder": str(manifest.parent),
                    "folder_name": manifest.parent.name,
                    "audio_url": f"/api/library/{manifest.parent.name}/{audio.name}",
                    "cover_url": f"/api/library/{manifest.parent.name}/{item['cover']}?v={(manifest.parent / item['cover']).stat().st_mtime_ns}" if item.get("cover") and (manifest.parent / item["cover"]).is_file() else None,
                    "timed_lyrics": lyrics_sync.load(manifest.parent),
                })
        except (OSError, json.JSONDecodeError): pass
    return sorted(items, key=lambda item: item.get("created_at", ""), reverse=True)


PLAYLISTS_FILE = OUTPUTS_ROOT / "playlists.json"
PLAYLISTS_LOCK = threading.RLock()
WORKSPACES_FILE = OUTPUTS_ROOT / "workspaces.json"
WORKSPACES_LOCK = threading.RLock()


def load_playlists() -> list[dict]:
    with PLAYLISTS_LOCK:
        try:
            payload = json.loads(PLAYLISTS_FILE.read_text(encoding="utf-8"))
            items = payload.get("playlists", []) if isinstance(payload, dict) else []
            return [item for item in items if isinstance(item, dict) and item.get("id") and item.get("name") and isinstance(item.get("song_ids"), list)]
        except (OSError, json.JSONDecodeError):
            return []


def save_playlists(items: list[dict]) -> None:
    with PLAYLISTS_LOCK:
        PLAYLISTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary = PLAYLISTS_FILE.with_suffix(".json.tmp")
        temporary.write_text(json.dumps({"playlists": items}, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(temporary, PLAYLISTS_FILE)


def find_playlist(items: list[dict], playlist_id: str) -> dict:
    playlist = next((item for item in items if item["id"] == playlist_id), None)
    if playlist is None:
        raise HTTPException(404, "Playlist not found")
    return playlist


def load_workspaces() -> list[dict]:
    with WORKSPACES_LOCK:
        try:
            payload = json.loads(WORKSPACES_FILE.read_text(encoding="utf-8"))
            items = payload.get("workspaces", []) if isinstance(payload, dict) else []
            items = [item for item in items if isinstance(item, dict) and item.get("id") and item.get("name") and isinstance(item.get("song_ids"), list)]
        except (OSError, json.JSONDecodeError):
            items = []
        if not any(item["id"] == "my-workspace" for item in items):
            items.insert(0, {"id": "my-workspace", "name": "My Workspace", "song_ids": [], "created_at": time.strftime("%Y-%m-%d %H:%M:%S")})
        valid_song_ids = {str(song.get("id")) for song in library() if song.get("id")}
        assigned: set[str] = set()
        changed = False
        for item in items:
            unique = []
            for song_id in item["song_ids"]:
                if song_id in valid_song_ids and song_id not in assigned:
                    unique.append(song_id); assigned.add(song_id)
            changed = changed or unique != item["song_ids"]
            item["song_ids"] = unique
        default = next(item for item in items if item["id"] == "my-workspace")
        missing = sorted(valid_song_ids - assigned)
        if missing:
            default["song_ids"].extend(missing); changed = True
        if changed or not WORKSPACES_FILE.is_file(): save_workspaces(items)
        return items


def save_workspaces(items: list[dict]) -> None:
    with WORKSPACES_LOCK:
        WORKSPACES_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary = WORKSPACES_FILE.with_suffix(".json.tmp")
        temporary.write_text(json.dumps({"workspaces": items}, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(temporary, WORKSPACES_FILE)


def find_workspace(items: list[dict], workspace_id: str) -> dict:
    workspace = next((item for item in items if item["id"] == workspace_id), None)
    if workspace is None: raise HTTPException(404, "Workspace not found")
    return workspace


def inference_status() -> dict:
    model = music3_engine.model_status()
    runtime = music3_engine.runtime_status()
    online = bool(model["ready"] and runtime["ready"])
    if not runtime["ready"]:
        detail = "Standalone runtime is not installed. Run Setup MiniMax Music 3.bat."
    elif not model["ready"]:
        detail = "Install the three optimized Music 3 model files."
    else:
        detail = "Standalone single-GPU Music 3 engine ready"
    return {"online": online, "url": "local worker", "detail": detail, **runtime}


@app.get("/health")
def health(): return {"ok": True, "service": "MiniMax Music 3 Studio", "protocol": 2, "outputs_root": str(OUTPUTS_ROOT), "model": music3_engine.model_status(), "inference": inference_status()}


@app.get("/video-studio")
def video_studio_page():
    return FileResponse(VIDEO_STUDIO_ROOT / "index.html", media_type="text/html")


@app.post("/api/video/render")
async def render_visualizer_video(request: Request, title: str = "visualizer"):
    """Convert the browser's canvas/audio capture to a shareable H.264 MP4."""
    ffmpeg = ffmpeg_path()
    if not ffmpeg:
        raise HTTPException(409, "FFmpeg is not installed")
    safe_title = slug(title)[:80] or "visualizer"
    VIDEO_RENDER_ROOT.mkdir(parents=True, exist_ok=True)
    render_id = f"{time.time_ns():x}"
    source = VIDEO_RENDER_ROOT / f"{safe_title}-{render_id}.webm"
    target = VIDEO_RENDER_ROOT / f"{safe_title}-{render_id}.mp4"
    total = 0
    try:
        with source.open("wb") as handle:
            async for chunk in request.stream():
                total += len(chunk)
                if total > 4 * 1024 * 1024 * 1024:
                    raise HTTPException(413, "Video render is limited to 4 GB")
                handle.write(chunk)
        if total == 0:
            raise HTTPException(400, "The browser did not return a video recording")
        command = [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", str(target),
        ]
        completed = subprocess.run(
            command, capture_output=True, text=True, timeout=3600,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        if completed.returncode != 0 or not target.is_file():
            target.unlink(missing_ok=True)
            raise HTTPException(500, completed.stderr.strip()[-1600:] or "FFmpeg could not encode the video")
        return FileResponse(target, filename=f"{safe_title}.mp4", media_type="video/mp4")
    finally:
        source.unlink(missing_ok=True)

@app.get("/api/status")
def status():
    ffmpeg = ffmpeg_path()
    return {"model": music3_engine.model_status(), "cover_art": cover_art.status(), "stems": stems_status(), "sound_effects": stable_sfx.status(), "lyrics_sync": lyrics_sync.status(), "exports": {"ready": bool(ffmpeg), "detail": "MP3 and FLAC export ready" if ffmpeg else "Run Setup to install the private FFmpeg exporter"}, "service": inference_status(), "gpu": gpu_status(), "jobs": [job.snapshot() for job in manager.list()[:30]]}

@app.post("/api/models/refresh")
def refresh_models(): return music3_engine.model_status()

@app.post("/api/clear-memory")
def clear_memory():
    if any(job.status in {"queued", "running"} for job in manager.list()):
        raise HTTPException(409, "Cancel active generation before clearing VRAM")
    return music3_engine.unload()

@app.post("/api/generate")
def start_generation(request: GenerateRequest):
    state = inference_status()
    if not state["online"]: raise HTTPException(409, detail=state["detail"])
    params = request.model_dump()
    if params["seed"] is None: params["seed"] = int.from_bytes(os.urandom(4), "big") & 0x7FFFFFFF
    try:
        params = prepare_generation_params(params)
    except HTTPException:
        raise
    except Exception as error:
        log.exception("Could not prepare Music 3 prompt")
        raise HTTPException(500, detail=f"Could not prepare the Music 3 prompt: {error}") from error
    job = manager.submit("music3", params, generate)
    return {"job": job.snapshot()}

@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = manager.get(job_id)
    if not job: raise HTTPException(404, "Job not found")
    return {"job": job.snapshot()}

@app.post("/api/jobs/{job_id}/cancel")
def cancel(job_id: str):
    target = manager.get(job_id)
    was_running = bool(target and target.status == "running")
    if not manager.cancel_job(job_id): raise HTTPException(409, "Job is already finished or missing")
    if was_running and target and target.kind == "music3":
        music3_engine.cancel()
    elif was_running and target and target.kind == "lyrics_sync":
        lyrics_sync.cancel()
    elif was_running and target and target.kind == "stable_sfx":
        stable_sfx.cancel(target)
    return {"status": "cancelling"}

@app.websocket("/ws/jobs/{job_id}")
async def job_socket(socket: WebSocket, job_id: str):
    await socket.accept(); subscription = manager.subscribe(job_id)
    if subscription is None: await socket.close(code=4404); return
    queue, unsubscribe = subscription
    try:
        while True:
            event = await queue.get(); await socket.send_json(event)
            if event.get("status") in {"succeeded", "failed", "cancelled"}: break
    except WebSocketDisconnect: pass
    finally: unsubscribe()

@app.get("/api/library")
def get_library(): return {"items": library()}


@app.get("/api/library/{folder}/timed-lyrics")
def get_timed_lyrics(folder: str):
    song_dir = resolve_song_folder(folder)
    payload = lyrics_sync.load(song_dir)
    if not payload or not payload.get("lines"):
        raise HTTPException(404, "This song does not have synchronized lyrics yet")
    return payload


@app.get("/api/playlists")
def get_playlists(): return {"items": load_playlists()}


@app.post("/api/playlists")
def create_playlist(request: PlaylistCreateRequest):
    name = request.name.strip()
    if not name: raise HTTPException(422, "Playlist name cannot be blank")
    items = load_playlists()
    if any(item["name"].casefold() == name.casefold() for item in items):
        raise HTTPException(409, "A playlist with that name already exists")
    playlist = {"id": f"{slug(name)[:40]}-{time.time_ns():x}", "name": name, "song_ids": [], "created_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    items.append(playlist); save_playlists(items)
    return {"playlist": playlist}


@app.delete("/api/playlists/{playlist_id}")
def delete_playlist(playlist_id: str):
    items = load_playlists(); find_playlist(items, playlist_id)
    save_playlists([item for item in items if item["id"] != playlist_id])
    return {"deleted": True}


@app.post("/api/playlists/{playlist_id}/songs/{song_id}")
def add_song_to_playlist(playlist_id: str, song_id: str):
    if not any(str(song.get("id")) == song_id for song in library()):
        raise HTTPException(404, "Song not found")
    items = load_playlists(); playlist = find_playlist(items, playlist_id)
    if song_id not in playlist["song_ids"]: playlist["song_ids"].append(song_id)
    save_playlists(items)
    return {"added": True}


@app.delete("/api/playlists/{playlist_id}/songs/{song_id}")
def remove_song_from_playlist(playlist_id: str, song_id: str):
    items = load_playlists(); playlist = find_playlist(items, playlist_id)
    playlist["song_ids"] = [item for item in playlist["song_ids"] if item != song_id]
    save_playlists(items)
    return {"removed": True}


@app.get("/api/workspaces")
def get_workspaces(): return {"items": load_workspaces()}


@app.post("/api/workspaces")
def create_workspace(request: PlaylistCreateRequest):
    name = request.name.strip()
    if not name: raise HTTPException(422, "Workspace name cannot be blank")
    items = load_workspaces()
    if any(item["name"].casefold() == name.casefold() for item in items): raise HTTPException(409, "A workspace with that name already exists")
    workspace = {"id": f"{slug(name)[:40]}-{time.time_ns():x}", "name": name, "song_ids": [], "created_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    items.append(workspace); save_workspaces(items)
    return {"workspace": workspace}


@app.delete("/api/workspaces/{workspace_id}")
def delete_workspace(workspace_id: str):
    if workspace_id == "my-workspace": raise HTTPException(409, "My Workspace cannot be deleted")
    items = load_workspaces(); workspace = find_workspace(items, workspace_id)
    default = find_workspace(items, "my-workspace")
    default["song_ids"].extend(song_id for song_id in workspace["song_ids"] if song_id not in default["song_ids"])
    save_workspaces([item for item in items if item["id"] != workspace_id])
    return {"deleted": True}


@app.post("/api/workspaces/{workspace_id}/songs/{song_id}")
def move_song_to_workspace(workspace_id: str, song_id: str):
    if not any(str(song.get("id")) == song_id for song in library()): raise HTTPException(404, "Song not found")
    items = load_workspaces(); target = find_workspace(items, workspace_id)
    for item in items: item["song_ids"] = [existing for existing in item["song_ids"] if existing != song_id]
    target["song_ids"].append(song_id); save_workspaces(items)
    return {"moved": True}


def resolve_song_folder(folder: str) -> Path:
    """Resolve one direct library child without permitting path traversal."""
    if not folder or Path(folder).name != folder or folder in {".", ".."}:
        raise HTTPException(404, "Song not found")
    root = LIBRARY_ROOT.resolve()
    target = (root / folder).resolve()
    if target.parent != root or not target.is_dir():
        raise HTTPException(404, "Song not found")
    return target


@app.patch("/api/library/{folder}")
def update_song(folder: str, request: SongUpdateRequest):
    target = resolve_song_folder(folder)
    manifest = target / "song.json"
    try:
        metadata = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(404, "Song details not found") from exc
    lyrics_changed = str(metadata.get("lyrics") or "") != request.lyrics
    metadata.update({
        "title": request.title.strip(),
        "artist": request.artist.strip(),
        "album": request.album.strip(),
        "genre": request.genre.strip(),
        "year": request.year.strip(),
        "track_number": request.track_number.strip(),
        "description": request.description.strip(),
        "lyrics": request.lyrics,
        "english_translation": request.english_translation,
        "lyrics_language": request.lyrics_language.strip().lower(),
    })
    timed = lyrics_sync.load(target)
    if lyrics_changed:
        shutil.rmtree(target / "lyrics_sync", ignore_errors=True)
        metadata.pop("lyrics_sync", None)
    elif timed is not None:
        lyrics_sync.attach_translations(timed, request.english_translation)
        lyrics_sync.result_path(target).write_text(json.dumps(timed, indent=2, ensure_ascii=False), encoding="utf-8")
    if not metadata["title"]:
        raise HTTPException(422, "Song title cannot be blank")
    manifest.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("Updated Music 3 song details: %s", target.name)
    return {"updated": True}


def regenerate_cover(job: Job) -> dict:
    request = job.params
    song_dir = resolve_song_folder(request["folder"])
    manifest = song_dir / "song.json"
    try:
        metadata = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError("Song details could not be read") from exc
    pending = song_dir / "cover.pending.png"
    final = song_dir / "cover.png"
    try:
        result = cover_art.render(
            job, str(metadata.get("title") or "Untitled Song"),
            str(metadata.get("description") or ""), str(metadata.get("lyrics") or ""), pending,
            direction=str(request.get("direction") or ""), progress_base=0.05, progress_span=0.94,
        )
        if job.cancel.is_set(): raise RuntimeError("cancelled")
        pending.replace(final)
        metadata["cover"] = final.name
        metadata["cover_error"] = None
        metadata["cover_seed"] = result.get("seed")
        metadata["cover_direction"] = str(request.get("direction") or "")
        manifest.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
        log.info("Regenerated cover art: %s", final)
        return {"folder": song_dir.name, "cover_url": f"/api/library/{song_dir.name}/cover.png?v={final.stat().st_mtime_ns}", "seed": result.get("seed")}
    finally:
        pending.unlink(missing_ok=True)


@app.post("/api/library/{folder}/cover")
def start_cover_regeneration(folder: str, request: CoverArtRequest):
    resolve_song_folder(folder)
    if not cover_art.available():
        raise HTTPException(409, cover_art.status()["detail"])
    job = manager.submit("cover_art", {"folder": folder, "direction": request.direction.strip()}, regenerate_cover)
    return {"job": job.snapshot()}


@app.post("/api/library/{folder}/cover/upload")
async def upload_song_cover(folder: str, filename: str, request: Request):
    song_dir = resolve_song_folder(folder)
    suffix = Path(filename).suffix.casefold()
    if suffix not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(415, "Choose a PNG, JPG, JPEG, or WebP image")
    ffmpeg = ffmpeg_path()
    if not ffmpeg:
        raise HTTPException(409, "FFmpeg is not installed")
    temporary = song_dir / f"cover-upload-{time.time_ns()}{suffix}"
    prepared = song_dir / f"cover-prepared-{time.time_ns()}.png"
    target = song_dir / "cover.png"
    total = 0
    try:
        with temporary.open("wb") as handle:
            async for chunk in request.stream():
                total += len(chunk)
                if total > 20 * 1024 * 1024:
                    raise HTTPException(413, "Cover images are limited to 20 MB")
                handle.write(chunk)
        if total == 0:
            raise HTTPException(400, "The selected image is empty")
        command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(temporary), "-vf", "scale=1024:1024:force_original_aspect_ratio=decrease,pad=1024:1024:(ow-iw)/2:(oh-ih)/2:black", "-frames:v", "1", str(prepared)]
        result = subprocess.run(command, capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        if result.returncode != 0 or not prepared.is_file():
            raise HTTPException(409, result.stderr.strip() or "Could not prepare that cover image")
        os.replace(prepared, target)
        manifest = song_dir / "song.json"
        metadata = json.loads(manifest.read_text(encoding="utf-8"))
        metadata["cover"] = target.name
        metadata["cover_error"] = None
        manifest.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    finally:
        temporary.unlink(missing_ok=True)
        prepared.unlink(missing_ok=True)
    return {"uploaded": True, "cover_url": f"/api/library/{song_dir.name}/cover.png?v={target.stat().st_mtime_ns}"}


def export_audio(song_dir: Path, fmt: str) -> dict:
    source = song_dir / "song.wav"
    if not source.is_file(): raise RuntimeError("The source WAV file is missing")
    ffmpeg = ffmpeg_path()
    if not ffmpeg: raise RuntimeError("FFmpeg is not installed")
    target = song_dir / f"song.{fmt}"
    try:
        metadata = json.loads((song_dir / "song.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        metadata = {}
    created_at = str(metadata.get("created_at") or "")
    saved_year = str(metadata.get("year") or "").strip()
    inferred_year = created_at[:4] if created_at[:4].isdigit() else ""
    tags = {
        "title": str(metadata.get("title") or song_dir.name),
        "artist": str(metadata.get("artist") or ""),
        "album": str(metadata.get("album") or ""),
        "genre": str(metadata.get("genre") or ""),
        "date": saved_year or inferred_year,
        "track": str(metadata.get("track_number") or ""),
        "comment": str(metadata.get("description") or "Generated locally with MiniMax Music 3 Studio"),
    }
    command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source)]
    cover_name = str(metadata.get("cover") or "cover.png")
    cover = song_dir / cover_name
    has_cover = cover.is_file()
    if has_cover:
        command += ["-i", str(cover), "-map", "0:a:0", "-map", "1:v:0"]
    else:
        command += ["-map", "0:a:0"]
    command += ["-map_metadata", "-1"]
    for key, value in tags.items():
        if value.strip():
            command += ["-metadata", f"{key}={value.strip()}"]
    if fmt == "mp3":
        command += ["-codec:a", "libmp3lame", "-q:a", "0", "-id3v2_version", "3"]
        if has_cover:
            command += ["-codec:v", "mjpeg", "-disposition:v:0", "attached_pic", "-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)"]
    else:
        command += ["-codec:a", "flac", "-compression_level", "8"]
        if has_cover:
            command += ["-codec:v", "copy", "-disposition:v:0", "attached_pic"]
    command.append(str(target))
    result = subprocess.run(command, capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    if result.returncode != 0 or not target.is_file(): raise RuntimeError(result.stderr.strip() or f"Could not create {fmt.upper()}")
    return {"download_url": f"/api/library/{song_dir.name}/{target.name}", "filename": download_filename(song_dir, target.suffix)}


@app.post("/api/library/{folder}/export/{fmt}")
def convert_audio(folder: str, fmt: str):
    if fmt not in {"mp3", "flac"}: raise HTTPException(422, "Format must be MP3 or FLAC")
    try: return export_audio(resolve_song_folder(folder), fmt)
    except RuntimeError as exc: raise HTTPException(409, str(exc)) from exc


def extract_stems(job: Job) -> dict:
    song_dir = resolve_song_folder(job.params["folder"]); source = song_dir / "song.wav"; output_root = song_dir / "stems"
    command = [str(music3_engine.WORKER_PYTHON), str(Path(__file__).with_name("demucs_runner.py")), "-n", "htdemucs", "--repo", str(STEMS_ROOT), "-d", "cuda", "--segment", "7", "--overlap", "0.1", "--shifts", "1"]
    if job.params["mode"] == "2": command += ["--two-stems", "vocals"]
    command += ["-o", str(output_root), "--filename", "{stem}.{ext}", str(source)]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    assert process.stdout is not None
    job.phase, job.progress = "Separating stems on GPU", 0.08; job.emit(); started = time.monotonic()
    for raw in process.stdout:
        line = raw.strip()
        if line: log.info("[stems] %s", line)
        match = re.search(r"STEM_PROGRESS\s+(\d{1,3})", line)
        if match:
            fraction = min(1.0, int(match.group(1)) / 100); job.progress = 0.08 + 0.88 * fraction; job.stage_progress = fraction
            elapsed = max(0.1, time.monotonic() - started); job.eta_seconds = elapsed * (1 - fraction) / fraction if fraction else None; job.emit()
        if job.cancel.is_set(): process.kill(); process.wait(timeout=10); raise RuntimeError("cancelled")
    code = process.wait(); target_dir = output_root / "htdemucs"; files = sorted(target_dir.glob("*.wav"))
    if code != 0 or not files: raise RuntimeError(f"Stem extraction exited with code {code}")
    manifest_path = song_dir / "song.json"; metadata = json.loads(manifest_path.read_text(encoding="utf-8")); metadata["stems"] = [path.name for path in files]; manifest_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"folder": song_dir.name, "files": [{"name": path.name, "url": f"/api/library/{song_dir.name}/stems/{path.name}"} for path in files]}


@app.post("/api/library/{folder}/stems")
def start_stem_extraction(folder: str, request: StemRequest):
    resolve_song_folder(folder); state = stems_status()
    if not state["ready"]: raise HTTPException(409, state["detail"])
    job = manager.submit("stems", {"folder": folder, "mode": request.mode}, extract_stems)
    return {"job": job.snapshot()}


def _studio_manifest(song_dir: Path) -> tuple[Path, dict]:
    manifest = song_dir / "song.json"
    try:
        metadata = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(404, "Song details not found") from exc
    return manifest, metadata


@app.patch("/api/library/{folder}/studio")
def save_studio_session(folder: str, request: StudioSessionRequest):
    song_dir = resolve_song_folder(folder); manifest, metadata = _studio_manifest(song_dir)
    metadata["studio"] = {"tracks": [track.model_dump() for track in request.tracks], "updated_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    manifest.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"saved": True}


@app.post("/api/library/{folder}/studio/import")
async def import_studio_track(folder: str, filename: str, request: Request):
    song_dir = resolve_song_folder(folder); manifest, metadata = _studio_manifest(song_dir)
    suffix = Path(filename).suffix.casefold()
    if suffix not in {".wav", ".mp3", ".flac", ".m4a", ".aac", ".ogg"}:
        raise HTTPException(415, "Choose a WAV, MP3, FLAC, M4A, AAC, or OGG audio file")
    ffmpeg = ffmpeg_path()
    if not ffmpeg: raise HTTPException(409, "FFmpeg is not installed")
    imports_dir = song_dir / "studio" / "imports"; tracks_dir = song_dir / "studio" / "tracks"
    imports_dir.mkdir(parents=True, exist_ok=True); tracks_dir.mkdir(parents=True, exist_ok=True)
    base_name = slug(Path(filename).stem)[:48] or "audio"
    stamp = f"{int(time.time() * 1000)}"
    original = imports_dir / f"{stamp}_{base_name}{suffix}"
    total = 0
    target: Path | None = None
    try:
        with original.open("wb") as handle:
            async for chunk in request.stream():
                total += len(chunk)
                if total > 512 * 1024 * 1024:
                    raise HTTPException(413, "Audio imports are limited to 512 MB")
                handle.write(chunk)
        if total == 0: raise HTTPException(400, "The selected audio file is empty")
        target = tracks_dir / f"{stamp}_{base_name}.wav"
        command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(original), "-vn", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", str(target)]
        result = subprocess.run(command, capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        if result.returncode != 0 or not target.is_file():
            raise HTTPException(409, result.stderr.strip() or "Could not prepare the imported audio")
    except Exception:
        if original.is_file(): original.unlink(missing_ok=True)
        if target is not None and target.is_file(): target.unlink(missing_ok=True)
        raise
    assert target is not None
    entry = {"file": target.name, "name": Path(filename).stem[:80], "original": original.name}
    metadata.setdefault("studio_imports", []).append(entry)
    manifest.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    return {**entry, "url": f"/api/library/{song_dir.name}/studio/tracks/{target.name}"}


@app.post("/api/library/{folder}/studio/generate-sfx")
def generate_studio_sound(folder: str, request: SoundEffectRequest):
    song_dir = resolve_song_folder(folder)
    current = stable_sfx.status()
    if not current["ready"]:
        raise HTTPException(409, current["detail"])
    params = request.model_dump()
    if params["seed"] is None:
        params["seed"] = int.from_bytes(os.urandom(4), "big") & 0x7FFFFFFF
    job = manager.submit("stable_sfx", params, lambda active: stable_sfx.generate(active, song_dir))
    return {"job": job.snapshot()}


@app.get("/api/effects")
def effect_library():
    return {"items": stable_sfx.list_effects()}


@app.post("/api/effects/generate")
def generate_effect(request: SoundEffectRequest):
    current = stable_sfx.status()
    if not current["ready"]:
        raise HTTPException(409, current["detail"])
    params = request.model_dump()
    if params["seed"] is None:
        params["seed"] = int.from_bytes(os.urandom(4), "big") & 0x7FFFFFFF
    job = manager.submit("stable_sfx", params, lambda active: stable_sfx.generate(active))
    return {"job": job.snapshot()}


@app.get("/api/effects/{effect_id}/audio")
def effect_audio(effect_id: str):
    try:
        audio, _ = stable_sfx.get_effect(effect_id)
    except (FileNotFoundError, ValueError, json.JSONDecodeError):
        raise HTTPException(404, "Sound effect not found")
    return FileResponse(audio, media_type="audio/wav", filename=f"{effect_id}.wav")


@app.post("/api/effects/{effect_id}/add-to-studio/{folder}")
def add_effect_to_studio(effect_id: str, folder: str):
    song_dir = resolve_song_folder(folder)
    try:
        return stable_sfx.add_to_song(effect_id, song_dir)
    except (FileNotFoundError, ValueError, json.JSONDecodeError):
        raise HTTPException(404, "Sound effect not found")


@app.delete("/api/effects/{effect_id}")
def remove_effect(effect_id: str):
    try:
        stable_sfx.delete_effect(effect_id)
    except (FileNotFoundError, ValueError):
        raise HTTPException(404, "Sound effect not found")
    return {"deleted": True}


def resolve_studio_clips(track: StudioTrackState) -> list[StudioClip]:
    """Return movable timeline clips, migrating the older one-block session when needed."""
    if track.use_clips:
        return [clip for clip in track.clips if clip.source_out is None or clip.source_out > clip.source_in]
    if track.clips:
        return list(track.clips)
    offset = max(0.0, track.offset)
    start = max(offset, track.trim_start)
    source_in = max(0.0, start - offset)
    source_out = None if track.trim_end is None else max(source_in + 0.001, track.trim_end - offset)
    pieces = [StudioClip(id="legacy-0", start=start, source_in=source_in, source_out=source_out, fade_in=track.fade_in, fade_out=track.fade_out)]
    for cut in track.cuts:
        split: list[StudioClip] = []
        for piece in pieces:
            unknown = piece.source_out is None
            piece_len = 1e9 if unknown else max(0.0, piece.source_out - piece.source_in)
            piece_end = piece.start + piece_len
            if cut.end <= piece.start or cut.start >= piece_end:
                split.append(piece)
                continue
            if cut.start > piece.start + 0.02:
                left_out = piece.source_in + (cut.start - piece.start)
                split.append(piece.model_copy(update={"source_out": left_out, "fade_out": 0.0}))
            if not unknown and cut.end < piece_end - 0.02:
                right_in = piece.source_in + (cut.end - piece.start)
                split.append(StudioClip(id=f"{piece.id}-r", start=cut.end, source_in=right_in, source_out=piece.source_out, fade_in=0.0, fade_out=piece.fade_out))
        pieces = split
    return pieces


def _studio_clip_chain(index: int, track: StudioTrackState, clips: list[StudioClip], filters: list[str]) -> str:
    """Place each clip on the timeline, then mix overlapping pieces from the same source."""
    labels: list[str] = []
    for clip_index, clip in enumerate(clips):
        parts: list[str] = []
        if clip.source_in > 0 or clip.source_out is not None:
            trim = f"atrim=start={clip.source_in:.5f}"
            if clip.source_out is not None:
                trim += f":end={clip.source_out:.5f}"
            parts.append(trim)
            parts.append("asetpts=PTS-STARTPTS")
        clip_gain = max(0.0, min(4.0, track.gain * clip.gain))
        parts.append(f"volume={clip_gain:.5f}")
        left = max(0.0, min(4.0, clip.gain_left))
        right = max(0.0, min(4.0, clip.gain_right))
        if abs(left - 1.0) > 0.001 or abs(right - 1.0) > 0.001:
            parts.append(f"pan=stereo|c0={left:.5f}*c0|c1={right:.5f}*c1")
        clip_len = None if clip.source_out is None else max(0.0, clip.source_out - clip.source_in)
        if clip.fade_in > 0:
            parts.append(f"afade=t=in:st=0:d={clip.fade_in:.5f}:curve=qsin")
        if clip.fade_out > 0 and clip_len is not None:
            parts.append(f"afade=t=out:st={max(0.0, clip_len - clip.fade_out):.5f}:d={clip.fade_out:.5f}:curve=qsin")
        if clip.start > 0:
            parts.append(f"adelay={round(clip.start * 1000)}:all=1")
        label = f"clip{index}_{clip_index}"
        filters.append(f"[{index}:a]{','.join(parts)}[{label}]")
        labels.append(label)
    raw = f"rawlane{index}"
    if len(labels) == 1:
        filters.append(f"[{labels[0]}]anull[{raw}]")
    else:
        joined = "".join(f"[{label}]" for label in labels)
        filters.append(f"{joined}amix=inputs={len(labels)}:duration=longest:normalize=0[{raw}]")
    return raw


def _studio_sources(song_dir: Path, metadata: dict, request: StudioBounceRequest) -> list[tuple[Path, StudioTrackState]]:
    available = {str(name): song_dir / "stems" / "htdemucs" / str(name) for name in metadata.get("stems") or []}
    original_mix = song_dir / str(metadata.get("audio") or "song.wav")
    if original_mix.is_file(): available["song.wav"] = original_mix
    imported_names: set[str] = set()
    for item in metadata.get("studio_imports") or []:
        if isinstance(item, dict) and Path(str(item.get("file") or "")).name == str(item.get("file") or ""):
            name = str(item["file"]); available[name] = song_dir / "studio" / "tracks" / name; imported_names.add(name)
    tracks = [track for track in request.tracks if track.name in available]
    if metadata.get("stems"):
        tracks = [track for track in tracks if track.name != "song.wav"]
    if request.variant == "instrumental":
        tracks = [track for track in tracks if track.name not in {"vocals.wav", "song.wav"} and track.name not in imported_names]
    elif request.variant == "acapella":
        tracks = [track for track in tracks if track.name == "vocals.wav"]
    else:
        soloed = [track for track in tracks if track.solo and not track.muted]
        tracks = soloed or [track for track in tracks if not track.muted]
    sources = [(available[track.name], track) for track in tracks if available[track.name].is_file()]
    if not sources:
        raise HTTPException(409, "No audible stem lanes are available for this export")
    return sources


def _studio_effect_filters(filters: list[str], input_label: str, lane_index: int, track: StudioTrackState, offset: float) -> str:
    """Build non-destructive region effects and return the final FFmpeg label."""
    current = input_label
    for effect_index, effect in enumerate(track.effects):
        start = max(0.0, effect.start - offset); end = max(start + 0.001, effect.end - offset)
        window = f"between(t,{start:.5f},{end:.5f})"
        out = f"fx{lane_index}_{effect_index}"
        amount = max(0.0, min(1.0, effect.amount))
        if effect.kind in {"gain_up", "gain_down"}:
            gain = 1.0 + amount * 1.5 if effect.kind == "gain_up" else 1.0 - amount * .85
            filters.append(f"[{current}]volume={gain:.5f}:enable='{window}'[{out}]")
        elif effect.kind == "clarity":
            low = 1.0 + amount * 2.0; presence = 2.0 + amount * 4.0; air = 1.0 + amount * 3.0
            filters.append(f"[{current}]bass=g={low:.3f}:f=140:enable='{window}',equalizer=f=2600:t=q:w=1.1:g={presence:.3f}:enable='{window}',treble=g={air:.3f}:f=6500:enable='{window}'[{out}]")
        elif effect.kind == "auto_level":
            filters.append(f"[{current}]dynaudnorm=f=150:g={8.0 + amount * 17.0:.3f}:p=0.95:m=10:enable='{window}'[{out}]")
        elif effect.kind in {"echo", "reverb"}:
            dry = f"fxdry{lane_index}_{effect_index}"; wet_in = f"fxin{lane_index}_{effect_index}"; wet = f"fxwet{lane_index}_{effect_index}"
            filters.append(f"[{current}]asplit=2[{dry}][{wet_in}]")
            if effect.kind == "echo":
                delays = "180|360"; decay = f"{0.18 + amount * .32:.3f}|{0.08 + amount * .22:.3f}"; wet_gain = 0.12 + amount * .24
            else:
                delays = "28|47|71|103"; decay = f"{0.20 + amount * .18:.3f}|{0.15 + amount * .16:.3f}|{0.11 + amount * .13:.3f}|{0.07 + amount * .10:.3f}"; wet_gain = 0.08 + amount * .19
            filters.append(f"[{wet_in}]volume=0:enable='not({window})',aecho=0.8:{wet_gain:.3f}:{delays}:{decay}[{wet}]")
            filters.append(f"[{dry}][{wet}]amix=inputs=2:duration=longest:normalize=0[{out}]")
        elif effect.kind in {"normalize", "compressor"}:
            dry_in = f"fxkeepin{lane_index}_{effect_index}"; process_in = f"fxprocessin{lane_index}_{effect_index}"
            keep = f"fxkeep{lane_index}_{effect_index}"; processed = f"fxprocessed{lane_index}_{effect_index}"
            filters.append(f"[{current}]asplit=2[{dry_in}][{process_in}]")
            filters.append(f"[{dry_in}]volume=0:enable='{window}'[{keep}]")
            if effect.kind == "normalize":
                processor = "loudnorm=I=-16:TP=-1.5:LRA=11"
            else:
                ratio = 2.0 + amount * 6.0; threshold = 0.25 - amount * .15
                processor = f"acompressor=threshold={threshold:.3f}:ratio={ratio:.3f}:attack=15:release=180:makeup={1.0 + amount * .8:.3f}"
            filters.append(f"[{process_in}]volume=0:enable='not({window})',{processor}[{processed}]")
            filters.append(f"[{keep}][{processed}]amix=inputs=2:duration=longest:normalize=0[{out}]")
        else:
            continue
        current = out
    return current


@app.post("/api/library/{folder}/studio/bounce")
def bounce_studio_mix(folder: str, request: StudioBounceRequest):
    song_dir = resolve_song_folder(folder); manifest, metadata = _studio_manifest(song_dir)
    ffmpeg = ffmpeg_path()
    if not ffmpeg: raise HTTPException(409, "FFmpeg is not installed")
    sources = _studio_sources(song_dir, metadata, request)
    mix_dir = song_dir / "mixes"; mix_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    target = mix_dir / f"{request.variant}_mix_{stamp}.wav"
    command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y"]
    for source, _track in sources: command += ["-i", str(source)]
    filters = []
    for index, (_source, track) in enumerate(sources):
        clips = resolve_studio_clips(track)
        if track.use_clips or bool(track.clips):
            if not clips:
                filters.append(f"[{index}:a]volume=0,atrim=end=0.05[{f'rawlane{index}'}]")
                raw_label = f"rawlane{index}"
                offset = 0.0
            else:
                raw_label = _studio_clip_chain(index, track, clips, filters)
                offset = 0.0
        else:
            offset = max(0.0, track.offset)
            trim_start = max(0.0, track.trim_start - offset)
            trim_end = max(trim_start, track.trim_end - offset) if track.trim_end is not None else None
            chain = [f"volume={track.gain:.5f}"]
            if trim_start > 0: chain.append(f"volume=0:enable='lt(t,{trim_start:.5f})'")
            if trim_end is not None: chain.append(f"volume=0:enable='gt(t,{trim_end:.5f})'")
            for cut in track.cuts:
                start = max(0.0, cut.start - offset); end = max(start, cut.end - offset)
                chain.append(f"volume=0:enable='between(t,{start:.5f},{end:.5f})'")
            if track.fade_in > 0: chain.append(f"afade=t=in:st={trim_start:.5f}:d={track.fade_in:.5f}")
            if track.fade_out > 0 and trim_end is not None:
                chain.append(f"afade=t=out:st={max(trim_start, trim_end - track.fade_out):.5f}:d={track.fade_out:.5f}")
            if offset > 0: chain.append(f"adelay={round(offset * 1000)}:all=1")
            raw_label = f"rawlane{index}"
            filters.append(f"[{index}:a]{','.join(chain)}[{raw_label}]")
        effected = _studio_effect_filters(filters, raw_label, index, track, offset)
        if effected != f"lane{index}": filters.append(f"[{effected}]anull[lane{index}]")
    inputs = "".join(f"[lane{index}]" for index in range(len(sources)))
    if len(sources) == 1:
        filters.append(f"{inputs}alimiter=limit=0.98[out]")
    else:
        filters.append(f"{inputs}amix=inputs={len(sources)}:duration=longest:normalize=0,alimiter=limit=0.98[out]")
    if request.selection is not None:
        filters.append(f"[out]atrim=start={request.selection.start:.5f}:end={request.selection.end:.5f},asetpts=PTS-STARTPTS[selected]")
        output_label = "[selected]"
    else:
        output_label = "[out]"
    command += ["-filter_complex", ";".join(filters), "-map", output_label, "-c:a", "pcm_s16le", str(target)]
    result = subprocess.run(command, capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    if result.returncode != 0 or not target.is_file():
        raise HTTPException(409, result.stderr.strip() or "Could not build the studio mix")
    entry = {"file": target.name, "variant": request.variant, "created_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    metadata.setdefault("studio_mixes", []).append(entry)
    metadata["studio"] = {"tracks": [track.model_dump() for track in request.tracks], "updated_at": entry["created_at"]}
    manifest.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"download_url": f"/api/library/{song_dir.name}/studio/mixes/{target.name}", "filename": f"{download_filename(song_dir, '')}-{request.variant}.wav"}


@app.get("/api/library/{folder}/studio/mixes/{filename}")
def studio_mix_file(folder: str, filename: str):
    song_dir = resolve_song_folder(folder)
    if Path(filename).name != filename: raise HTTPException(404, "Studio mix not found")
    root = (song_dir / "mixes").resolve(); target = (root / filename).resolve()
    if target.parent != root or not target.is_file(): raise HTTPException(404, "Studio mix not found")
    return FileResponse(target, media_type="audio/wav", filename=filename)


@app.get("/api/library/{folder}/studio/tracks/{filename}")
def studio_track_file(folder: str, filename: str):
    song_dir = resolve_song_folder(folder)
    if Path(filename).name != filename: raise HTTPException(404, "Studio track not found")
    root = (song_dir / "studio" / "tracks").resolve(); target = (root / filename).resolve()
    if target.parent != root or not target.is_file(): raise HTTPException(404, "Studio track not found")
    return FileResponse(target, media_type="audio/wav", filename=filename)


@app.delete("/api/library/{folder}/studio/tracks/{filename}")
def remove_studio_track(folder: str, filename: str):
    song_dir = resolve_song_folder(folder); manifest, metadata = _studio_manifest(song_dir)
    if Path(filename).name != filename: raise HTTPException(404, "Studio track not found")
    imports = metadata.get("studio_imports") or []
    entry = next((item for item in imports if isinstance(item, dict) and item.get("file") == filename), None)
    if entry is None: raise HTTPException(404, "Studio track not found")
    (song_dir / "studio" / "tracks" / filename).unlink(missing_ok=True)
    original = str(entry.get("original") or "")
    if original and Path(original).name == original: (song_dir / "studio" / "imports" / original).unlink(missing_ok=True)
    metadata["studio_imports"] = [item for item in imports if item is not entry]
    if isinstance(metadata.get("studio"), dict):
        metadata["studio"]["tracks"] = [track for track in metadata["studio"].get("tracks", []) if track.get("name") != filename]
    manifest.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"removed": True}


def synchronize_song_lyrics(job: Job) -> dict:
    song_dir = resolve_song_folder(str(job.params["folder"]))
    try:
        metadata = json.loads((song_dir / "song.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError("Song details could not be read") from exc
    return lyrics_sync.run(job, song_dir, metadata)


@app.post("/api/library/{folder}/lyrics-sync")
def start_lyrics_synchronization(folder: str):
    song_dir = resolve_song_folder(folder)
    try:
        metadata = json.loads((song_dir / "song.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(404, "Song details not found") from exc
    if metadata.get("instrumental") or not str(metadata.get("lyrics") or "").strip():
        raise HTTPException(409, "This song does not have lyrics to synchronize")
    state = lyrics_sync.status()
    if not state["ready"]:
        raise HTTPException(409, state["detail"])
    job = manager.submit("lyrics_sync", {"folder": folder}, synchronize_song_lyrics)
    return {"job": job.snapshot()}


@app.get("/api/library/{folder}/stems/{filename}")
def stem_file(folder: str, filename: str):
    song_dir = resolve_song_folder(folder)
    if Path(filename).name != filename: raise HTTPException(404, "Stem not found")
    root = (song_dir / "stems" / "htdemucs").resolve(); target = (root / filename).resolve()
    if target.parent != root or not target.is_file(): raise HTTPException(404, "Stem not found")
    return FileResponse(target, media_type="audio/wav", filename=f"{slug(song_dir.name)}-{target.name}")


@app.post("/api/library/{folder}/open")
def open_song_folder(folder: str):
    target = resolve_song_folder(folder)
    os.startfile(target)
    return {"path": str(target)}


@app.delete("/api/library/{folder}")
def delete_song(folder: str):
    target = resolve_song_folder(folder)
    title = target.name
    try:
        deleted_song_id = str(json.loads((target / "song.json").read_text(encoding="utf-8")).get("id") or "")
    except (OSError, json.JSONDecodeError):
        deleted_song_id = ""
    last_error: OSError | None = None
    for attempt in range(8):
        try:
            shutil.rmtree(target)
            last_error = None
            break
        except FileNotFoundError:
            last_error = None
            break
        except OSError as error:
            last_error = error
            if attempt < 7:
                time.sleep(0.15 * (attempt + 1))
    if last_error is not None:
        log.warning("Could not delete Music 3 song %s because a file is still open: %s", title, last_error)
        raise HTTPException(409, "The song is still open. Stop playback, close Studio, and try again.") from last_error
    if deleted_song_id:
        playlists = load_playlists()
        changed = False
        for playlist in playlists:
            filtered = [song_id for song_id in playlist["song_ids"] if song_id != deleted_song_id]
            changed = changed or len(filtered) != len(playlist["song_ids"])
            playlist["song_ids"] = filtered
        if changed: save_playlists(playlists)
        workspaces = load_workspaces()
        workspace_changed = False
        for workspace in workspaces:
            filtered = [song_id for song_id in workspace["song_ids"] if song_id != deleted_song_id]
            workspace_changed = workspace_changed or len(filtered) != len(workspace["song_ids"])
            workspace["song_ids"] = filtered
        if workspace_changed: save_workspaces(workspaces)
    log.info("Deleted Music 3 song: %s", title)
    return {"deleted": True}

@app.get("/api/library/{folder}/{filename}")
def library_file(folder: str, filename: str):
    song_dir = resolve_song_folder(folder)
    target = (song_dir / filename).resolve()
    if target.parent != song_dir.resolve() or not target.is_file(): raise HTTPException(404, "Audio not found")
    media = {".png": "image/png", ".mp3": "audio/mpeg", ".flac": "audio/flac"}.get(target.suffix.lower(), "audio/wav")
    attachment_name = download_filename(song_dir, target.suffix) if target.suffix.lower() in {".wav", ".mp3", ".flac"} else target.name
    return FileResponse(target, media_type=media, filename=attachment_name)

@app.get("/api/logs")
def logs(limit: int = 500, since_id: int | None = None):
    latest = ring.snapshot(limit=limit)
    reset = bool(since_id is not None and latest and latest[-1]["id"] < since_id)
    items = latest if reset else ring.snapshot(limit=limit, since_id=since_id)
    return {
        "items": items,
        "last_id": items[-1]["id"] if items else (latest[-1]["id"] if latest else -1),
        "reset": reset,
    }

@app.post("/api/logs/clear")
def clear_logs(): ring.clear(); return {"cleared": True}

@app.post("/api/open-outputs")
def open_outputs(): OUTPUTS_ROOT.mkdir(parents=True, exist_ok=True); os.startfile(OUTPUTS_ROOT); return {"path": str(OUTPUTS_ROOT)}


atexit.register(music3_engine.unload)

if __name__ == "__main__":
    OUTPUTS_ROOT.mkdir(parents=True, exist_ok=True)
    uvicorn.run(app, host=SIDECAR_HOST, port=SIDECAR_PORT, log_level="info")
