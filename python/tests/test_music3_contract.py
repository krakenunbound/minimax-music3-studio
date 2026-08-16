from __future__ import annotations

import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import music3_engine
import cover_art


class Music3ContractTests(unittest.TestCase):
    def test_worker_progress_survives_tqdm_prefix(self):
        line = 'AR sampling: 42%|####2| MUSIC3_PROGRESS {"progress": 0.42}'
        self.assertEqual('{"progress": 0.42}', music3_engine._worker_event(line, "MUSIC3_PROGRESS"))

    def test_bare_worker_progress_marker_is_ignored(self):
        self.assertIsNone(music3_engine._worker_event("MUSIC3_PROGRESS", "MUSIC3_PROGRESS"))

    def test_payload_free_done_signal_is_handled_separately(self):
        source = Path(music3_engine.__file__).read_text(encoding="utf-8")
        self.assertIn('line.strip() == "MUSIC3_DONE"', source)
        self.assertNotIn('_worker_event(line, "MUSIC3_DONE")', source)

    def test_cancel_can_terminate_worker_during_startup(self):
        released = threading.Event()

        class Stream:
            def readline(self):
                released.wait(2)
                return ""

        class Process:
            pid = 12345
            stdout = Stream()
            stdin = None
            stopped = False
            def poll(self): return 1 if self.stopped else None
            def wait(self, timeout=None): self.stopped = True; return 1
            def kill(self): self.stopped = True; released.set()

        process = Process()
        failures = []
        def start():
            try: music3_engine._start(threading.Event())
            except RuntimeError as error: failures.append(str(error))
        def taskkill(*_args, **_kwargs):
            process.stopped = True; released.set()
            return type("Result", (), {"returncode": 0})()

        with patch.object(music3_engine, "WORKER_PYTHON", Path(__file__)), patch.object(music3_engine.subprocess, "Popen", return_value=process), patch.object(music3_engine.subprocess, "run", side_effect=taskkill):
            thread = threading.Thread(target=start)
            thread.start()
            deadline = time.monotonic() + 1
            while music3_engine._PROCESS is not process and time.monotonic() < deadline:
                time.sleep(0.01)
            started = time.monotonic()
            music3_engine.cancel()
            self.assertLess(time.monotonic() - started, 1.0)
            thread.join(2)
        music3_engine._PROCESS = None
        self.assertFalse(thread.is_alive())

    def test_worker_receives_top_k_variation_control(self):
        root = Path(__file__).resolve().parents[1]
        worker = (root / "music3_worker.py").read_text(encoding="utf-8")
        engine = (root / "music3_engine.py").read_text(encoding="utf-8")
        self.assertIn('"top_k": int(request.get("top_k", 50))', worker)
        self.assertIn('"top_k": int(request.get("top_k", 50))', engine)
        self.assertIn("if not isinstance(caption, str) or not isinstance(lyrics, str)", worker)
        self.assertIn("combined_prompt = str(build_prompt(str(caption), str(lyrics)))", worker)

    def test_cover_renderer_has_anatomy_guard_and_step_progress(self):
        root = Path(__file__).resolve().parents[1]
        renderer = (root / "cover_art_renderer.py").read_text(encoding="utf-8")
        bridge = (root / "cover_art.py").read_text(encoding="utf-8")
        self.assertIn("extra limbs", renderer)
        self.assertIn("COVER_PROGRESS", renderer)
        self.assertIn("progress_base + progress_span", bridge)

    def test_stem_runner_uses_parseable_progress_and_local_model(self):
        root = Path(__file__).resolve().parents[1]
        runner = (root / "demucs_runner.py").read_text(encoding="utf-8")
        studio = (root / "main.py").read_text(encoding="utf-8")
        self.assertIn("STEM_PROGRESS", runner)
        self.assertIn('STEMS_ROOT', studio)
        self.assertIn('"--repo", str(STEMS_ROOT)', studio)

    def test_player_does_not_reroute_native_audio_through_web_audio(self):
        app = (Path(__file__).resolve().parents[2] / "src" / "App.tsx").read_text(encoding="utf-8")
        self.assertIn("captureStream", app)
        self.assertNotIn("createMediaElementSource", app)
        self.assertIn("Stop and return to 0:00", app)
        self.assertIn("element.currentTime = 0", app)

    def test_song_studio_uses_existing_stems_instead_of_an_audiomass_iframe(self):
        root = Path(__file__).resolve().parents[2]
        app = (root / "src" / "App.tsx").read_text(encoding="utf-8")
        studio = (root / "src" / "SongStudio.tsx").read_text(encoding="utf-8")
        self.assertIn("<SongStudio", app)
        self.assertIn('extractStems(songFolderName(song), "4")', app)
        self.assertNotIn('<iframe title={`Audio Editor', app)
        for feature in ("Original mix", "Mute", "solo", "Export custom mix", "Instrumental", "Acapella"):
            self.assertIn(feature.casefold(), studio.casefold())

    def test_studio_spectrum_stays_in_app_without_popup(self):
        studio = (Path(__file__).resolve().parents[2] / "src" / "SongStudio.tsx").read_text(encoding="utf-8")
        self.assertIn("function Spectrum", studio)
        self.assertIn("captureStream", studio)
        self.assertIn("stream.getAudioTracks().length === 0", studio)
        self.assertIn('audio.addEventListener("playing", connect)', studio)
        self.assertNotIn("window.open", studio)

    def test_studio_failure_is_contained_instead_of_blanking_the_application(self):
        studio = (Path(__file__).resolve().parents[2] / "src" / "SongStudio.tsx").read_text(encoding="utf-8")
        self.assertIn("class StudioCrashBoundary", studio)
        self.assertIn("static getDerivedStateFromError", studio)
        self.assertIn("Studio could not open", studio)
        self.assertIn("<StudioCrashBoundary", studio)

    def test_studio_exposes_local_multitrack_editing_without_a_track_cap(self):
        root = Path(__file__).resolve().parents[2]
        studio = (root / "src" / "SongStudio.tsx").read_text(encoding="utf-8")
        api = (root / "src" / "api.ts").read_text(encoding="utf-8")
        backend = (root / "python" / "main.py").read_text(encoding="utf-8")
        for feature in ("Add track", "Fade in", "Fade out", "Trim song", "Mute range", "Export range", "Undo", "Redo", "This lane", "All lanes", "Echo", "Reverb", "Auto level", "Normalize", "Louder", "Quieter", "Razor", "Insert space", "EFFECTS & SOUNDS", "From your library", "Start of song", "Start of clip or range", "L/R split", "studio-ruler"):
            self.assertIn(feature, studio)
        self.assertIn("offset: position", studio)
        effects_page = (root / "src" / "EffectsPage.tsx").read_text(encoding="utf-8")
        self.assertIn("Open Studio", effects_page)
        self.assertIn("importStudioTrack", api)
        self.assertIn("studio/import", backend)
        self.assertIn("tracks: list[StudioTrackState] = Field(default_factory=list)", backend)
        self.assertNotIn("tracks: list[StudioTrackState] = Field(default_factory=list, max_length", backend)

    def test_library_cards_reserve_full_left_edge_for_larger_art(self):
        css = (Path(__file__).resolve().parents[2] / "src" / "App.css").read_text(encoding="utf-8")
        self.assertIn("grid-template-columns:132px minmax(0,1fr) 42px", css)
        self.assertIn("grid-row:1/3", css)
        self.assertIn("grid-column:2/4", css)

    def test_library_stem_branch_exposes_stems_and_moves_them_to_studio(self):
        root = Path(__file__).resolve().parents[2]
        app = (root / "src" / "App.tsx").read_text(encoding="utf-8")
        css = (root / "src" / "App.css").read_text(encoding="utf-8")
        self.assertIn('title="Stems"', app)
        self.assertIn('className="stem-tree-icon"', app)
        self.assertIn("Move stems to Studio", app)
        self.assertIn("void openAudioEditor(song)", app)
        self.assertIn(".stem-branch-panel{", css)

    def test_karaoke_player_uses_continuous_timing_and_one_lyric_layer(self):
        root = Path(__file__).resolve().parents[2]
        app = (root / "src" / "App.tsx").read_text(encoding="utf-8")
        css = (root / "src" / "App.css").read_text(encoding="utf-8")
        self.assertIn("function KaraokeLyrics", app)
        self.assertIn("requestAnimationFrame", app)
        self.assertIn('className="karaoke-track"', app)
        self.assertIn('className="karaoke-translation"', app)
        self.assertEqual(1, css.count(".karaoke-track{"))

    def test_karaoke_panel_has_a_persistent_collapse_toggle(self):
        app = (Path(__file__).resolve().parents[2] / "src" / "App.tsx").read_text(encoding="utf-8")
        self.assertIn('className={`transport-lyrics', app)
        self.assertIn('localStorage.setItem("music3-lyrics-visible"', app)
        self.assertIn('lyricsVisible && <KaraokeLyrics', app)
        self.assertIn('aria-pressed={lyricsVisible && hasTimedLyrics}', app)

    def test_karaoke_does_not_highlight_upcoming_lines_during_instrumental_gaps(self):
        app = (Path(__file__).resolve().parents[2] / "src" / "App.tsx").read_text(encoding="utf-8")
        self.assertIn("const performingIndex = lines.findIndex", app)
        self.assertIn("let focusIndex = performingIndex", app)
        self.assertIn('index === performingIndex ? "active"', app)
        self.assertNotIn('index === activeIndex ? "active"', app)

    def test_lyrics_sync_is_local_and_optional(self):
        root = Path(__file__).resolve().parents[2]
        setup = (root / "Setup Lyrics Sync.bat").read_text(encoding="utf-8")
        bridge = (root / "python" / "lyrics_sync.py").read_text(encoding="utf-8")
        self.assertIn("whisperx==3.8.4", setup)
        self.assertIn('ROOT / "models" / "lyrics"', bridge)
        self.assertIn('"HF_HOME"', bridge)
        self.assertNotIn("http://127.0.0.1", bridge)

    def test_prompt_presets_wrap_without_an_overlapping_scrollbar(self):
        css = (Path(__file__).resolve().parents[2] / "src" / "App.css").read_text(encoding="utf-8")
        helper_rule = css.split(".helper-presets{", 1)[1].split("}", 1)[0]
        self.assertIn("flex-wrap:wrap", helper_rule)
        self.assertIn("overflow:visible", helper_rule)
        self.assertNotIn("overflow-x:auto", helper_rule)

    def test_memory_button_color_reflects_loaded_state(self):
        root = Path(__file__).resolve().parents[2]
        app = (root / "src" / "App.tsx").read_text(encoding="utf-8")
        css = (root / "src" / "App.css").read_text(encoding="utf-8")
        self.assertIn('status?.service.worker_loaded ? "memory-loaded" : "memory-empty"', app)
        self.assertIn(".memory-loaded{border-color:#ff5470", css)
        self.assertIn(".memory-empty,.memory-empty:disabled{border-color:#54e0a0", css)

    def test_cover_model_has_one_canonical_local_path(self):
        self.assertEqual("juggernaut_aftermath.safetensors", cover_art.MODEL.name)
        self.assertEqual("cover_art", cover_art.MODEL.parent.name)
        self.assertEqual("models", cover_art.MODEL.parent.parent.name)
        self.assertNotIn("Kraken_Audio", str(cover_art.MODEL))

    def test_optimized_model_contract_has_only_three_files(self):
        self.assertEqual(set(music3_engine.MODEL_FILES), {"diffusion", "text_encoder", "decoder"})
        self.assertTrue(str(music3_engine.MODEL_FILES["diffusion"]).endswith("minimax_music3_dit_int8_convrot.safetensors"))
        self.assertTrue(str(music3_engine.MODEL_FILES["text_encoder"]).endswith("minimax_music3_text_encoder_pruned_int8_convrot.safetensors"))
        self.assertTrue(str(music3_engine.MODEL_FILES["decoder"]).endswith("minimax_music3_dav.safetensors"))

    def test_model_status_requires_each_component(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            paths = {
                "diffusion": root / "d.safetensors",
                "text_encoder": root / "t.safetensors",
                "decoder": root / "v.safetensors",
            }
            paths["diffusion"].write_bytes(b"d")
            with patch.dict(music3_engine.MODEL_FILES, paths, clear=True):
                status = music3_engine.model_status()
            self.assertFalse(status["ready"])
            self.assertEqual(status["present"], 1)
            self.assertEqual(status["missing"], ["text_encoder", "decoder"])

    def test_runtime_is_explicitly_standalone(self):
        self.assertIs(music3_engine.runtime_status()["standalone"], True)

    def test_frontend_accepts_official_caption_headings_and_keeps_jobs_separate(self):
        app = (Path(__file__).resolve().parents[2] / "src" / "App.tsx").read_text(encoding="utf-8")
        self.assertIn("function isStructuredCaption", app)
        self.assertIn("#{1,6}", app)
        self.assertIn("const [generationJob", app)
        self.assertIn("const [utilityJob", app)
        self.assertIn("create-job-banner", app)
        self.assertNotIn("const [job, setJob]", app)

    def test_reference_cfg_and_complete_reuse_settings_are_wired(self):
        app = (Path(__file__).resolve().parents[2] / "src" / "App.tsx").read_text(encoding="utf-8")
        self.assertIn("const cfg = 1.0 + (directionStrength / 100)", app)
        for setting in ("setLockedSeed", "setAutoDuration", "setSteps", "setDirectionStrength", "setCreativeLatitude", "setTiledDecode", "setExcludeStyles", "setVocalGender"):
            self.assertIn(setting, app)

    def test_sidecar_spawn_errors_have_a_persistent_diagnostic_command(self):
        host = (Path(__file__).resolve().parents[2] / "src-tauri" / "src" / "lib.rs").read_text(encoding="utf-8")
        self.assertIn("fn sidecar_error", host)
        self.assertIn('handle.emit("sidecar-error"', host)

    def test_generation_controls_are_applied_to_structured_conditioning(self):
        app = (Path(__file__).resolve().parents[2] / "src" / "App.tsx").read_text(encoding="utf-8")
        self.assertIn("function applyDescriptionControls", app)
        self.assertIn("Principal Lead Gender Override", app)
        self.assertIn("User Exclusions", app)
        self.assertIn("instrumental: true", app)

    def test_more_options_uses_a_real_control_icon_and_animated_chevron(self):
        root = Path(__file__).resolve().parents[2]
        app = (root / "src" / "App.tsx").read_text(encoding="utf-8")
        css = (root / "src" / "App.css").read_text(encoding="utf-8")
        self.assertIn('className="options-sliders"', app)
        self.assertIn('className="options-chevron"', app)
        self.assertIn('aria-expanded={moreOptions}', app)
        self.assertNotIn('{moreOptions ? "⌃" : "⌄"}', app)
        self.assertIn(".more-options-button.open .options-chevron", css)

    def test_create_progress_stays_above_the_form_and_translation_does_not_overflow(self):
        root = Path(__file__).resolve().parents[2]
        app = (root / "src" / "App.tsx").read_text(encoding="utf-8")
        css = (root / "src" / "App.css").read_text(encoding="utf-8")
        create_section = app.split('className={`composer main-view', 1)[1].split('className={`library-pane', 1)[0]
        self.assertLess(create_section.index("create-job-banner"), create_section.index("create-grid"))
        self.assertIn(".create-job-banner{position:sticky", css)
        self.assertIn(".translation-grid textarea{height:auto;min-height:110px}", css)
        self.assertNotIn(".create-lyrics label,.create-lyrics textarea{height:100%}", css)

    def test_job_timing_shows_elapsed_beside_remaining_prediction(self):
        app = (Path(__file__).resolve().parents[2] / "src" / "App.tsx").read_text(encoding="utf-8")
        self.assertIn("function elapsedLabel(job: Job)", app)
        self.assertIn("function remainingLabel(job: Job)", app)
        self.assertIn('`${elapsedLabel(job)} elapsed · ${remaining}`', app)
        self.assertIn("<span>elapsed</span><b>{elapsedLabel(displayJob)}</b>", app)
        self.assertIn("<span>remaining</span><b>{remainingLabel(displayJob)", app)

    def test_setup_contract_includes_private_ffmpeg_and_correct_model_layout(self):
        root = Path(__file__).resolve().parents[2]
        requirements = (root / "python" / "requirements.txt").read_text(encoding="utf-8")
        sources = (root / "MODEL_SOURCES.md").read_text(encoding="utf-8")
        self.assertIn("imageio-ffmpeg", requirements)
        self.assertIn("diffusion_models/minimax_music3_dit_int8_convrot.safetensors", sources)
        self.assertIn("does not load the original 53.2 GiB layout", sources)


if __name__ == "__main__":
    unittest.main()
