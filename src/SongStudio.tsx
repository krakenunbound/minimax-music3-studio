/**
 * Native stem-aware Studio. Timeline clips can be split, slid, and faded
 * on a workspace longer than the source song; exports still stop at last audio.
 */
import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { addEffectToStudio, audioUrl, bounceStudioMix, cancelJob, downloadUrl, generateStudioSound, getEffects, getJob, importStudioTrack, removeStudioTrack, saveStudioSession, type Job, type Song, type SoundEffect, type StudioEffectKind, type StudioRange, type StudioTrackState } from "./api";
import { CLIP_GAIN_MAX, MIN_WORKSPACE_SECONDS, clipAtTime, clipChannelGain, clipEnd, clipGain, clipLength, clockFine, cosineGain, ensureClips, fadeFactor, fitClipToSource, gainToLinePercent, insertSpace, lastClipEnd, linePercentToGain, makeClip, slicePeaks, sourceTimeAt, splitClipsAt, splitOutRanges, stackEffects, tickStep, workspaceDuration, type StudioClip } from "./studioClips";

type Track = { id: string; name: string; file: string; url: string; color: string; reference?: boolean; imported?: boolean; duration?: number };
type TrackGraph = { source: MediaElementAudioSourceNode; gainL: GainNode; gainR: GainNode; low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode; compressor: DynamicsCompressorNode; output: GainNode; echoDelay: DelayNode; echoFeedback: GainNode; echoWet: GainNode; reverb: ConvolverNode; reverbWet: GainNode };
type Tool = "select" | "razor" | "range";
type PeakSet = { mono: number[]; left: number[]; right: number[] };
type EffectStamp = { id: string; start: number; end: number };
type Drag =
  | { kind: "move"; originX: number; snapshots: Record<string, Record<string, number>>; effects: Record<string, EffectStamp[]> }
  | { kind: "fade-in" | "fade-out"; trackId: string; clipId: string; origin: number }
  | { kind: "gain" | "gain-left" | "gain-right"; trackId: string; clipId: string; origin: number }
  | { kind: "effect"; trackId: string; effectId: string; originX: number; start: number; end: number }
  | { kind: "range"; origin: number };
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
const LANE_ASIDE = 230;

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

function blankLane(file: string, muted: boolean, start = 0, knownDuration = 0): StudioTrackState {
  return {
    name: file, gain: 1, muted, solo: false,
    offset: start, trim_start: start, trim_end: null, fade_in: 0, fade_out: 0,
    cuts: [], effects: [], use_clips: true,
    clips: [makeClip({ start, source_in: 0, source_out: knownDuration > 0 ? knownDuration : null })],
  };
}

function FadeCurve({ kind, seconds, pxPerSec, height = 88 }: { kind: "in" | "out"; seconds: number; pxPerSec: number; height?: number }) {
  const width = Math.max(8, seconds * pxPerSec);
  const steps = 28;
  const points: string[] = kind === "in" ? ["0,0", `0,${height}`] : [`${width},0`, `${width},${height}`];
  for (let index = 0; index <= steps; index += 1) {
    const t = kind === "in" ? index / steps : 1 - index / steps;
    const x = t * width;
    const gain = cosineGain(kind === "in" ? t : 1 - t);
    points.push(`${x},${(1 - gain) * height}`);
  }
  points.push(kind === "in" ? "0,0" : `${width},0`);
  return <svg className={`studio-fade-curve ${kind}`} viewBox={`0 0 ${width} ${height}`} width={width} height={height} preserveAspectRatio="none" aria-hidden="true"><polygon points={points.join(" ")} /></svg>;
}

function wavePolygon(peaks: number[], width: number, height: number, mid: number, amp: number) {
  const top = peaks.map((peak, index) => `${index * width / Math.max(1, peaks.length - 1)},${mid - peak * amp}`).join(" ");
  const bottom = [...peaks].reverse().map((peak, reverseIndex) => {
    const index = peaks.length - reverseIndex - 1;
    return `${index * width / Math.max(1, peaks.length - 1)},${mid + peak * amp}`;
  }).join(" ");
  return `${top} ${bottom}`;
}

function Waveform({ peaks, left, right, color, split }: { peaks?: number[]; left?: number[]; right?: number[]; color: string; split?: boolean }) {
  if (!peaks?.length && !left?.length) return <div className="studio-wave-loading"><i /><i /><i /><i /><i /></div>;
  const width = 1000;
  if (split && left?.length && right?.length) {
    return <svg className="studio-wave" viewBox={`0 0 ${width} 72`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="36" x2={width} y2="36" stroke="rgba(255,255,255,.12)" strokeWidth="1" />
      <polygon points={wavePolygon(left, width, 36, 18, 16)} fill={color} opacity=".95" />
      <polygon points={wavePolygon(right, width, 36, 54, 16)} fill={color} opacity=".7" />
      <text x="8" y="14" fill="rgba(255,255,255,.45)" fontSize="9">L</text>
      <text x="8" y="50" fill="rgba(255,255,255,.45)" fontSize="9">R</text>
    </svg>;
  }
  const body = peaks?.length ? peaks : left ?? [];
  return <svg className="studio-wave" viewBox={`0 0 ${width} 72`} preserveAspectRatio="none" aria-hidden="true"><polygon points={wavePolygon(body, width, 72, 36, 31)} fill={color} /></svg>;
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
  const [peaks, setPeaks] = useState<Record<string, PeakSet>>({});
  const [stereoSplit, setStereoSplit] = useState(false);
  const [selected, setSelected] = useState("mix");
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [sourceDuration, setSourceDuration] = useState(song.duration ?? 0);
  const [trackDurations, setTrackDurations] = useState<Record<string, number>>({});
  const [workspace, setWorkspace] = useState(Math.max(MIN_WORKSPACE_SECONDS, (song.duration ?? 120) + 60));
  const [pxPerSec, setPxPerSec] = useState(28);
  const [tool, setTool] = useState<Tool>("select");
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
  const [library, setLibrary] = useState<SoundEffect[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [fadeTip, setFadeTip] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const audioContext = useRef<AudioContext | null>(null);
  const audioGraphs = useRef<Record<string, TrackGraph>>({});
  const animation = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const clockRef = useRef({ running: false, originMs: 0, originTime: 0 });
  const clipboard = useRef<StudioClip[] | null>(null);
  const soundPlacement = useRef(0);
  const handledSoundJob = useRef("");
  const settingsRef = useRef(settings); const selectionRef = useRef(selectionRange); const loopRef = useRef(loopSelection);
  const workspaceRef = useRef(workspace); const playingRef = useRef(playing); const positionRef = useRef(position);
  const hasStems = tracks.some((track) => !track.reference && !track.imported);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { selectionRef.current = selectionRange; }, [selectionRange]);
  useEffect(() => { loopRef.current = loopSelection; }, [loopSelection]);
  useEffect(() => { workspaceRef.current = workspace; }, [workspace]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { positionRef.current = position; }, [position]);
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
        color: ["#ffd166", "#ef6fff", "#4de3b1", "#ff8f70"][index % 4], imported: true, duration: item.duration,
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
        if (current[track.id]?.use_clips && current[track.id]?.clips) { next[track.id] = current[track.id]; return; }
        const prior = stored.find((item) => item.name === track.file);
        const known = trackDurations[track.id] ?? track.duration ?? 0;
        const source = track.imported ? known : (known || sourceDuration);
        if (prior) next[track.id] = { ...prior, use_clips: true, clips: ensureClips(prior, source).map((clip) => fitClipToSource(clip, source || known)) };
        else next[track.id] = current[track.id] ?? blankLane(track.file, Boolean(track.reference && hasStems), 0, track.imported ? known : source);
      });
      return next;
    });
  }, [tracks, song.studio, hasStems, trackDurations, sourceDuration]);

  useEffect(() => {
    setSettings((current) => {
      let changed = false;
      const next: Record<string, StudioTrackState> = { ...current };
      tracks.forEach((track) => {
        const actual = trackDurations[track.id] ?? track.duration ?? 0;
        const state = next[track.id];
        if (!actual || !state?.clips?.length) return;
        const clips = state.clips.map((clip) => fitClipToSource(clip, actual));
        if (clips.some((clip, index) => clip.source_out !== state.clips![index].source_out)) {
          next[track.id] = { ...state, clips }; changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [trackDurations, tracks]);

  useEffect(() => {
    void getEffects().then((response) => setLibrary(response.items)).catch(() => undefined);
  }, []);

  useEffect(() => {
    let stopped = false;
    const createPeaks = async () => {
      const context = new AudioContext();
      for (const track of tracks) {
        try {
          const response = await fetch(track.url); const buffer = await context.decodeAudioData(await response.arrayBuffer());
          const sample = (channel: Float32Array) => {
            const samples = 620; const block = Math.max(1, Math.floor(channel.length / samples)); const points: number[] = [];
            for (let index = 0; index < samples; index += 1) { let maximum = 0; const start = index * block; const end = Math.min(channel.length, start + block); for (let cursor = start; cursor < end; cursor += 24) maximum = Math.max(maximum, Math.abs(channel[cursor])); points.push(Math.min(1, maximum)); }
            return points;
          };
          const left = sample(buffer.getChannelData(0));
          const right = sample(buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0));
          const mono = left.map((value, index) => Math.max(value, right[index] ?? value));
          if (!stopped) setPeaks((current) => ({ ...current, [track.id]: { mono, left, right } }));
          if (!stopped) setTrackDurations((current) => ({ ...current, [track.id]: buffer.duration }));
          if (track.id === "mix" && buffer.duration) setSourceDuration(buffer.duration);
        } catch { /* the streamed audio remains usable even if waveform decoding fails */ }
      }
      void context.close();
    };
    void createPeaks(); return () => { stopped = true; };
  }, [tracks]);

  useEffect(() => {
    const ends = Object.entries(settings).reduce((end, [id, state]) => Math.max(end, lastClipEnd(state.clips ?? [], trackDurations[id] ?? sourceDuration)), 0);
    setWorkspace((current) => workspaceDuration(ends, sourceDuration, current));
  }, [settings, trackDurations, sourceDuration]);

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
          setSettings((current) => ({ ...current, [id]: blankLane(result.file, false, soundPlacement.current) }));
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

  const mixEnd = useMemo(() => {
    const end = Object.entries(settings).reduce((value, [id, state]) => {
      if (!state || (tracks.find((track) => track.id === id)?.reference && hasStems)) return value;
      return Math.max(value, lastClipEnd(state.clips ?? [], trackDurations[id] ?? sourceDuration));
    }, 0);
    return Math.max(end, sourceDuration);
  }, [settings, trackDurations, sourceDuration, tracks, hasStems]);

  const clipsOf = (id: string) => settings[id]?.clips ?? [];
  const sourceOf = (id: string) => trackDurations[id] ?? sourceDuration;

  const gainAt = (trackId: string, timelineTime: number) => {
    const state = settingsRef.current[trackId];
    if (!state) return 0;
    const clip = clipAtTime(state.clips ?? [], timelineTime, sourceOf(trackId));
    if (!clip) return 0;
    const fade = fadeFactor(clip, timelineTime, sourceOf(trackId));
    return Math.max(0, state.gain * clipGain(clip) * fade);
  };

  const ensureAudioGraphs = () => {
    const context = audioContext.current ?? new AudioContext(); audioContext.current = context;
    tracks.forEach((track) => {
      const element = audioRefs.current[track.id]; if (!element || audioGraphs.current[track.id]) return;
      try {
        const source = context.createMediaElementSource(element);
        const splitter = context.createChannelSplitter(2);
        const gainL = context.createGain(); const gainR = context.createGain();
        const merger = context.createChannelMerger(2);
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
        source.connect(splitter); splitter.connect(gainL, 0); splitter.connect(gainR, 1);
        gainL.connect(merger, 0, 0); gainR.connect(merger, 0, 1);
        merger.connect(low).connect(mid).connect(high).connect(compressor).connect(output).connect(context.destination);
        output.connect(echoDelay).connect(echoWet).connect(context.destination); echoDelay.connect(echoFeedback).connect(echoDelay);
        output.connect(reverb).connect(reverbWet).connect(context.destination);
        audioGraphs.current[track.id] = { source, gainL, gainR, low, mid, high, compressor, output, echoDelay, echoFeedback, echoWet, reverb, reverbWet };
      } catch (error) { console.warn(`Studio preview effects unavailable for ${track.name}.`, error); }
    });
    return context;
  };

  const updatePreviewEffects = (track: Track, timelineTime: number) => {
    const graph = audioGraphs.current[track.id]; const state = settingsRef.current[track.id]; const context = audioContext.current; if (!graph || !state || !context) return;
    const active = (state.effects ?? []).filter((effect) => timelineTime >= effect.start && timelineTime <= effect.end);
    const strongest = (kind: StudioEffectKind) => Math.max(0, ...active.filter((effect) => effect.kind === kind).map((effect) => effect.amount));
    const clarity = strongest("clarity"); const compression = strongest("compressor"); const echo = strongest("echo"); const reverb = strongest("reverb");
    const gainUp = active.filter((effect) => effect.kind === "gain_up").reduce((value, effect) => value * (1 + effect.amount * 3), 1);
    const gainDown = active.filter((effect) => effect.kind === "gain_down").reduce((value, effect) => value * (1 - effect.amount * .92), 1);
    const autoLevel = strongest("auto_level"); const normalize = strongest("normalize"); const peak = Math.max(.01, ...(peaks[track.id]?.mono ?? [.75]));
    const clip = clipAtTime(state.clips ?? [], timelineTime, sourceOf(track.id));
    const previewGain = Math.min(6, (clip ? clipGain(clip) : 1) * gainUp * gainDown * (1 + autoLevel * .9) * (normalize ? Math.min(3.2, 1.15 / peak) : 1) * (1 + compression * .85));
    const now = context.currentTime; const set = (parameter: AudioParam, value: number, speed = .012) => parameter.setTargetAtTime(value, now, speed);
    set(graph.low.gain, clarity * 8); set(graph.mid.gain, clarity * 10); set(graph.high.gain, clarity * 7); set(graph.output.gain, previewGain);
    set(graph.gainL.gain, clip ? Math.max(0, clip.gain_left ?? 1) : 1);
    set(graph.gainR.gain, clip ? Math.max(0, clip.gain_right ?? 1) : 1);
    set(graph.compressor.threshold, compression ? -18 - compression * 22 : 0); set(graph.compressor.ratio, compression ? 3 + compression * 9 : 1);
    set(graph.echoDelay.delayTime, .28 + echo * .38); set(graph.echoFeedback.gain, echo ? .22 + echo * .5 : 0); set(graph.echoWet.gain, echo ? .35 + echo * .65 : 0, .02); set(graph.reverbWet.gain, reverb ? .3 + reverb * .7 : 0, .02);
  };

  const applyAudioAt = (timelineTime: number, shouldPlay: boolean) => {
    tracks.forEach((track) => {
      const element = audioRefs.current[track.id]; const state = settingsRef.current[track.id]; if (!element || !state) return;
      const clip = clipAtTime(state.clips ?? [], timelineTime, sourceOf(track.id));
      const fade = clip ? fadeFactor(clip, timelineTime, sourceOf(track.id)) : 0;
      const gain = (state.gain ?? 1) * fade;
      const live = Boolean(clip) && audible(track) && gain > .0001;
      element.volume = Math.min(1, gain);
      if (clip) {
        const wanted = Math.min(sourceTimeAt(clip, timelineTime), Number.isFinite(element.duration) ? element.duration : sourceTimeAt(clip, timelineTime));
        if (Math.abs(element.currentTime - wanted) > .09) element.currentTime = Math.max(0, wanted);
      }
      element.volume = live ? Math.min(1, gain) : 0;
      element.muted = !live;
      if (shouldPlay && live && element.paused) void element.play().catch(() => undefined);
      if (!live && !element.paused) element.pause();
      updatePreviewEffects(track, timelineTime);
    });
  };

  const follow = () => {
    if (audioContext.current) ensureAudioGraphs();
    let timelineTime = positionRef.current;
    if (clockRef.current.running) timelineTime = clockRef.current.originTime + (performance.now() - clockRef.current.originMs) / 1000;
    const activeRange = selectionRef.current;
    if (loopRef.current && activeRange && timelineTime >= activeRange.end) {
      timelineTime = activeRange.start;
      clockRef.current.originMs = performance.now();
      clockRef.current.originTime = timelineTime;
    }
    if (timelineTime >= workspaceRef.current) {
      tracks.forEach((track) => audioRefs.current[track.id]?.pause());
      clockRef.current.running = false;
      setPlaying(false);
      setPosition(workspaceRef.current);
      return;
    }
    setPosition(timelineTime);
    applyAudioAt(timelineTime, clockRef.current.running);
    animation.current = requestAnimationFrame(follow);
  };

  useEffect(() => { animation.current = requestAnimationFrame(follow); return () => cancelAnimationFrame(animation.current); }, [tracks, trackDurations, sourceDuration, audible, peaks]);

  const armClock = (time: number, running: boolean) => {
    clockRef.current = { running, originMs: performance.now(), originTime: time };
  };

  const togglePlayback = async () => {
    if (playing) { tracks.forEach((track) => audioRefs.current[track.id]?.pause()); armClock(position, false); setPlaying(false); return; }
    const context = ensureAudioGraphs(); await context.resume().catch(() => undefined);
    armClock(position, true);
    applyAudioAt(position, true);
    setPlaying(true);
  };
  const stop = () => { tracks.forEach((track) => { const element = audioRefs.current[track.id]; if (element) { element.pause(); element.currentTime = 0; } }); armClock(0, false); setPosition(0); setPlaying(false); };
  const seek = (value: number) => {
    const next = Math.max(0, Math.min(workspace, value));
    armClock(next, playing);
    applyAudioAt(next, playing);
    setPosition(next);
  };
  const commitSettings = (mutate: (current: Record<string, StudioTrackState>) => Record<string, StudioTrackState>) => setSettings((current) => {
    const next = mutate(current); if (next === current) return current;
    setHistory((items) => [...items.slice(-49), structuredClone(current)]); setFuture([]); return next;
  });
  const change = (id: string, update: Partial<StudioTrackState>) => commitSettings((current) => ({ ...current, [id]: { ...current[id], ...update, use_clips: true } }));
  const changeClips = (id: string, clips: StudioClip[]) => change(id, { clips, offset: clips[0]?.start ?? 0 });
  const mapTargetClips = (mutate: (clips: StudioClip[], source: number) => StudioClip[]) => {
    const ids = targetIds();
    commitSettings((current) => Object.fromEntries(Object.entries(current).map(([id, state]) => ids.includes(id) ? [id, { ...state, use_clips: true, clips: mutate(state.clips ?? [], sourceOf(id)) }] : [id, state])));
  };
  const undo = () => setHistory((items) => { const prior = items.at(-1); if (!prior) return items; setFuture((next) => [structuredClone(settingsRef.current), ...next].slice(0, 50)); setSettings(prior); return items.slice(0, -1); });
  const redo = () => setFuture((items) => { const next = items[0]; if (!next) return items; setHistory((prior) => [...prior.slice(-49), structuredClone(settingsRef.current)]); setSettings(next); return items.slice(1); });
  const editableIds = () => tracks.filter((track) => !track.reference || !hasStems).map((track) => track.id);
  const movableIds = (trackId = selected) => selectionScope === "all" ? tracks.map((track) => track.id) : [trackId];
  const targetIds = () => selectionScope === "all" ? editableIds() : editableIds().filter((id) => id === selected);
  const requireRange = () => { if (!selectionRange || selectionRange.end - selectionRange.start < .05) { setMessage("Drag across a waveform to select a time range first."); return null; } return selectionRange; };
  const trimSong = () => {
    const range = requireRange(); if (!range) return;
    mapTargetClips((clips, source) => {
      const split = splitClipsAt(splitClipsAt(clips, range.start, source), range.end, source);
      return split.filter((clip) => clip.start >= range.start - 0.001 && clipEnd(clip, source) <= range.end + 0.001);
    });
    setMessage(`Song trimmed non-destructively to ${clock(range.start)}–${clock(range.end)}.`);
  };
  const silenceRange = () => {
    const range = requireRange(); const ids = targetIds(); if (!range || !ids.length) return;
    mapTargetClips((clips, source) => splitOutRanges(clips, [range], source));
    setMessage(`${selectionScope === "all" ? "All lanes" : tracks.find((item) => item.id === selected)?.name ?? "Lane"} opened a silent gap from ${clock(range.start)} to ${clock(range.end)}.`);
  };
  const fadeSong = (kind: "in" | "out") => {
    const range = requireRange(); const ids = targetIds(); if (!range || !ids.length) return;
    const length = range.end - range.start;
    mapTargetClips((clips, source) => clips.map((clip) => {
      const hit = range.start < clipEnd(clip, source) && range.end > clip.start;
      if (!hit) return clip;
      return kind === "in" ? { ...clip, fade_in: Math.min(length, clipLength(clip, source)) } : { ...clip, fade_out: Math.min(length, clipLength(clip, source)) };
    }));
    setMessage(`${kind === "in" ? "Fade in" : "Fade out"} applied to ${selectionScope === "all" ? "all lanes" : "the selected lane"}.`);
  };
  const razorAt = (time: number, ids = targetIds()) => {
    commitSettings((current) => Object.fromEntries(Object.entries(current).map(([id, state]) => ids.includes(id) ? [id, { ...state, use_clips: true, clips: splitClipsAt(state.clips ?? [], time, sourceOf(id)) }] : [id, state])));
    setMessage(`Cut at ${clockFine(time)}. Drag a clip to open space.`);
  };
  const addSpace = () => {
    const seconds = selectionRange && selectionRange.end - selectionRange.start >= .05 ? selectionRange.end - selectionRange.start : 3;
    const ids = movableIds();
    commitSettings((current) => Object.fromEntries(Object.entries(current).map(([id, state]) => ids.includes(id) ? [id, {
      ...state, use_clips: true,
      clips: insertSpace(state.clips ?? [], position, seconds, sourceOf(id)),
      effects: (state.effects ?? []).map((effect) => effect.start >= position - 0.001 ? { ...effect, start: effect.start + seconds, end: effect.end + seconds } : effect),
    }] : [id, state])));
    setMessage(`Inserted ${seconds.toFixed(1)}s of space at ${clock(position)}. Slide clips or drop a sound into the gap.`);
  };
  const goToSongStart = () => seek(0);
  const goToSongEnd = () => seek(mixEnd);
  const goToClipStart = () => {
    if (selectionRange) { seek(selectionRange.start); return; }
    const clips = settingsRef.current[selected]?.clips ?? [];
    const clip = clips.find((item) => item.id === selectedClipId) ?? clips[0];
    seek(clip?.start ?? 0);
  };
  const goToClipEnd = () => {
    if (selectionRange) { seek(selectionRange.end); return; }
    const clips = settingsRef.current[selected]?.clips ?? [];
    const clip = clips.find((item) => item.id === selectedClipId) ?? clips[0];
    seek(clip ? clipEnd(clip, sourceOf(selected)) : mixEnd);
  };
  const addEffect = (kind: StudioEffectKind) => {
    const range = requireRange(); const ids = targetIds(); if (!range || !ids.length) return;
    const group = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    commitSettings((current) => Object.fromEntries(Object.entries(current).map(([id, state]) => ids.includes(id) ? [id, { ...state, effects: [...(state.effects ?? []), { id: `${group}-${id}`, kind, amount: .7, ...range }] }] : [id, state])));
    const silent = ids.every((id) => { const track = tracks.find((item) => item.id === id); return track ? !audible(track) : true; });
    setMessage(silent
      ? `${EFFECT_LABELS[kind]} was added, but this lane is silent (muted, or the original mix is reference-only). Select Bass, Drums, Other, or Vocals, then press Play.`
      : `${EFFECT_LABELS[kind]} added from ${clock(range.start)} to ${clock(range.end)}. Press Play and loop the range — amount is live.`);
  };
  const removeEffect = (trackId: string, effectId: string) => change(trackId, { effects: (settings[trackId]?.effects ?? []).filter((effect) => effect.id !== effectId) });
  const changeEffectAmount = (trackId: string, effectId: string, amount: number) => {
    setSettings((current) => {
      const next = { ...current, [trackId]: { ...current[trackId], effects: (current[trackId]?.effects ?? []).map((effect) => effect.id === effectId ? { ...effect, amount } : effect) } };
      settingsRef.current = next;
      return next;
    });
    const track = tracks.find((item) => item.id === trackId);
    if (track) updatePreviewEffects(track, positionRef.current);
  };
  const importTrack = async (file: File) => {
    setSaving(true); setMessage(`Adding ${file.name} at ${clock(position)}…`);
    try {
      const imported = await importStudioTrack(folder, file); const id = `import-${imported.file}`; const url = await audioUrl(imported.url);
      const track: Track = { id, name: imported.name, file: imported.file, url, color: ["#ffd166", "#ef6fff", "#4de3b1", "#ff8f70"][tracks.filter((item) => item.imported).length % 4], imported: true };
      setTracks((current) => [...current, track]);
      setSettings((current) => ({ ...current, [id]: { ...blankLane(imported.file, false, position), offset: position } }));
      setSelected(id); setMessage(`${file.name} added at ${clock(position)}. Use the arrow tool to slide it, or Insert space first if you need room.`);
    } catch (error: any) { setMessage(error?.message ?? String(error)); } finally { setSaving(false); if (fileInput.current) fileInput.current.value = ""; }
  };
  const addLibrarySound = async (item: SoundEffect, at = position) => {
    setSaving(true); setSourceChooser(false); setMessage(`Adding “${item.name}” at ${clock(at)}…`);
    try {
      const imported = await addEffectToStudio(item.id, folder);
      const id = `import-${imported.file}`;
      const url = await audioUrl(imported.url);
      const known = imported.duration ?? item.duration;
      const track: Track = { id, name: imported.name || item.name, file: imported.file, url, color: ["#ffd166", "#ef6fff", "#4de3b1", "#ff8f70"][tracks.filter((entry) => entry.imported).length % 4], imported: true, duration: known };
      setTracks((current) => current.some((entry) => entry.id === id) ? current : [...current, track]);
      setSettings((current) => ({ ...current, [id]: { ...blankLane(imported.file, false, at, known), offset: at } }));
      setSelected(id); setSelectedClipId(null);
      setMessage(`“${item.name}” is a ${known.toFixed(1)}s clip at ${clock(at)}. Drag it where you want.`);
    } catch (error: any) { setMessage(error?.message ?? String(error)); } finally { setSaving(false); }
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
    try { const result = await bounceStudioMix(folder, stateList(), variant); const link = document.createElement("a"); link.href = await downloadUrl(result.download_url); link.download = result.filename; document.body.appendChild(link); link.click(); link.remove(); setMessage(`${result.filename} saved in the song folder. Export stops at the last audible clip.`); }
    catch (error: any) { setMessage(error?.message ?? String(error)); } finally { setSaving(false); }
  };
  const exportSelection = async () => { const range = requireRange(); if (!range) return; setSaving(true); setMessage("Building selected range…"); try { const result = await bounceStudioMix(folder, stateList(), "custom", range); const link = document.createElement("a"); link.href = await downloadUrl(result.download_url); link.download = result.filename; document.body.appendChild(link); link.click(); link.remove(); setMessage(`Selected range exported as ${result.filename}.`); } catch (error: any) { setMessage(error?.message ?? String(error)); } finally { setSaving(false); } };

  const timeFromClientX = (clientX: number, surface: HTMLElement) => {
    const bounds = surface.getBoundingClientRect();
    return Math.max(0, Math.min(workspace, (clientX - bounds.left) / Math.max(1, pxPerSec)));
  };
  const pointerTime = (event: React.PointerEvent<HTMLElement>) => timeFromClientX(event.clientX, event.currentTarget);

  const beginMove = (trackId: string, clipId: string, clientX: number) => {
    const snapshots: Record<string, Record<string, number>> = {};
    const effects: Record<string, EffectStamp[]> = {};
    const stampEffects = (id: string, moving: StudioClip[]) => (settingsRef.current[id]?.effects ?? [])
      .filter((effect) => moving.some((clip) => effect.end > clip.start && effect.start < clipEnd(clip, sourceOf(id))))
      .map((effect) => ({ id: effect.id, start: effect.start, end: effect.end }));
    if (selectionScope === "all") {
      tracks.forEach((track) => {
        const clips = settingsRef.current[track.id]?.clips ?? [];
        snapshots[track.id] = Object.fromEntries(clips.map((clip) => [clip.id, clip.start]));
        effects[track.id] = stampEffects(track.id, clips);
      });
    } else {
      const clip = settingsRef.current[trackId]?.clips?.find((item) => item.id === clipId);
      snapshots[trackId] = { [clipId]: clip?.start ?? 0 };
      effects[trackId] = clip ? stampEffects(trackId, [clip]) : [];
    }
    setHistory((items) => [...items.slice(-49), structuredClone(settingsRef.current)]); setFuture([]);
    dragRef.current = { kind: "move", originX: clientX, snapshots, effects };
    setSelected(trackId); setSelectedClipId(clipId);
  };

  const beginEffectMove = (trackId: string, effect: { id: string; start: number; end: number }, event: React.PointerEvent) => {
    event.stopPropagation(); event.preventDefault();
    (event.currentTarget.closest(".studio-track") as HTMLElement | null)?.setPointerCapture(event.pointerId);
    setHistory((items) => [...items.slice(-49), structuredClone(settingsRef.current)]); setFuture([]);
    dragRef.current = { kind: "effect", trackId, effectId: effect.id, originX: event.clientX, start: effect.start, end: effect.end };
    setSelected(trackId); setTool("select");
  };

  const seekFromRuler = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left - LANE_ASIDE;
    if (x < 0) return;
    seek(Math.max(0, Math.min(workspace, x / Math.max(1, pxPerSec))));
  };

  const beginGain = (trackId: string, clip: StudioClip, kind: "gain" | "gain-left" | "gain-right", event: React.PointerEvent) => {
    event.stopPropagation(); event.preventDefault();
    (event.currentTarget.closest(".studio-track") as HTMLElement | null)?.setPointerCapture(event.pointerId);
    setHistory((items) => [...items.slice(-49), structuredClone(settingsRef.current)]); setFuture([]);
    dragRef.current = { kind, trackId, clipId: clip.id, origin: kind === "gain" ? clipGain(clip) : kind === "gain-left" ? (clip.gain_left ?? 1) : (clip.gain_right ?? 1) };
    setSelected(trackId); setSelectedClipId(clip.id);
  };

  const onTrackPointerDown = (track: Track, event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(".studio-handle, .studio-gain-line, .studio-effect-region")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const time = pointerTime(event);
    setSelected(track.id);
    if (tool === "range") {
      dragRef.current = { kind: "range", origin: time };
      setSelectionRange({ start: time, end: time });
      return;
    }
    if (tool === "razor") {
      razorAt(time, movableIds(track.id));
      seek(time);
      return;
    }
    seek(time);
    setSelectionRange(null); setLoopSelection(false);
    const clip = clipAtTime(clipsOf(track.id), time, sourceOf(track.id));
    setSelectedClipId(clip?.id ?? null);
    if (clip) beginMove(track.id, clip.id, event.clientX);
  };

  const onTrackPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current; if (!drag) return;
    const time = pointerTime(event);
    if (drag.kind === "range") {
      setSelectionRange({ start: Math.min(drag.origin, time), end: Math.max(drag.origin, time) });
      return;
    }
    if (drag.kind === "move") {
      const delta = (event.clientX - drag.originX) / Math.max(1, pxPerSec);
      commitLive((current) => Object.fromEntries(Object.entries(current).map(([id, state]) => {
        const starts = drag.snapshots[id]; if (!starts) return [id, state];
        const shifted = new Map((drag.effects[id] ?? []).map((item) => [item.id, item]));
        return [id, {
          ...state, use_clips: true,
          clips: (state.clips ?? []).map((clip) => starts[clip.id] == null ? clip : { ...clip, start: Math.max(0, starts[clip.id] + delta) }),
          effects: (state.effects ?? []).map((effect) => {
            const origin = shifted.get(effect.id); if (!origin) return effect;
            const width = origin.end - origin.start;
            const start = Math.max(0, origin.start + delta);
            return { ...effect, start, end: start + width };
          }),
        }];
      })));
      return;
    }
    if (drag.kind === "effect") {
      const delta = (event.clientX - drag.originX) / Math.max(1, pxPerSec);
      const width = drag.end - drag.start;
      const start = Math.max(0, drag.start + delta);
      commitLive((current) => ({
        ...current,
        [drag.trackId]: {
          ...current[drag.trackId],
          effects: (current[drag.trackId]?.effects ?? []).map((effect) => effect.id === drag.effectId ? { ...effect, start, end: start + width } : effect),
        },
      }));
      setFadeTip(`${EFFECT_LABELS[(settingsRef.current[drag.trackId]?.effects ?? []).find((item) => item.id === drag.effectId)?.kind ?? "echo"]} · ${clock(start)}`);
      return;
    }
    if (drag.kind === "gain" || drag.kind === "gain-left" || drag.kind === "gain-right") {
      const block = (event.target as HTMLElement).closest(".studio-block") as HTMLElement | null;
      const bounds = (block ?? event.currentTarget).getBoundingClientRect();
      const half = bounds.height / 2;
      const localY = drag.kind === "gain-right" ? event.clientY - (bounds.top + half) : event.clientY - bounds.top;
      const span = drag.kind === "gain" ? bounds.height : half;
      const percent = Math.max(0, Math.min(100, localY / Math.max(1, span) * 100));
      const nextGain = linePercentToGain(percent);
      const field = drag.kind === "gain" ? "gain" : drag.kind === "gain-left" ? "gain_left" : "gain_right";
      setFadeTip(`${drag.kind === "gain" ? "Clip level" : drag.kind === "gain-left" ? "Left" : "Right"} · ${(nextGain * 100).toFixed(0)}%`);
      commitLive((current) => {
        const clips = current[drag.trackId]?.clips ?? [];
        return { ...current, [drag.trackId]: { ...current[drag.trackId], clips: clips.map((item) => item.id === drag.clipId ? { ...item, [field]: nextGain } : item) } };
      });
      return;
    }
    if (drag.kind !== "fade-in" && drag.kind !== "fade-out") return;
    const clips = settingsRef.current[drag.trackId]?.clips ?? [];
    const clip = clips.find((item) => item.id === drag.clipId); if (!clip) return;
    const length = clipLength(clip, sourceOf(drag.trackId));
    if (drag.kind === "fade-in") {
      const fade = Math.max(0, Math.min(length - clip.fade_out, time - clip.start));
      setFadeTip(`Fade In · ${clockFine(fade)}`);
      commitLive((current) => ({ ...current, [drag.trackId]: { ...current[drag.trackId], clips: clips.map((item) => item.id === clip.id ? { ...item, fade_in: fade } : item) } }));
    } else {
      const fade = Math.max(0, Math.min(length - clip.fade_in, clipEnd(clip, sourceOf(drag.trackId)) - time));
      setFadeTip(`Fade Out · ${clockFine(fade)}`);
      commitLive((current) => ({ ...current, [drag.trackId]: { ...current[drag.trackId], clips: clips.map((item) => item.id === clip.id ? { ...item, fade_out: fade } : item) } }));
    }
  };

  const commitLive = (mutate: (current: Record<string, StudioTrackState>) => Record<string, StudioTrackState>) => {
    setSettings((current) => mutate(current));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current; dragRef.current = null; setFadeTip(null);
    if (!drag) return;
    if (drag.kind === "range") {
      const time = pointerTime(event);
      if (Math.abs(time - drag.origin) < .08) { setSelectionRange(null); setLoopSelection(false); seek(time); }
      return;
    }
  };

  const beginFade = (trackId: string, clip: StudioClip, kind: "fade-in" | "fade-out", event: React.PointerEvent) => {
    event.stopPropagation(); event.preventDefault();
    (event.currentTarget.closest(".studio-track") as HTMLElement | null)?.setPointerCapture(event.pointerId);
    setHistory((items) => [...items.slice(-49), structuredClone(settingsRef.current)]); setFuture([]);
    dragRef.current = { kind, trackId, clipId: clip.id, origin: kind === "fade-in" ? clip.fade_in : clip.fade_out };
    setSelected(trackId); setSelectedClipId(clip.id); setTool("select");
    setFadeTip(kind === "fade-in" ? `Fade In · ${clockFine(clip.fade_in)}` : `Fade Out · ${clockFine(clip.fade_out)}`);
  };

  const zoomBy = (factor: number) => setPxPerSec((value) => Math.max(6, Math.min(160, Number((value * factor).toFixed(2)))));

  useEffect(() => {
    const surface = timelineRef.current; if (!surface) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomBy(event.deltaY > 0 ? 0.9 : 1.11);
    };
    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => surface.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(event.target.tagName);
      if (typing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); return; }
      if (event.code === "Space") { event.preventDefault(); void togglePlayback(); return; }
      if (event.key.toLowerCase() === "v") setTool("select");
      if (event.key.toLowerCase() === "c") setTool("razor");
      if (event.key.toLowerCase() === "r") setTool("range");
      if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "t") { setSelectionScope("lane"); setMessage("Edits apply to this lane. Press A for all lanes."); return; }
      if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "a") { setSelectionScope("all"); setMessage("Edits apply to all lanes. Press T for this lane."); return; }
      if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "l") { setSelectionScope((value) => value === "all" ? "lane" : "all"); return; }
      if ((event.key === "+" || event.key === "=")) zoomBy(1.15);
      if (event.key === "-" || event.key === "_") zoomBy(0.87);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && selectedClipId) {
        const clip = clipsOf(selected)?.find((item) => item.id === selectedClipId);
        if (clip) clipboard.current = [clip];
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x" && selectedClipId && editableIds().includes(selected)) {
        const clip = clipsOf(selected)?.find((item) => item.id === selectedClipId);
        if (clip) { clipboard.current = [clip]; changeClips(selected, clipsOf(selected).filter((item) => item.id !== selectedClipId)); setSelectedClipId(null); }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && clipboard.current && editableIds().includes(selected)) {
        const copies = clipboard.current.map((clip) => makeClip({ ...clip, id: undefined, start: position }));
        changeClips(selected, [...clipsOf(selected), ...copies]);
        setSelectedClipId(copies[0]?.id ?? null);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedClipId && editableIds().includes(selected)) {
        changeClips(selected, clipsOf(selected).filter((item) => item.id !== selectedClipId));
        setSelectedClipId(null);
        setMessage("Clip removed. The source file is unchanged.");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const activeTrack = tracks.find((track) => track.id === selected) ?? tracks[0];
  const extractionActive = stemJob?.kind === "stems" && ["queued", "running"].includes(stemJob.status);
  const soundBusy = Boolean(soundJob && ["queued", "running"].includes(soundJob.status));
  const selectedState = settings[activeTrack.id];
  const selectedClip = (selectedState?.clips ?? []).find((clip) => clip.id === selectedClipId) ?? (selectedState?.clips ?? [])[0];
  const canvasWidth = Math.max(640, workspace * pxPerSec);
  const step = tickStep(pxPerSec);
  const ticks: number[] = [];
  for (let time = 0; time <= workspace + 0.001; time += step) ticks.push(time);

  return <section className="song-studio" role="dialog" aria-modal="true" aria-labelledby="song-studio-title">
    <header className="studio-head"><div><div className="eyebrow">LOCAL MULTITRACK STUDIO</div><h2 id="song-studio-title">{song.title}</h2><span>{hasStems ? `${tracks.filter((track) => !track.reference && !track.imported).length} separated stems · original mix preserved` : tracks.some((track) => track.imported) ? "Original mix with added local audio tracks" : "Preparing editable song lanes"} · workspace {clock(workspace)} · mix ends {clock(mixEnd)}</span></div><div className="studio-head-actions"><button onClick={() => void save()} disabled={saving || tracks.length < 2}>Save session</button><button onClick={onClose}>Close</button></div></header>
    <div className="studio-toolbar"><button className="studio-play" onClick={() => void togglePlayback()}>{playing ? "Ⅱ Pause" : "▶ Play"}</button><button onClick={stop}>■ Stop</button><div className="studio-transport" role="group" aria-label="Transport">
      <button title="Start of song" onClick={goToSongStart}>⏮</button>
      <button title="Start of clip or range" onClick={goToClipStart}>⇤</button>
      <button title="End of clip or range" onClick={goToClipEnd}>⇥</button>
      <button title="End of song" onClick={goToSongEnd}>⏭</button>
    </div><time>{clock(position)}</time><input aria-label="Studio playhead" type="range" min="0" max={Math.max(.01, workspace)} step=".01" value={Math.min(position, Math.max(.01, workspace))} onChange={(event) => seek(Number(event.target.value))}/><time>{clock(mixEnd)}</time><button className={stereoSplit ? "active" : ""} title="Show left and right as separate waveforms" onClick={() => setStereoSplit((value) => !value)}>{stereoSplit ? "L/R split" : "Mono wave"}</button><button disabled={saving || tracks.length < 2} onClick={() => void bounce("custom")}>Export custom mix</button></div>
    <div className="studio-edit-tools">
      <div className="studio-tool-group"><button title="Undo last edit" disabled={!history.length} onClick={undo}>↶ Undo</button><button title="Redo edit" disabled={!future.length} onClick={redo}>↷ Redo</button></div>
      <div className="studio-scope" role="group" aria-label="Editing tool"><button className={tool === "select" ? "active" : ""} title="Arrow · move clips (V)" onClick={() => setTool("select")}>➤ Move</button><button className={tool === "razor" ? "active" : ""} title="Razor · cut clips (C)" onClick={() => setTool("razor")}>✁ Razor</button><button className={tool === "range" ? "active" : ""} title="Range · select time (R)" onClick={() => setTool("range")}>▮ Range</button></div>
      <div className="studio-range-readout"><span>{selectionScope === "all" ? "ALL-LANE RANGE" : "LANE RANGE"}</span><b>{selectionRange ? `${clock(selectionRange.start)} – ${clock(selectionRange.end)}` : fadeTip ?? "Select a clip or drag a range"}</b></div>
      <div className="studio-scope" role="group" aria-label="Selection scope"><button className={selectionScope === "lane" ? "active" : ""} title="This Lane (T). L toggles." onClick={() => setSelectionScope("lane")}>This Lane</button><button className={selectionScope === "all" ? "active" : ""} title="All lanes (A). L toggles. Drag any clip to slide every lane together." onClick={() => setSelectionScope("all")}>All lanes</button></div>
      <div className="studio-tool-group"><button className={loopSelection ? "active" : ""} disabled={!selectionRange} onClick={() => setLoopSelection((value) => !value)}>↻ Loop</button><button disabled={!selectionRange} onClick={trimSong}>Trim song</button><button disabled={!selectionRange || !targetIds().length} onClick={silenceRange}>Mute range</button><button disabled={!selectionRange || !targetIds().length} onClick={() => fadeSong("in")}>Fade in</button><button disabled={!selectionRange || !targetIds().length} onClick={() => fadeSong("out")}>Fade out</button><button title="Split at the playhead and push later audio to the right" disabled={!targetIds().length} onClick={addSpace}>Insert space</button><button disabled={!selectionRange || saving} onClick={() => void exportSelection()}>Export range</button></div>
      <div className="studio-zoom"><button title="Zoom out" onClick={() => zoomBy(0.85)}>−</button><input aria-label="Timeline zoom" type="range" min="6" max="160" step="1" value={pxPerSec} onChange={(event) => setPxPerSec(Number(event.target.value))} /><button title="Zoom in" onClick={() => zoomBy(1.18)}>+</button></div>
      <button className="add-track-button" disabled={saving} onClick={() => setSourceChooser(true)}>＋ Add track</button><input ref={fileInput} className="studio-file-input" type="file" accept=".wav,.mp3,.flac,.m4a,.aac,.ogg,audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importTrack(file); }}/>
    </div>
    <div className="studio-body">
      <main className="studio-timeline" ref={timelineRef}>
        <div className="studio-scroll" style={{ width: LANE_ASIDE + canvasWidth }}>
          <div className="studio-ruler" style={{ paddingLeft: LANE_ASIDE }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); seekFromRuler(event); }} onPointerMove={(event) => { if (event.buttons) seekFromRuler(event); }}>
            {ticks.map((time) => <span key={time} style={{ left: LANE_ASIDE + time * pxPerSec }}>{clock(time)}</span>)}
            <i className="studio-ruler-playhead" style={{ left: LANE_ASIDE + position * pxPerSec }} />
          </div>
          {tracks.map((track) => { const state = settings[track.id]; const isAudible = audible(track); const clips = state?.clips ?? []; return <article key={track.id} className={`studio-lane ${selected === track.id ? "selected" : ""} ${!isAudible ? "inaudible" : ""}`} onClick={() => setSelected(track.id)}>
            <aside style={{ borderColor: track.color }}><strong>{track.name}</strong>{track.reference ? <small>{hasStems ? "Reference · never doubled with stems" : "Original song mix"}</small> : track.imported ? <small>Imported audio · included in custom mix</small> : <small>Separated from the generated mix</small>}<div className="lane-buttons"><button className={state?.muted ? "active" : ""} disabled={track.reference && hasStems} onClick={(event) => { event.stopPropagation(); change(track.id, { muted: !state?.muted }); }}>M</button><button className={state?.solo ? "active" : ""} disabled={Boolean(track.reference && hasStems)} onClick={(event) => { event.stopPropagation(); change(track.id, { solo: !state?.solo }); }}>S</button></div><div className="studio-scope lane-scope" role="group" aria-label="Selection scope" onClick={(event) => event.stopPropagation()}><button className={selectionScope === "lane" && selected === track.id ? "active" : ""} title="This Lane only (T)" onClick={() => { setSelected(track.id); setSelectionScope("lane"); setMessage(`Edits apply to ${track.name} only.`); }}>This Lane</button><button className={selectionScope === "all" ? "active" : ""} title="All lanes (A)" onClick={() => setSelectionScope("all")}>All</button></div><label>VOL <input type="range" min="0" max="1" step=".01" value={state?.gain ?? 1} disabled={track.reference && hasStems} onChange={(event) => change(track.id, { gain: Number(event.target.value) })}/><b>{Math.round((state?.gain ?? 1) * 100)}%</b></label></aside>
            <div className={`studio-track tool-${tool}`} style={{ width: canvasWidth }} onPointerDown={(event) => onTrackPointerDown(track, event)} onPointerMove={onTrackPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={(event) => { event.preventDefault(); const raw = event.dataTransfer.getData("application/x-minimax-effect"); if (!raw) return; const item = JSON.parse(raw) as SoundEffect; void addLibrarySound(item, timeFromClientX(event.clientX, event.currentTarget)); }}>
              {clips.map((clip) => {
                const length = Math.max(0.05, clipLength(clip, sourceOf(track.id)));
                const active = selected === track.id && selectedClipId === clip.id;
                const pack = peaks[track.id];
                return <div key={clip.id} className={`studio-block ${active ? "active" : ""}`} style={{ left: clip.start * pxPerSec, width: length * pxPerSec, borderColor: track.color, background: `${track.color}22` }}>
                  <div className="studio-block-wave"><Waveform peaks={slicePeaks(pack?.mono, clip, sourceOf(track.id))} left={slicePeaks(pack?.left, clip, sourceOf(track.id))} right={slicePeaks(pack?.right, clip, sourceOf(track.id))} color={track.color} split={stereoSplit} /></div>
                  {clip.fade_in > 0 && <FadeCurve kind="in" seconds={clip.fade_in} pxPerSec={pxPerSec} />}
                  {clip.fade_out > 0 && <FadeCurve kind="out" seconds={clip.fade_out} pxPerSec={pxPerSec} />}
                  {stereoSplit ? <>
                    <i className="studio-gain-line left" style={{ top: `${gainToLinePercent(clip.gain_left ?? 1) / 2}%` }} onPointerDown={(event) => beginGain(track.id, clip, "gain-left", event)} title={`Left ${(clipChannelGain(clip, "left") * 100).toFixed(0)}%`} />
                    <i className="studio-gain-line right" style={{ top: `${50 + gainToLinePercent(clip.gain_right ?? 1) / 2}%` }} onPointerDown={(event) => beginGain(track.id, clip, "gain-right", event)} title={`Right ${(clipChannelGain(clip, "right") * 100).toFixed(0)}%`} />
                  </> : <i className="studio-gain-line" style={{ top: `${gainToLinePercent(clipGain(clip))}%` }} onPointerDown={(event) => beginGain(track.id, clip, "gain", event)} title={`Clip level ${(clipGain(clip) * 100).toFixed(0)}%`} />}
                  <button className="studio-handle in" title="Fade In" aria-label="Fade In handle" style={{ left: Math.max(2, clip.fade_in * pxPerSec - 6) }} onPointerDown={(event) => beginFade(track.id, clip, "fade-in", event)} />
                  <button className="studio-handle out" title="Fade Out" aria-label="Fade Out handle" style={{ right: Math.max(2, clip.fade_out * pxPerSec - 6) }} onPointerDown={(event) => beginFade(track.id, clip, "fade-out", event)} />
                </div>;
              })}
              {selectionRange && (selectionScope === "all" || selected === track.id) && <i className="studio-selection" style={{ left: selectionRange.start * pxPerSec, width: Math.max(2, (selectionRange.end - selectionRange.start) * pxPerSec) }}/>}
              {stackEffects(state?.effects ?? []).map((effect) => <i key={effect.id} className={`studio-effect-region ${effect.kind} ${position >= effect.start && position <= effect.end ? "live" : ""}`} title={`${EFFECT_LABELS[effect.kind]} · ${clock(effect.start)}–${clock(effect.end)} · drag to move`} style={{ left: effect.start * pxPerSec, width: Math.max(3, (effect.end - effect.start) * pxPerSec), bottom: 4 + effect.stack * 17 }} onPointerDown={(event) => beginEffectMove(track.id, effect, event)}><span>{EFFECT_LABELS[effect.kind]}</span></i>)}
              <i className="studio-playhead" style={{ left: position * pxPerSec }}/>
            </div>
            <audio ref={(element) => { audioRefs.current[track.id] = element; }} crossOrigin="anonymous" preload="metadata" src={track.url} onLoadedMetadata={(event) => { if (track.id === "mix") setSourceDuration(event.currentTarget.duration || sourceDuration); }} />
          </article>; })}
        </div>
        {tracks.length === 1 && <div className="studio-empty">
          <strong>{extractionActive ? stemJob?.phase : "This song has not been separated yet"}</strong>
          <p>{extractionActive ? "Demucs is creating Vocals, Drums, Bass and Other locally on the GPU. The lanes will appear here automatically." : "Create four honest source-separated lanes. The original mix remains untouched."}</p>
          {extractionActive ? <div className="progress"><i style={{ width: `${Math.round((stemJob?.progress ?? 0) * 100)}%` }} /></div> : <button className="primary" disabled={!stemsReady} onClick={onStartStems}>Split into 4 stems</button>}
        </div>}
      </main>
      <aside className="studio-inspector"><div className="eyebrow">SELECTED LANE</div><h3>{activeTrack.name}</h3><Spectrum audio={audioRefs.current[activeTrack.id]} color={activeTrack.color}/><div className="spectrum-labels"><span>LOW</span><span>MID</span><span>HIGH</span></div><p>This spectrum stays inside MiniMax Studio—no browser popup required. Use All lanes and drag any clip — including Original mix — to slide the whole arrangement. Drag the yellow line on a clip to change level.</p>
        <div className="lane-edit-summary"><div><span>Clip start</span><b>{clockFine(selectedClip?.start ?? 0)}</b></div><div><span>Clip length</span><b>{clockFine(selectedClip ? clipLength(selectedClip, sourceOf(activeTrack.id)) : 0)}</b></div><div><span>Fade in</span><b>{(selectedClip?.fade_in ?? 0).toFixed(2)}s</b></div><div><span>Fade out</span><b>{(selectedClip?.fade_out ?? 0).toFixed(2)}s</b></div><div><span>Clip level</span><b>{selectedClip ? Math.round(clipGain(selectedClip) * 100) : 100}%</b></div><div><span>L / R</span><b>{selectedClip ? `${Math.round((selectedClip.gain_left ?? 1) * 100)} / ${Math.round((selectedClip.gain_right ?? 1) * 100)}` : "100 / 100"}</b></div></div>
        {selectedClip && <div className="studio-channel-sliders">
          <label>Clip <input type="range" min="0" max={CLIP_GAIN_MAX} step=".01" value={clipGain(selectedClip)} onChange={(event) => changeClips(activeTrack.id, clipsOf(activeTrack.id).map((clip) => clip.id === selectedClip.id ? { ...clip, gain: Number(event.target.value) } : clip))} /><b>{Math.round(clipGain(selectedClip) * 100)}%</b></label>
          <label>Left <input type="range" min="0" max={CLIP_GAIN_MAX} step=".01" value={selectedClip.gain_left ?? 1} onChange={(event) => changeClips(activeTrack.id, clipsOf(activeTrack.id).map((clip) => clip.id === selectedClip.id ? { ...clip, gain_left: Number(event.target.value) } : clip))} /><b>{Math.round((selectedClip.gain_left ?? 1) * 100)}%</b></label>
          <label>Right <input type="range" min="0" max={CLIP_GAIN_MAX} step=".01" value={selectedClip.gain_right ?? 1} onChange={(event) => changeClips(activeTrack.id, clipsOf(activeTrack.id).map((clip) => clip.id === selectedClip.id ? { ...clip, gain_right: Number(event.target.value) } : clip))} /><b>{Math.round((selectedClip.gain_right ?? 1) * 100)}%</b></label>
        </div>}
        <section className="studio-fx"><div className="eyebrow">REGION EFFECTS</div><p>Drag a range, then add an effect. Several effects stack as separate chips and all stay active. Press Play — you will not hear them while paused. If stems are loaded, apply effects to Bass, Drums, Other, or Vocals, not the silent original mix.</p><div className="studio-fx-grid">{(["gain_down", "gain_up", "echo", "reverb", "auto_level", "normalize", "clarity", "compressor"] as StudioEffectKind[]).map((kind) => <button key={kind} disabled={!selectionRange || !targetIds().length} onClick={() => addEffect(kind)}>{EFFECT_LABELS[kind]}</button>)}</div>{(selectedState?.effects ?? []).length > 0 && <div className="studio-fx-list">{selectedState.effects?.map((effect) => <div key={effect.id}><header><strong>{EFFECT_LABELS[effect.kind]}</strong><span>{clock(effect.start)}–{clock(effect.end)}</span><button aria-label={`Remove ${EFFECT_LABELS[effect.kind]}`} onClick={() => removeEffect(activeTrack.id, effect.id)}>×</button></header><label>Amount <input type="range" min="0" max="1" step=".01" value={effect.amount} onChange={(event) => changeEffectAmount(activeTrack.id, effect.id, Number(event.target.value))}/><b>{Math.round(effect.amount * 100)}%</b></label></div>)}</div>}</section>
        <section className="studio-library">
          <div className="eyebrow">EFFECTS & SOUNDS</div>
          <p>Drag a library sound onto the timeline. It keeps its real length — a 5s thunder hit stays 5 seconds.</p>
          <button type="button" className="studio-library-toggle" onClick={() => setLibraryOpen((value) => !value)}>{libraryOpen ? "Hide library" : "Show library"}</button>
          {libraryOpen && <div className="studio-library-list">
            {!library.length && <small>Generate sounds on the Effects page to reuse them here.</small>}
            {library.map((item) => <button key={item.id} type="button" className="studio-library-chip" draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-minimax-effect", JSON.stringify(item)); event.dataTransfer.effectAllowed = "copy"; }} onClick={() => void addLibrarySound(item, position)} title={`${item.name} · ${item.duration.toFixed(1)}s`}>
              <strong>{item.name}</strong><span>{item.duration.toFixed(1)}s</span>
            </button>)}
          </div>}
        </section>
        {activeTrack.imported && <button className="remove-studio-track" disabled={saving} onClick={() => void removeImportedTrack()}>Remove imported track</button>}<div className="studio-export"><div className="eyebrow">QUICK EXPORTS</div><button disabled={saving || !hasStems} onClick={() => void bounce("instrumental")}>Instrumental</button><button disabled={saving || !tracks.some((track) => track.id === "vocals")} onClick={() => void bounce("acapella")}>Acapella</button></div>{message && <div className="studio-message">{message}</div>}</aside>
    </div>
    {sourceChooser && <div className="studio-overlay" role="dialog" aria-modal="true" aria-labelledby="track-source-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourceChooser(false); }}><section className="studio-source-dialog studio-source-wide"><header><div><div className="eyebrow">NEW STUDIO TRACK</div><h3 id="track-source-title">Where should the sound come from?</h3></div><button aria-label="Close" onClick={() => setSourceChooser(false)}>✕</button></header><div className="studio-source-grid studio-source-grid-3"><button onClick={() => { setSourceChooser(false); window.setTimeout(() => fileInput.current?.click(), 0); }}><span>↑</span><strong>Upload audio</strong><small>Bring in WAV, MP3, FLAC, M4A, AAC or OGG from your computer.</small></button><button disabled={!soundEffectsReady} title={soundEffectsDetail} onClick={() => { setSourceChooser(false); setSoundDialog(true); }}><span>✦</span><strong>Generate a sound</strong><small>{soundEffectsReady ? "Create a local effect with Stable Audio 3 and place it at the playhead." : soundEffectsDetail}</small></button><button disabled={!library.length} onClick={() => setLibraryOpen(true)}><span>◇</span><strong>From your library</strong><small>{library.length ? "Reuse a saved effect. Click one below or drag it onto the timeline." : "Generate sounds on the Effects page first."}</small></button></div>
      {library.length > 0 && <div className="studio-source-library">{library.map((item) => <button key={item.id} type="button" onClick={() => void addLibrarySound(item, position)}><strong>{item.name}</strong><span>{item.duration.toFixed(1)}s</span></button>)}</div>}
    </section></div>}
    {soundDialog && <div className="studio-overlay" role="dialog" aria-modal="true" aria-labelledby="sound-generator-title"><section className="studio-sound-dialog"><header><div><div className="eyebrow">LOCAL SOUND GENERATOR</div><h3 id="sound-generator-title">Create a sound for this song</h3></div><button aria-label="Close" disabled={soundBusy} onClick={() => setSoundDialog(false)}>✕</button></header><p>Stable Audio runs in its private CPU process so Music 3 can remain loaded on the RTX 3090.</p><div className="sound-preset-row">{[["Doorbell","A clear two-tone home doorbell chime, close microphone, quiet room"],["Car pass","A powerful sports car races past from left to right, fast Doppler sweep, roadside perspective"],["Thunder","A deep rolling thunder crack across a distant valley, natural outdoor ambience"],["Footsteps","Heavy boots walking across an old wooden floor, measured pace, close detailed recording"],["Crowd","A lively indoor crowd cheering and applauding, spacious hall ambience"]].map(([label, prompt]) => <button key={label} disabled={soundBusy} onClick={() => { setSoundName(label); setSoundPrompt(prompt); }}>{label}</button>)}</div><label>Sound description<textarea rows={4} value={soundPrompt} disabled={soundBusy} onChange={(event) => setSoundPrompt(event.target.value)} placeholder="Describe the source, action, distance, room and recording character…" /></label><div className="sound-generator-row"><label>Track name<input value={soundName} disabled={soundBusy} onChange={(event) => setSoundName(event.target.value)} placeholder="Optional" /></label><label>Duration <span className="sound-duration"><input type="range" min="0.5" max="120" step="0.5" value={soundDuration} disabled={soundBusy} onChange={(event) => setSoundDuration(Number(event.target.value))} /><b>{soundDuration < 10 ? soundDuration.toFixed(1) : soundDuration.toFixed(0)}s</b></span></label><label>Seed<input inputMode="numeric" value={soundSeed} disabled={soundBusy} onChange={(event) => setSoundSeed(event.target.value.replace(/\D/g, ""))} placeholder="Random" /></label></div><details><summary>Avoid</summary><input value={soundAvoid} disabled={soundBusy} onChange={(event) => setSoundAvoid(event.target.value)} /></details>{soundJob && <div className={`sound-job ${soundJob.status}`}><div><strong>{soundJob.phase}</strong><span>{Math.round(soundJob.progress * 100)}%</span></div><div className="progress"><i style={{ width: `${Math.round(soundJob.progress * 100)}%` }} /></div>{soundJob.error && <p>{soundJob.error}</p>}</div>}<footer><button disabled={soundBusy} onClick={() => setSoundDialog(false)}>Close</button>{soundBusy && soundJob ? <button className="danger" onClick={() => void cancelJob(soundJob.id).then(() => setSoundJob({ ...soundJob, phase: "Cancelling…" })).catch((error) => setMessage(error.message))}>Cancel generation</button> : <button className="primary" disabled={!soundPrompt.trim()} onClick={() => void startSoundEffect()}>Generate and add at {clock(position)}</button>}</footer></section></div>}
  </section>;
}

export default function SongStudio(props: Props) {
  return <StudioCrashBoundary onClose={props.onClose}><SongStudioView {...props} /></StudioCrashBoundary>;
}
