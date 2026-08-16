import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { audioUrl, bounceStudioMix, cancelJob, downloadUrl, generateStudioSound, getJob, importStudioTrack, removeStudioTrack, saveStudioSession, type Job, type Song, type StudioEffectKind, type StudioRange, type StudioTrackState } from "./api";

type Track = { id: string; name: string; file: string; url: string; color: string; reference?: boolean; imported?: boolean };
type TrackGraph = { source: MediaElementAudioSourceNode; low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode; compressor: DynamicsCompressorNode; output: GainNode; echoDelay: DelayNode; echoFeedback: GainNode; echoWet: GainNode; reverb: ConvolverNode; reverbWet: GainNode };
type Props = {
  song: Song;
  mixUrl: string;
  stemJob: Job | null;
  stemsReady: boolean;
  soundEffectsReady: boolean;
  soundEffectsDetail: string;
  onStartStems: () => void;
  onClose: () => void;
};

const COLORS: Record<string, string> = {
  vocals: "#4c9dff", drums: "#ff7a32", bass: "#d33b89", other: "#8d63ff",
  no_vocals: "#16c98d", mix: "#b8a9a1",
};
const EFFECT_LABELS: Record<StudioEffectKind, string> = { gain_up: "Louder", gain_down: "Quieter", echo: "Echo", reverb: "Reverb", auto_level: "Auto level", normalize: "Normalize", clarity: "Clarity EQ", compressor: "Compressor" };

function labelFor(file: string) {
  const stem = file.replace(/\.wav$/i, "");
  if (stem === "no_vocals") return "Instrumental";
  if (stem === "other") return "Other · guitars, keys, synths and FX";
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

function clock(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Waveform({ peaks, color }: { peaks?: number[]; color: string }) {
  if (!peaks?.length) return <div className="studio-wave-loading"><i /><i /><i /><i /><i /></div>;
  const width = 1000; const height = 72; const middle = height / 2;
  const top = peaks.map((peak, index) => `${index * width / Math.max(1, peaks.length - 1)},${middle - peak * 31}`).join(" ");
  const bottom = [...peaks].reverse().map((peak, reverseIndex) => {
    const index = peaks.length - reverseIndex - 1;
    return `${index * width / Math.max(1, peaks.length - 1)},${middle + peak * 31}`;
  }).join(" ");
  return <svg className="studio-wave" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><polygon points={`${top} ${bottom}`} fill={color} /></svg>;
}

function Spectrum({ audio, color }: { audio: HTMLAudioElement | null; color: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const surface = canvas.current;
    if (!audio || !surface) return;
    type Capturable = HTMLAudioElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
    let context: AudioContext | null = null; let analyser: AnalyserNode | null = null; let source: MediaStreamAudioSourceNode | null = null; let frame = 0;
    let values: Uint8Array<ArrayBuffer> | null = null; const paint = surface.getContext("2d");
    const draw = () => {
      frame = requestAnimationFrame(draw); if (!analyser || !values) return; analyser.getByteFrequencyData(values);
      const ratio = window.devicePixelRatio || 1; const width = surface.clientWidth; const height = surface.clientHeight;
      if (surface.width !== width * ratio || surface.height !== height * ratio) { surface.width = width * ratio; surface.height = height * ratio; paint?.setTransform(ratio, 0, 0, ratio, 0, 0); }
      if (!paint) return; paint.clearRect(0, 0, width, height);
      const bars = 48; const gap = 3; const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
      const gradient = paint.createLinearGradient(0, height, width, 0); gradient.addColorStop(0, color); gradient.addColorStop(.65, "#55e6ee"); gradient.addColorStop(1, "#b654ff"); paint.fillStyle = gradient;
      for (let index = 0; index < bars; index += 1) { const value = values[Math.floor(index * values.length / bars)] / 255; const barHeight = Math.max(2, value * (height - 8)); paint.fillRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight); }
    };
    const connect = () => {
      if (context) return;
      try {
        const stream = (audio as Capturable).captureStream?.() ?? (audio as Capturable).mozCaptureStream?.();
        if (!stream || stream.getAudioTracks().length === 0) return;
        const nextContext = new AudioContext(); const nextAnalyser = nextContext.createAnalyser(); nextAnalyser.fftSize = 256; nextAnalyser.smoothingTimeConstant = .82;
        const nextSource = nextContext.createMediaStreamSource(stream); nextSource.connect(nextAnalyser);
        context = nextContext; analyser = nextAnalyser; source = nextSource; values = new Uint8Array(nextAnalyser.frequencyBinCount);
        void nextContext.resume(); draw();
      } catch (error) {
        console.warn("Studio spectrum is unavailable for this audio stream.", error);
      }
    };
    audio.addEventListener("play", connect); audio.addEventListener("playing", connect);
    if (!audio.paused) connect();
    return () => {
      audio.removeEventListener("play", connect); audio.removeEventListener("playing", connect); cancelAnimationFrame(frame);
      try { source?.disconnect(); analyser?.disconnect(); } catch { /* already disconnected */ }
      if (context) void context.close();
    };
  }, [audio, color]);
  return <canvas ref={canvas} className="studio-spectrum" />;
}

class StudioCrashBoundary extends Component<{ children: ReactNode; onClose: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("The local Studio encountered an error.", error, info); }
  render() {
    if (this.state.error) return <section className="song-studio studio-recovery" role="dialog" aria-modal="true" aria-labelledby="studio-recovery-title"><div><div className="eyebrow">LOCAL MULTITRACK STUDIO</div><h2 id="studio-recovery-title">Studio could not open</h2><p>The song and its stems are safe. Close this panel and try opening Studio again.</p><button onClick={this.props.onClose}>Return to your songs</button></div></section>;
    return this.props.children;
  }
}

function SongStudioView({ song, mixUrl, stemJob, stemsReady, soundEffectsReady, soundEffectsDetail, onStartStems, onClose }: Props) {
  const folder = song.folder_name;
  const [tracks, setTracks] = useState<Track[]>([{ id: "mix", name: "Original mix", file: "song.wav", url: mixUrl, color: COLORS.mix, reference: true }]);
  const [settings, setSettings] = useState<Record<string, StudioTrackState>>({});
  const [peaks, setPeaks] = useState<Record<string, number[]>>({});
  const [selected, setSelected] = useState("mix");
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(song.duration ?? 0);
  const [trackDurations, setTrackDurations] = useState<Record<string, number>>({});
  const [selectionRange, setSelectionRange] = useState<StudioRange | null>(null);
  const [selectionScope, setSelectionScope] = useState<"lane" | "all">("lane");
  const [loopSelection, setLoopSelection] = useState(false);
  const [history, setHistory] = useState<Record<string, StudioTrackState>[]>([]);
  const [future, setFuture] = useState<Record<string, StudioTrackState>[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [sourceChooser, setSourceChooser] = useState(false);
  const [soundDialog, setSoundDialog] = useState(false);
  const [soundPrompt, setSoundPrompt] = useState("");
  const [soundName, setSoundName] = useState("");
  const [soundAvoid, setSoundAvoid] = useState("music, speech, singing, narration, clipping, distortion");
  const [soundDuration, setSoundDuration] = useState(5);
  const [soundSeed, setSoundSeed] = useState("");
  const [soundJob, setSoundJob] = useState<Job | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const audioContext = useRef<AudioContext | null>(null);
  const audioGraphs = useRef<Record<string, TrackGraph>>({});
  const animation = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const rangeAnchor = useRef<number | null>(null);
  const soundPlacement = useRef(0);
  const handledSoundJob = useRef("");
  const settingsRef = useRef(settings); const selectionRef = useRef(selectionRange); const loopRef = useRef(loopSelection);
  const hasStems = tracks.some((track) => !track.reference && !track.imported);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { selectionRef.current = selectionRange; }, [selectionRange]);
  useEffect(() => { loopRef.current = loopSelection; }, [loopSelection]);
  useEffect(() => () => { const context = audioContext.current; audioGraphs.current = {}; audioContext.current = null; if (context) void context.close(); }, []);

  useEffect(() => {
    let cancelled = false;
    const build = async () => {
      const files = song.stems ?? [];
      const stemTracks = await Promise.all(files.map(async (file) => ({
        id: file.replace(/\.wav$/i, ""), name: labelFor(file), file,
        url: await audioUrl(`/api/library/${encodeURIComponent(folder)}/stems/${encodeURIComponent(file)}`),
        color: COLORS[file.replace(/\.wav$/i, "")] ?? "#55e6ee",
      })));
      const importedTracks = await Promise.all((song.studio_imports ?? []).map(async (item, index) => ({
        id: `import-${item.file}`, name: item.name || `Imported track ${index + 1}`, file: item.file,
        url: await audioUrl(`/api/library/${encodeURIComponent(folder)}/studio/tracks/${encodeURIComponent(item.file)}`),
        color: ["#ffd166", "#ef6fff", "#4de3b1", "#ff8f70"][index % 4], imported: true,
      })));
      if (!cancelled) setTracks([{ id: "mix", name: "Original mix", file: "song.wav", url: mixUrl, color: COLORS.mix, reference: true }, ...stemTracks, ...importedTracks]);
    };
    void build(); return () => { cancelled = true; };
  }, [folder, mixUrl, song.stems, song.studio_imports]);

  useEffect(() => {
    const stored = song.studio?.tracks ?? [];
    const next: Record<string, StudioTrackState> = {};
    setSettings((current) => {
      tracks.forEach((track) => {
      const prior = stored.find((item) => item.name === track.file);
        next[track.id] = prior ?? current[track.id] ?? { name: track.file, gain: 1, muted: Boolean(track.reference && hasStems), solo: false, offset: 0, trim_start: 0, trim_end: null, fade_in: 0, fade_out: 0, cuts: [], effects: [] };
      });
      return next;
    });
  }, [tracks, song.studio, hasStems]);

  useEffect(() => {
    let stopped = false;
    const createPeaks = async () => {
      const context = new AudioContext();
      for (const track of tracks) {
        try {
          const response = await fetch(track.url); const buffer = await context.decodeAudioData(await response.arrayBuffer());
          const data = buffer.getChannelData(0); const samples = 620; const block = Math.max(1, Math.floor(data.length / samples)); const points: number[] = [];
          for (let index = 0; index < samples; index += 1) { let maximum = 0; const start = index * block; const end = Math.min(data.length, start + block); for (let cursor = start; cursor < end; cursor += 24) maximum = Math.max(maximum, Math.abs(data[cursor])); points.push(Math.min(1, maximum)); }
          if (!stopped) setPeaks((current) => ({ ...current, [track.id]: points }));
          if (!stopped) setTrackDurations((current) => ({ ...current, [track.id]: buffer.duration }));
          if (!duration) setDuration(buffer.duration);
        } catch { /* the streamed audio remains usable even if waveform decoding fails */ }
      }
      void context.close();
    };
    void createPeaks(); return () => { stopped = true; };
  }, [tracks]);

  useEffect(() => {
    if (!soundJob || !["queued", "running"].includes(soundJob.status)) return;
    let stopped = false;
    const poll = async () => {
      try {
        const next = (await getJob(soundJob.id)).job;
        if (stopped) return;
        setSoundJob(next);
        if (next.status === "succeeded" && next.result && handledSoundJob.current !== next.id) {
          handledSoundJob.current = next.id;
          const generated = next.result as { file?: string; name: string; url?: string; seed: number; studio_track?: { file: string; name: string; url: string; seed: number } };
          const result = generated.studio_track ?? generated as { file: string; name: string; url: string; seed: number };
          const id = `import-${result.file}`;
          const url = await audioUrl(result.url);
          const track: Track = { id, name: result.name, file: result.file, url, color: ["#ffd166", "#ef6fff", "#4de3b1", "#ff8f70"][tracks.filter((item) => item.imported).length % 4], imported: true };
          setTracks((current) => [...current, track]);
          setSettings((current) => ({ ...current, [id]: { name: result.file, gain: 1, muted: false, solo: false, offset: soundPlacement.current, trim_start: soundPlacement.current, trim_end: null, fade_in: 0, fade_out: 0, cuts: [], effects: [] } }));
          setSelected(id); setMessage(`${result.name} generated locally and added at ${clock(soundPlacement.current)} · seed ${result.seed}.`);
          setSoundDialog(false); setSoundJob(null); setSoundPrompt(""); setSoundName(""); setSoundSeed("");
        }
      } catch (error: any) {
        if (!stopped) setMessage(error?.message ?? String(error));
      }
    };
    void poll(); const timer = window.setInterval(() => void poll(), 650);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [soundJob?.id, soundJob?.status, tracks]);

  const audible = useMemo(() => {
    const anySolo = Object.values(settings).some((item) => item.solo);
    return (track: Track) => {
      const state = settings[track.id];
      if (!state) return false;
      if (track.reference && hasStems) return false;
      return !state.muted && (!anySolo || state.solo);
    };
  }, [settings, hasStems]);

  useEffect(() => {
    tracks.forEach((track) => { const element = audioRefs.current[track.id]; const state = settings[track.id]; if (element && state) { element.volume = Math.min(1, state.gain); element.muted = !audible(track); } });
  }, [audible, settings, tracks]);

  const gainAt = (state: StudioTrackState | undefined, timelineTime: number, sourceDuration: number) => {
    if (!state) return 0;
    const offset = state.offset ?? 0; const localTime = timelineTime - offset;
    const trimStart = Math.max(0, (state.trim_start ?? 0) - offset); const trimEnd = state.trim_end == null ? sourceDuration : Math.max(trimStart, state.trim_end - offset);
    if (localTime < trimStart || localTime > trimEnd || (state.cuts ?? []).some((cut) => timelineTime >= cut.start && timelineTime <= cut.end)) return 0;
    let factor = 1;
    if ((state.fade_in ?? 0) > 0) factor = Math.min(factor, Math.max(0, (localTime - trimStart) / (state.fade_in ?? 1)));
    if ((state.fade_out ?? 0) > 0) factor = Math.min(factor, Math.max(0, (trimEnd - localTime) / (state.fade_out ?? 1)));
    return Math.min(1, Math.max(0, state.gain * factor));
  };

  const ensureAudioGraphs = () => {
    const context = audioContext.current ?? new AudioContext(); audioContext.current = context;
    tracks.forEach((track) => {
      const element = audioRefs.current[track.id]; if (!element || audioGraphs.current[track.id]) return;
      try {
        const source = context.createMediaElementSource(element);
        const low = context.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 140;
        const mid = context.createBiquadFilter(); mid.type = "peaking"; mid.frequency.value = 2600; mid.Q.value = 1.1;
        const high = context.createBiquadFilter(); high.type = "highshelf"; high.frequency.value = 6500;
        const compressor = context.createDynamicsCompressor(); compressor.threshold.value = 0; compressor.ratio.value = 1; compressor.attack.value = .015; compressor.release.value = .18;
        const output = context.createGain();
        const echoDelay = context.createDelay(1.2); echoDelay.delayTime.value = .24;
        const echoFeedback = context.createGain(); echoFeedback.gain.value = .25;
        const echoWet = context.createGain(); echoWet.gain.value = 0;
        const reverb = context.createConvolver(); const seconds = 1.5; const impulse = context.createBuffer(2, Math.round(context.sampleRate * seconds), context.sampleRate);
        for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) { const values = impulse.getChannelData(channel); for (let index = 0; index < values.length; index += 1) values[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / values.length, 2.7); }
        reverb.buffer = impulse; const reverbWet = context.createGain(); reverbWet.gain.value = 0;
        source.connect(low).connect(mid).connect(high).connect(compressor).connect(output).connect(context.destination);
        output.connect(echoDelay).connect(echoWet).connect(context.destination); echoDelay.connect(echoFeedback).connect(echoDelay);
        output.connect(reverb).connect(reverbWet).connect(context.destination);
        audioGraphs.current[track.id] = { source, low, mid, high, compressor, output, echoDelay, echoFeedback, echoWet, reverb, reverbWet };
      } catch (error) { console.warn(`Studio preview effects unavailable for ${track.name}.`, error); }
    });
    return context;
  };

  const updatePreviewEffects = (track: Track, timelineTime: number) => {
    const graph = audioGraphs.current[track.id]; const state = settingsRef.current[track.id]; const context = audioContext.current; if (!graph || !state || !context) return;
    const active = (state.effects ?? []).filter((effect) => timelineTime >= effect.start && timelineTime <= effect.end);
    const strongest = (kind: StudioEffectKind) => Math.max(0, ...active.filter((effect) => effect.kind === kind).map((effect) => effect.amount));
    const clarity = strongest("clarity"); const compression = strongest("compressor"); const echo = strongest("echo"); const reverb = strongest("reverb");
    const gainUp = active.filter((effect) => effect.kind === "gain_up").reduce((value, effect) => value * (1 + effect.amount * 1.5), 1);
    const gainDown = active.filter((effect) => effect.kind === "gain_down").reduce((value, effect) => value * (1 - effect.amount * .85), 1);
    const autoLevel = strongest("auto_level"); const normalize = strongest("normalize"); const peak = Math.max(.01, ...(peaks[track.id] ?? [.75]));
    const previewGain = Math.min(3, gainUp * gainDown * (1 + autoLevel * .55) * (normalize ? Math.min(2.5, .92 / peak) : 1));
    const now = context.currentTime; const set = (parameter: AudioParam, value: number, speed = .025) => parameter.setTargetAtTime(value, now, speed);
    set(graph.low.gain, clarity * 3); set(graph.mid.gain, clarity * 6); set(graph.high.gain, clarity * 4); set(graph.output.gain, previewGain);
    set(graph.compressor.threshold, compression ? -12 - compression * 24 : 0); set(graph.compressor.ratio, compression ? 2 + compression * 6 : 1);
    set(graph.echoDelay.delayTime, .18 + echo * .22); set(graph.echoFeedback.gain, echo ? .12 + echo * .4 : 0); set(graph.echoWet.gain, echo * .38, .08); set(graph.reverbWet.gain, reverb * .45, .08);
  };

  const follow = () => {
    if (audioContext.current) ensureAudioGraphs();
    const master = audioRefs.current.mix;
    if (master) {
      let timelineTime = master.currentTime || 0; const activeRange = selectionRef.current;
      if (loopRef.current && activeRange && timelineTime >= activeRange.end) {
        timelineTime = activeRange.start; master.currentTime = timelineTime;
      }
      setPosition(timelineTime);
      tracks.forEach((track) => {
        const element = audioRefs.current[track.id]; const state = settingsRef.current[track.id]; if (!element || !state) return;
        const offset = state.offset ?? 0; const localTime = Math.max(0, timelineTime - offset);
        if (track.id !== "mix" && Math.abs(element.currentTime - localTime) > .09) element.currentTime = Math.min(localTime, Number.isFinite(element.duration) ? element.duration : localTime);
        const gain = gainAt(state, timelineTime, trackDurations[track.id] ?? duration);
        element.volume = gain; element.muted = !audible(track) || gain <= .0001 || timelineTime < offset;
        updatePreviewEffects(track, timelineTime);
      });
      if (master.ended) setPlaying(false);
    }
    animation.current = requestAnimationFrame(follow);
  };

  useEffect(() => { animation.current = requestAnimationFrame(follow); return () => cancelAnimationFrame(animation.current); }, [tracks, trackDurations, duration, audible, peaks]);

  const togglePlayback = async () => {
    if (playing) { tracks.forEach((track) => audioRefs.current[track.id]?.pause()); setPlaying(false); return; }
    const context = ensureAudioGraphs(); await context.resume().catch(() => undefined);
    tracks.forEach((track) => { const element = audioRefs.current[track.id]; const offset = settingsRef.current[track.id]?.offset ?? 0; if (element) element.currentTime = Math.max(0, position - offset); });
    await Promise.all(tracks.map((track) => audioRefs.current[track.id]?.play().catch(() => undefined)));
    setPlaying(true);
  };
  const stop = () => { tracks.forEach((track) => { const element = audioRefs.current[track.id]; if (element) { element.pause(); element.currentTime = 0; } }); setPosition(0); setPlaying(false); };
  const seek = (value: number) => { tracks.forEach((track) => { const element = audioRefs.current[track.id]; const offset = settingsRef.current[track.id]?.offset ?? 0; if (element) element.currentTime = Math.max(0, value - offset); }); setPosition(value); };
  const commitSettings = (mutate: (current: Record<string, StudioTrackState>) => Record<string, StudioTrackState>) => setSettings((current) => {
    const next = mutate(current); if (next === current) return current;
    setHistory((items) => [...items.slice(-49), structuredClone(current)]); setFuture([]); return next;
  });
  const change = (id: string, update: Partial<StudioTrackState>) => commitSettings((current) => ({ ...current, [id]: { ...current[id], ...update } }));
  const undo = () => setHistory((items) => { const prior = items.at(-1); if (!prior) return items; setFuture((next) => [structuredClone(settingsRef.current), ...next].slice(0, 50)); setSettings(prior); return items.slice(0, -1); });
  const redo = () => setFuture((items) => { const next = items[0]; if (!next) return items; setHistory((prior) => [...prior.slice(-49), structuredClone(settingsRef.current)]); setSettings(next); return items.slice(1); });
  const editableIds = () => tracks.filter((track) => !track.reference || !hasStems).map((track) => track.id);
  const targetIds = () => selectionScope === "all" ? editableIds() : editableIds().filter((id) => id === selected);
  const requireRange = () => { if (!selectionRange || selectionRange.end - selectionRange.start < .05) { setMessage("Drag across a waveform to select a time range first."); return null; } return selectionRange; };
  const trimSong = () => { const range = requireRange(); if (!range) return; commitSettings((current) => Object.fromEntries(Object.entries(current).map(([id, state]) => editableIds().includes(id) ? [id, { ...state, trim_start: range.start, trim_end: range.end }] : [id, state]))); setMessage(`Song trimmed non-destructively to ${clock(range.start)}–${clock(range.end)}.`); };
  const silenceRange = () => { const range = requireRange(); const ids = targetIds(); if (!range || !ids.length) return; commitSettings((current) => Object.fromEntries(Object.entries(current).map(([id, state]) => ids.includes(id) ? [id, { ...state, cuts: [...(state.cuts ?? []), range] }] : [id, state]))); setMessage(`${selectionScope === "all" ? "All lanes" : tracks.find((item) => item.id === selected)?.name ?? "Lane"} muted from ${clock(range.start)} to ${clock(range.end)}.`); };
  const fadeSong = (kind: "in" | "out") => { const range = requireRange(); const ids = targetIds(); if (!range || !ids.length) return; const length = range.end - range.start; commitSettings((current) => Object.fromEntries(Object.entries(current).map(([id, state]) => ids.includes(id) ? [id, kind === "in" ? { ...state, trim_start: range.start, fade_in: length } : { ...state, trim_end: range.end, fade_out: length }] : [id, state]))); setMessage(`${kind === "in" ? "Fade in" : "Fade out"} applied to ${selectionScope === "all" ? "all lanes" : "the selected lane"}.`); };
  const addEffect = (kind: StudioEffectKind) => {
    const range = requireRange(); const ids = targetIds(); if (!range || !ids.length) return;
    const group = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    commitSettings((current) => Object.fromEntries(Object.entries(current).map(([id, state]) => ids.includes(id) ? [id, { ...state, effects: [...(state.effects ?? []), { id: `${group}-${id}`, kind, amount: .55, ...range }] }] : [id, state])));
    setMessage(`${EFFECT_LABELS[kind]} added to ${selectionScope === "all" ? "all lanes" : "the selected lane"} from ${clock(range.start)} to ${clock(range.end)}.`);
  };
  const removeEffect = (trackId: string, effectId: string) => change(trackId, { effects: (settings[trackId]?.effects ?? []).filter((effect) => effect.id !== effectId) });
  const changeEffectAmount = (trackId: string, effectId: string, amount: number) => change(trackId, { effects: (settings[trackId]?.effects ?? []).map((effect) => effect.id === effectId ? { ...effect, amount } : effect) });
  const importTrack = async (file: File) => {
    setSaving(true); setMessage(`Adding ${file.name} at ${clock(position)}…`);
    try {
      const imported = await importStudioTrack(folder, file); const id = `import-${imported.file}`; const url = await audioUrl(imported.url);
      const track: Track = { id, name: imported.name, file: imported.file, url, color: ["#ffd166", "#ef6fff", "#4de3b1", "#ff8f70"][tracks.filter((item) => item.imported).length % 4], imported: true };
      setTracks((current) => [...current, track]);
      setSettings((current) => ({ ...current, [id]: { name: imported.file, gain: 1, muted: false, solo: false, offset: position, trim_start: position, trim_end: null, fade_in: 0, fade_out: 0, cuts: [], effects: [] } }));
      setSelected(id); setMessage(`${file.name} added at ${clock(position)}. Drag its START control to place it precisely.`);
    } catch (error: any) { setMessage(error?.message ?? String(error)); } finally { setSaving(false); if (fileInput.current) fileInput.current.value = ""; }
  };
  const startSoundEffect = async () => {
    if (!soundPrompt.trim()) { setMessage("Describe the sound you want to create."); return; }
    soundPlacement.current = position;
    setMessage(`Creating a local sound effect for ${clock(position)}…`);
    try {
      const response = await generateStudioSound(folder, {
        prompt: soundPrompt.trim(), name: soundName.trim(), negative_prompt: soundAvoid.trim(), duration: soundDuration,
        seed: soundSeed ? Number(soundSeed) : null,
      });
      setSoundJob(response.job);
    } catch (error: any) { setMessage(error?.message ?? String(error)); }
  };
  const removeImportedTrack = async () => {
    const track = tracks.find((item) => item.id === selected); if (!track?.imported) return;
    setSaving(true); setMessage(`Removing ${track.name}…`);
    try {
      await removeStudioTrack(folder, track.file);
      audioRefs.current[track.id]?.pause(); delete audioRefs.current[track.id];
      setTracks((current) => current.filter((item) => item.id !== track.id));
      setSettings((current) => { const next = { ...current }; delete next[track.id]; return next; });
      setSelected("mix"); setMessage(`${track.name} removed from this Studio session. Your source file was not changed.`);
    } catch (error: any) { setMessage(error?.message ?? String(error)); } finally { setSaving(false); }
  };
  const stateList = () => tracks.map((track) => settings[track.id]).filter(Boolean);
  const save = async () => { setSaving(true); setMessage(""); try { await saveStudioSession(folder, stateList()); setMessage("Session saved with this song."); } catch (error: any) { setMessage(error?.message ?? String(error)); } finally { setSaving(false); } };
  const bounce = async (variant: "custom" | "instrumental" | "acapella") => {
    setSaving(true); setMessage("Building mix…");
    try { const result = await bounceStudioMix(folder, stateList(), variant); const link = document.createElement("a"); link.href = await downloadUrl(result.download_url); link.download = result.filename; document.body.appendChild(link); link.click(); link.remove(); setMessage(`${result.filename} saved in the song folder.`); }
    catch (error: any) { setMessage(error?.message ?? String(error)); } finally { setSaving(false); }
  };
  const exportSelection = async () => { const range = requireRange(); if (!range) return; setSaving(true); setMessage("Building selected range…"); try { const result = await bounceStudioMix(folder, stateList(), "custom", range); const link = document.createElement("a"); link.href = await downloadUrl(result.download_url); link.download = result.filename; document.body.appendChild(link); link.click(); link.remove(); setMessage(`Selected range exported as ${result.filename}.`); } catch (error: any) { setMessage(error?.message ?? String(error)); } finally { setSaving(false); } };

  const activeTrack = tracks.find((track) => track.id === selected) ?? tracks[0];
  const extractionActive = stemJob?.kind === "stems" && ["queued", "running"].includes(stemJob.status);
  const soundBusy = Boolean(soundJob && ["queued", "running"].includes(soundJob.status));
  const selectedState = settings[activeTrack.id];
  const pointerTime = (event: React.PointerEvent<HTMLDivElement>) => { const bounds = event.currentTarget.getBoundingClientRect(); return Math.max(0, Math.min(duration, ((event.clientX - bounds.left) / bounds.width) * duration)); };
  return <section className="song-studio" role="dialog" aria-modal="true" aria-labelledby="song-studio-title">
    <header className="studio-head"><div><div className="eyebrow">LOCAL MULTITRACK STUDIO</div><h2 id="song-studio-title">{song.title}</h2><span>{hasStems ? `${tracks.filter((track) => !track.reference && !track.imported).length} separated stems · original mix preserved` : tracks.some((track) => track.imported) ? "Original mix with added local audio tracks" : "Preparing editable song lanes"}</span></div><div className="studio-head-actions"><button onClick={() => void save()} disabled={saving || tracks.length < 2}>Save session</button><button onClick={onClose}>Close</button></div></header>
    <div className="studio-toolbar"><button className="studio-play" onClick={() => void togglePlayback()}>{playing ? "Ⅱ Pause" : "▶ Play"}</button><button onClick={stop}>■ Stop</button><time>{clock(position)}</time><input aria-label="Studio playhead" type="range" min="0" max={Math.max(.01, duration)} step=".01" value={Math.min(position, Math.max(.01, duration))} onChange={(event) => seek(Number(event.target.value))}/><time>{clock(duration)}</time><button disabled={saving || tracks.length < 2} onClick={() => void bounce("custom")}>Export custom mix</button></div>
    <div className="studio-edit-tools">
      <div className="studio-tool-group"><button title="Undo last edit" disabled={!history.length} onClick={undo}>↶ Undo</button><button title="Redo edit" disabled={!future.length} onClick={redo}>↷ Redo</button></div>
      <div className="studio-range-readout"><span>{selectionScope === "all" ? "ALL-LANE RANGE" : "LANE RANGE"}</span><b>{selectionRange ? `${clock(selectionRange.start)} – ${clock(selectionRange.end)}` : "Drag across a waveform"}</b></div>
      <div className="studio-scope" role="group" aria-label="Selection scope"><button className={selectionScope === "lane" ? "active" : ""} onClick={() => setSelectionScope("lane")}>This lane</button><button className={selectionScope === "all" ? "active" : ""} onClick={() => setSelectionScope("all")}>All lanes</button></div>
      <div className="studio-tool-group"><button className={loopSelection ? "active" : ""} disabled={!selectionRange} onClick={() => setLoopSelection((value) => !value)}>↻ Loop</button><button disabled={!selectionRange} onClick={trimSong}>Trim song</button><button disabled={!selectionRange || !targetIds().length} onClick={silenceRange}>Mute range</button><button disabled={!selectionRange || !targetIds().length} onClick={() => fadeSong("in")}>Fade in</button><button disabled={!selectionRange || !targetIds().length} onClick={() => fadeSong("out")}>Fade out</button><button disabled={!selectionRange || saving} onClick={() => void exportSelection()}>Export range</button></div>
      <button className="add-track-button" disabled={saving} onClick={() => setSourceChooser(true)}>＋ Add track</button><input ref={fileInput} className="studio-file-input" type="file" accept=".wav,.mp3,.flac,.m4a,.aac,.ogg,audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importTrack(file); }}/>
    </div>
    <div className="studio-body">
      <main className="studio-timeline">
        <div className="studio-ruler"><span>0:00</span><span>{clock(duration * .25)}</span><span>{clock(duration * .5)}</span><span>{clock(duration * .75)}</span><span>{clock(duration)}</span></div>
        {tracks.map((track) => { const state = settings[track.id]; const isAudible = audible(track); const offset = state?.offset ?? 0; const sourceDuration = trackDurations[track.id] ?? Math.max(0, duration - offset); return <article key={track.id} className={`studio-lane ${selected === track.id ? "selected" : ""} ${!isAudible ? "inaudible" : ""}`} onClick={() => setSelected(track.id)}>
          <aside style={{ borderColor: track.color }}><strong>{track.name}</strong>{track.reference ? <small>{hasStems ? "Reference · never doubled with stems" : "Original song mix"}</small> : track.imported ? <small>Imported audio · included in custom mix</small> : <small>Separated from the generated mix</small>}<div className="lane-buttons"><button className={state?.muted ? "active" : ""} disabled={track.reference && hasStems} onClick={(event) => { event.stopPropagation(); change(track.id, { muted: !state?.muted }); }}>M</button><button className={state?.solo ? "active" : ""} disabled={Boolean(track.reference && hasStems)} onClick={(event) => { event.stopPropagation(); change(track.id, { solo: !state?.solo }); }}>S</button></div><label>VOL <input type="range" min="0" max="1" step=".01" value={state?.gain ?? 1} disabled={track.reference && hasStems} onChange={(event) => change(track.id, { gain: Number(event.target.value) })}/><b>{Math.round((state?.gain ?? 1) * 100)}%</b></label>{track.imported && <label>START <input type="range" min="0" max={Math.max(.01, duration)} step=".05" value={Math.min(offset, duration)} onChange={(event) => change(track.id, { offset: Number(event.target.value), trim_start: Number(event.target.value) })}/><b>{clock(offset)}</b></label>}</aside>
          <div className="studio-clip" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); rangeAnchor.current = pointerTime(event); setSelectionRange({ start: rangeAnchor.current, end: rangeAnchor.current }); }} onPointerMove={(event) => { if (rangeAnchor.current == null) return; const current = pointerTime(event); setSelectionRange({ start: Math.min(rangeAnchor.current, current), end: Math.max(rangeAnchor.current, current) }); }} onPointerUp={(event) => { const current = pointerTime(event); const anchor = rangeAnchor.current; rangeAnchor.current = null; if (anchor == null || Math.abs(current - anchor) < .08) { setSelectionRange(null); setLoopSelection(false); seek(current); } }}>
            <div className="studio-audio-region" style={{ left: `${duration ? offset / duration * 100 : 0}%`, width: `${duration ? Math.min(sourceDuration, Math.max(0, duration - offset)) / duration * 100 : 100}%` }}><Waveform peaks={peaks[track.id]} color={track.color}/></div>
            {selectionRange && (selectionScope === "all" || selected === track.id) && <i className="studio-selection" style={{ left: `${selectionRange.start / Math.max(.01, duration) * 100}%`, width: `${(selectionRange.end - selectionRange.start) / Math.max(.01, duration) * 100}%` }}/>} 
            {(state?.cuts ?? []).map((cut, index) => <i key={`${cut.start}-${cut.end}-${index}`} className="studio-cut" title="Silenced range" style={{ left: `${cut.start / Math.max(.01, duration) * 100}%`, width: `${(cut.end - cut.start) / Math.max(.01, duration) * 100}%` }}/>) }
            {(state?.effects ?? []).map((effect) => <i key={effect.id} className={`studio-effect-region ${effect.kind}`} title={`${EFFECT_LABELS[effect.kind]} · ${clock(effect.start)}–${clock(effect.end)}`} style={{ left: `${effect.start / Math.max(.01, duration) * 100}%`, width: `${(effect.end - effect.start) / Math.max(.01, duration) * 100}%` }}><span>{EFFECT_LABELS[effect.kind]}</span></i>)}
            <i className="studio-playhead" style={{ left: `${duration ? position / duration * 100 : 0}%` }}/>
          </div>
          <audio ref={(element) => { audioRefs.current[track.id] = element; }} crossOrigin="anonymous" preload="metadata" src={track.url} onLoadedMetadata={(event) => { if (track.id === "mix") setDuration(event.currentTarget.duration || duration); }} />
        </article>; })}
        {tracks.length === 1 && <div className="studio-empty"><strong>{extractionActive ? stemJob?.phase : "This song has not been separated yet"}</strong><p>{extractionActive ? "Demucs is creating Vocals, Drums, Bass and Other locally on the GPU. The lanes will appear here automatically." : "Create four honest source-separated lanes. The original mix remains untouched."}</p>{extractionActive ? <div className="progress"><i style={{ width: `${Math.round((stemJob?.progress ?? 0) * 100)}%` }}/></div> : <button className="primary" disabled={!stemsReady} onClick={onStartStems}>Split into 4 stems</button>}</div>}
      </main>
      <aside className="studio-inspector"><div className="eyebrow">SELECTED LANE</div><h3>{activeTrack.name}</h3><Spectrum audio={audioRefs.current[activeTrack.id]} color={activeTrack.color}/><div className="spectrum-labels"><span>LOW</span><span>MID</span><span>HIGH</span></div><p>This spectrum stays inside MiniMax Studio—no browser popup required.</p>{(!activeTrack.reference || !hasStems) && <div className="lane-edit-summary"><div><span>Starts</span><b>{clock(selectedState?.offset ?? 0)}</b></div><div><span>Fade in</span><b>{(selectedState?.fade_in ?? 0).toFixed(1)}s</b></div><div><span>Fade out</span><b>{(selectedState?.fade_out ?? 0).toFixed(1)}s</b></div><div><span>Muted ranges</span><b>{selectedState?.cuts?.length ?? 0}</b></div></div>}
        <section className="studio-fx"><div className="eyebrow">REGION EFFECTS</div><p>Select time on a waveform, choose This lane or All lanes, then add an effect.</p><div className="studio-fx-grid">{(["gain_down", "gain_up", "echo", "reverb", "auto_level", "normalize", "clarity", "compressor"] as StudioEffectKind[]).map((kind) => <button key={kind} disabled={!selectionRange || !targetIds().length} onClick={() => addEffect(kind)}>{EFFECT_LABELS[kind]}</button>)}</div>{(selectedState?.effects ?? []).length > 0 && <div className="studio-fx-list">{selectedState.effects?.map((effect) => <div key={effect.id}><header><strong>{EFFECT_LABELS[effect.kind]}</strong><span>{clock(effect.start)}–{clock(effect.end)}</span><button aria-label={`Remove ${EFFECT_LABELS[effect.kind]}`} onClick={() => removeEffect(activeTrack.id, effect.id)}>×</button></header><label>Amount <input type="range" min="0" max="1" step=".01" value={effect.amount} onChange={(event) => changeEffectAmount(activeTrack.id, effect.id, Number(event.target.value))}/><b>{Math.round(effect.amount * 100)}%</b></label></div>)}</div>}</section>
        {activeTrack.imported && <button className="remove-studio-track" disabled={saving} onClick={() => void removeImportedTrack()}>Remove imported track</button>}<div className="studio-export"><div className="eyebrow">QUICK EXPORTS</div><button disabled={saving || !hasStems} onClick={() => void bounce("instrumental")}>Instrumental</button><button disabled={saving || !tracks.some((track) => track.id === "vocals")} onClick={() => void bounce("acapella")}>Acapella</button></div>{message && <div className="studio-message">{message}</div>}</aside>
    </div>
    {sourceChooser && <div className="studio-overlay" role="dialog" aria-modal="true" aria-labelledby="track-source-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourceChooser(false); }}><section className="studio-source-dialog"><header><div><div className="eyebrow">NEW STUDIO TRACK</div><h3 id="track-source-title">Where should the sound come from?</h3></div><button aria-label="Close" onClick={() => setSourceChooser(false)}>✕</button></header><div className="studio-source-grid"><button onClick={() => { setSourceChooser(false); window.setTimeout(() => fileInput.current?.click(), 0); }}><span>↑</span><strong>Upload audio</strong><small>Bring in WAV, MP3, FLAC, M4A, AAC or OGG from your computer.</small></button><button disabled={!soundEffectsReady} title={soundEffectsDetail} onClick={() => { setSourceChooser(false); setSoundDialog(true); }}><span>✦</span><strong>Generate a sound</strong><small>{soundEffectsReady ? "Create a local effect with Stable Audio 3 and place it at the playhead." : soundEffectsDetail}</small></button></div></section></div>}
    {soundDialog && <div className="studio-overlay" role="dialog" aria-modal="true" aria-labelledby="sound-generator-title"><section className="studio-sound-dialog"><header><div><div className="eyebrow">LOCAL SOUND GENERATOR</div><h3 id="sound-generator-title">Create a sound for this song</h3></div><button aria-label="Close" disabled={soundBusy} onClick={() => setSoundDialog(false)}>✕</button></header><p>Stable Audio runs in its private CPU process so Music 3 can remain loaded on the RTX 3090.</p><div className="sound-preset-row">{[["Doorbell","A clear two-tone home doorbell chime, close microphone, quiet room"],["Car pass","A powerful sports car races past from left to right, fast Doppler sweep, roadside perspective"],["Thunder","A deep rolling thunder crack across a distant valley, natural outdoor ambience"],["Footsteps","Heavy boots walking across an old wooden floor, measured pace, close detailed recording"],["Crowd","A lively indoor crowd cheering and applauding, spacious hall ambience"]].map(([label, prompt]) => <button key={label} disabled={soundBusy} onClick={() => { setSoundName(label); setSoundPrompt(prompt); }}>{label}</button>)}</div><label>Sound description<textarea rows={4} value={soundPrompt} disabled={soundBusy} onChange={(event) => setSoundPrompt(event.target.value)} placeholder="Describe the source, action, distance, room and recording character…" /></label><div className="sound-generator-row"><label>Track name<input value={soundName} disabled={soundBusy} onChange={(event) => setSoundName(event.target.value)} placeholder="Optional" /></label><label>Duration <span className="sound-duration"><input type="range" min="0.5" max="120" step="0.5" value={soundDuration} disabled={soundBusy} onChange={(event) => setSoundDuration(Number(event.target.value))} /><b>{soundDuration < 10 ? soundDuration.toFixed(1) : soundDuration.toFixed(0)}s</b></span></label><label>Seed<input inputMode="numeric" value={soundSeed} disabled={soundBusy} onChange={(event) => setSoundSeed(event.target.value.replace(/\D/g, ""))} placeholder="Random" /></label></div><details><summary>Avoid</summary><input value={soundAvoid} disabled={soundBusy} onChange={(event) => setSoundAvoid(event.target.value)} /></details>{soundJob && <div className={`sound-job ${soundJob.status}`}><div><strong>{soundJob.phase}</strong><span>{Math.round(soundJob.progress * 100)}%</span></div><div className="progress"><i style={{ width: `${Math.round(soundJob.progress * 100)}%` }} /></div>{soundJob.error && <p>{soundJob.error}</p>}</div>}<footer><button disabled={soundBusy} onClick={() => setSoundDialog(false)}>Close</button>{soundBusy && soundJob ? <button className="danger" onClick={() => void cancelJob(soundJob.id).then(() => setSoundJob({ ...soundJob, phase: "Cancelling…" })).catch((error) => setMessage(error.message))}>Cancel generation</button> : <button className="primary" disabled={!soundPrompt.trim()} onClick={() => void startSoundEffect()}>Generate and add at {clock(position)}</button>}</footer></section></div>}
  </section>;
}

export default function SongStudio(props: Props) {
  return <StudioCrashBoundary onClose={props.onClose}><SongStudioView {...props} /></StudioCrashBoundary>;
}
