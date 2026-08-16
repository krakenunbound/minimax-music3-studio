import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import logoUrl from "./assets/minimax-music3-logo.png";
import acousticBluegrassArt from "./assets/templates/acoustic-bluegrass.webp";
import afrobeatsSunsetArt from "./assets/templates/afrobeats-sunset.webp";
import ambientTranceArt from "./assets/templates/ambient-trance.webp";
import brazilianPhonkArt from "./assets/templates/brazilian-phonk.webp";
import cinematicAltRockArt from "./assets/templates/cinematic-alt-rock.webp";
import darkSynthPopArt from "./assets/templates/dark-synth-pop.webp";
import deepHouseRelaxArt from "./assets/templates/deep-house-relax.webp";
import heroicAnimeOpeningArt from "./assets/templates/heroic-anime-opening.webp";
import lofiStudyBeatsArt from "./assets/templates/lofi-study-beats.webp";
import modernMetalArt from "./assets/templates/modern-metal.webp";
import nordicRitualFolkArt from "./assets/templates/nordic-ritual-folk.webp";
import synthwaveArt from "./assets/templates/synthwave.webp";
import Logs from "./Logs";
import KeysDrawer from "./KeysDrawer";
import SongStudio from "./SongStudio";
import EffectsPage from "./EffectsPage";
import { addSongToPlaylist, assistWriting, audioUrl, cancelJob, clearMemory, convertAudio, createPlaylist, createWorkspace, deletePlaylist, deleteSong, deleteWorkspace, downloadUrl, extractStems, generate, getJob, getLibrary, getPlaylists, getStatus, getWorkspaces, moveSongToWorkspace, openOutputs, openSongFolder, refreshModels, regenerateCover, removeSongFromPlaylist, saveAiKeys, synchronizeLyrics, updateSong, uploadSongCover, videoStudioUrl, type Job, type Playlist, type Song, type Status, type TimedLyricLine, type TimedLyrics, type TimedWord, type Workspace } from "./api";

const SAMPLE = "A cinematic alternative rock song with an intimate opening, expressive lead vocal, live drums, bass and electric guitars, building through a wide chorus into an evolving bridge and resolved outro.";
const LYRIC_LANGUAGES = [
  ["en", "English"], ["is", "Icelandic / Old Norse approximation"], ["es", "Spanish"], ["fr", "French"],
  ["de", "German"], ["it", "Italian"], ["pt", "Portuguese"], ["nl", "Dutch"], ["sv", "Swedish"],
  ["no", "Norwegian"], ["da", "Danish"], ["fi", "Finnish"], ["pl", "Polish"], ["uk", "Ukrainian"],
  ["ru", "Russian"], ["ja", "Japanese"], ["ko", "Korean"], ["zh", "Chinese"], ["ar", "Arabic"], ["hi", "Hindi"],
] as const;

type StylePreset = { genre: string; tempo: string; mood: string; voice: string; arrangement: string; production: string; delivery?: string; instrumental?: boolean };
const TEMPLATE_ART: Record<string, string> = {
  "Cinematic alt rock": cinematicAltRockArt,
  "Dark synth-pop": darkSynthPopArt,
  "Nordic ritual folk": nordicRitualFolkArt,
  "Ambient trance": ambientTranceArt,
  "Modern metal": modernMetalArt,
  Synthwave: synthwaveArt,
  "Acoustic bluegrass": acousticBluegrassArt,
  "Deep house relax": deepHouseRelaxArt,
  "Brazilian phonk": brazilianPhonkArt,
  "Lo-fi study beats": lofiStudyBeatsArt,
  "Heroic anime opening": heroicAnimeOpeningArt,
  "Afrobeats sunset": afrobeatsSunsetArt,
};
const STYLE_PRESETS: Record<string, StylePreset> = {
  "Cinematic alt rock": { genre: "Cinematic alternative rock grounded in a real live band, balancing intimate indie-rock restraint with post-rock scale; emotional rather than trailer-like", tempo: "96 BPM, E minor, steady 4/4 with a grounded half-time bridge and no double-time rush", mood: "A close tense confession, determination gathering through the verses, an earned cathartic refrain, a turbulent bridge, then a reflective human resolution", voice: "Singer A (Female), a clear natural alto with warm chest resonance, conversational diction, controlled breath and a trace of rasp only on emotional sustained notes", delivery: "Fully melodic lead singing with restrained intimate verses and a memorable open-throated chorus. Preserve natural phrasing and audible breath; use one low harmony and occasional octave support only at the largest refrain, never a generic choir", arrangement: "A clean electric-guitar figure and close vocal open alone. Bass and dry live drums enter in the first verse; overdriven rhythm guitars widen only at the refrain. Pull back to toms and a single evolving guitar motif in the bridge, then let the final refrain resolve into the original clean figure", production: "Modern organic band recording: close lead vocal, punchy unquantized drums, solid centered bass and broad guitars with believable amplifier texture. Add depth through room and dynamics, not orchestral strings, trailer impacts, synthetic risers, glossy pop stacks or arena-rock excess" },
  "Dark synth-pop": { genre: "Nocturnal dark synth-pop with restrained industrial texture and an analog new-wave core; sleek, tense and sensual without becoming EDM", tempo: "108 BPM, F-sharp minor, controlled 4/4 with a firm eighth-note pulse and no festival build", mood: "Cool private verses, unease tightening beneath the surface, an addictive luminous hook, a brief loss of control, then a bittersweet late-night comedown", voice: "Singer A (Female), a low smoky mezzo with dry close-mic intimacy, precise consonants, restrained vibrato and a cool self-possessed center", delivery: "Clearly pitched melodic singing: nearly whispered low verses, a concise rising pre-chorus and a tuneful chorus with one soft octave double. Keep emotion internal rather than belted, narrated or theatrically acted", arrangement: "Muted analog bass and a glassy two-note arpeggio establish the verse. Gated electronic drums and small metal percussion enter gradually; warm pads widen behind the chorus without masking the hook. Strip to bass pulse and breath in the bridge, then return once with a darker countermelody", production: "Polished nocturnal mix with deep mono bass, crisp but not harsh transients, selective stereo delay and a short black-room vocal ambience. No bright dance piano, supersaw drop, trap hats, rock guitars, cinematic orchestra, choir stack or cheerful major-key lift" },
  "Nordic ritual folk": { genre: "Archaic Northern European ritual music, Nordic experimental folk and sparse tribal ambient; an austere communal rite rather than Celtic folk, a folk ballad, fantasy soundtrack, musical theatre or orchestral music", tempo: "54 BPM, slow grounded 4/4 built from one heavy footfall per beat; drone-based modal intonation centered loosely on D with no functional chord progression, no bright major lift, no double-time subdivisions and no faster implied groove", mood: "Cold dawn stillness and private shock, grief tightening into a severe invocation, a recurring incantation that grows through vocal intensity rather than added instruments, ancestral call-and-response, then an exposed and unresolved ending", voice: "Singer A (Female), a close natural low alto with an archaic straight tone, narrow modal range, raw breath, minimal vibrato and restrained ritual authority. Singer B (Male), a clearly separate ground-register throat vocalist using fry-rich subharmonic resonance, overtone-rich gravel, rough breath and long open-vowel drones. Singer B must not sound like a warm crooner, Christmas baritone, folk-pop singer, operatic bass, musical-theatre performer or conventional melodic vocalist", delivery: "Singer A performs a severe narrow-range modal incantation, moving between a spare lament and firmly pitched ritual chant without pop phrasing. Singer B never croons and never carries a conventional melody: he produces low subharmonic throat tone, audible vocal fry, coarse gravel, percussive exhalations, long wordless drones and very short earthbound responses. Keep both bodies and breathing audible; no polished diction, belting, sentimental vibrato, duet harmony or choir blend", arrangement: "A single low tagelharpa drone and irregular hide-drum footfall establish the entire world. Bone and wood strikes answer the pulse; bowed lyre appears only as a coarse sustained overtone. Most passages remain nearly empty. The recurring refrain gains force from the female incantation and the male throat drone, not from harmony or orchestration. The call-and-response passage alternates two naked voices over almost no accompaniment. Remove percussion and strings for the final female line", production: "Dry close human voices against a cold open-air field recording, asymmetrical room reflections, raw transients, audible breath and physical drum resonance, dark low mids and very little harmonic filling. Maximum four simultaneous sound sources. Absolutely no acoustic guitar, piano, orchestral strings, brass, woodwind melody, sleigh-bell color, choir, stacked harmony, lush pad, trailer impact, symphonic swell, polished folk production or theatrical staging" },
  "Ambient trance": { genre: "Warm ambient trance with progressive electronic patience, submerged breakbeat detail and no commercial festival-drop structure", tempo: "95 BPM, E minor with a muted G-major color at the central refrain; floating 4/4 pulse that never feels hurried", mood: "Weightless solitude, gentle curiosity, slow emotional opening, one luminous moment of connection, then a peaceful suspended resolution", voice: "Singer A (Female), a smoky low mezzo with softened diction, breath-forward tone, little vibrato and the feeling of singing from very near while the music extends far away", delivery: "Sparse sustained melodic phrases rather than nonstop lyrics. Keep verses fragile and low; let the central refrain become clearer and longer without belting. Use distant low harmonies as atmosphere, never as a choir", arrangement: "Worn pads and a liquid arpeggio emerge from environmental air. A low broken beat, rounded bass and tiny mechanical clicks arrive gradually; one secondary synth melody blooms at the midpoint. Elements dissolve one at a time into a long final pad and human breath", production: "Soft-edged detailed mix with warm low mids, restrained transients and deep three-dimensional stereo space. No supersaw wall, festival snare roll, hard kick, vocal chop hook, abrupt drop, bright piano-house chord or compressed pop climax" },
  "Modern metal": { genre: "Modern progressive metal built from downtuned precision, melodic hooks and physical live-band impact; heavy without symphonic or metalcore clichés", tempo: "142 BPM, C-sharp minor, angular 4/4 accents with a deliberate half-time breakdown and no constant blast-beat speed", mood: "Contained menace, accelerating conflict, a defiant melodic refrain, pressure collapsing into a crushing bridge, then a hard-won final release", voice: "Singer A (Male), a weathered high baritone to tenor with intelligible clean tone, controlled false-cord grit and a distinct human break between the two colors", delivery: "Verses use tense pitched lines with short grit accents; the chorus is fully sung and memorable, not shouted. Reserve the harshest texture for the bridge and final pickup. Gang support appears on no more than two climactic words", arrangement: "A palm-muted low guitar motif and articulate bass begin dry and exposed. Acoustic double-kick drums enter with asymmetric verse accents; two rhythm guitars widen only for the chorus. Sparse synthetic atmosphere links sections, then drops out for a low-register breakdown before the final hook", production: "Dense but separated modern metal mix with tight low end, present acoustic snare, wide amplifier texture and a vocal-forward chorus. Preserve pick attack and drum dynamics; no orchestral strings, trailer brass, endless kick replacement, glossy choir, djent parody or washed-out wall of sound" },
  "Synthwave": { genre: "Cinematic retro synthwave rooted in late-night analog electronics, dream-pop intimacy and a real song form rather than an outrun instrumental cliché", tempo: "112 BPM, A minor, steady four-on-the-floor pulse with restrained syncopation and no modern EDM drop", mood: "Night-drive anticipation, romantic momentum, a soaring neon-lit refrain, a solitary instrumental passage, then a wistful dawn outro", voice: "Singer A, an androgynous soft midrange voice with intimate lower-register verses, clean open vowels and a quietly confident upper register", delivery: "Fully melodic singing with a compact verse contour and a broad memorable chorus. Add only subtle unison doubles and one floating high harmony in the final refrain; no spoken narration or exaggerated retro affect", arrangement: "A pulsing analog bass and narrow arpeggio establish motion. Gated snare, warm polysynth chords and restrained electric-guitar accents enter by degrees; a melodic mono-synth solo replaces the voice in the bridge. The outro sheds drums and leaves bass, pad and a final vocal fragment", production: "Wide 1980s-inspired soundstage with modern clarity, saturated drums, controlled bright top end, long plate accents and solid centered bass. Avoid vaporwave detuning, tropical-house percussion, trap hats, huge supersaws, rock-arena drums and overblown nostalgia effects" },
  "Acoustic bluegrass": { genre: "Contemporary Appalachian bluegrass played by a close acoustic ensemble, rooted in porch-session timing and modal mountain-song character rather than country-pop", tempo: "124 BPM, G major with Mixolydian verse inflections, buoyant cut-time feel and natural push-pull around the beat", mood: "Plainspoken warmth, playful forward momentum, a communal lift at the refrain, one nimble instrumental conversation, then a tender porch-light ending", voice: "Singer A (Female), a natural alto with conversational phrasing, clear Appalachian inflection, focused straight tone and no pop belt", delivery: "Lead lines remain plainly melodic and story-first. Introduce a distinct high and low harmony only in the refrain, tightly phrased around the lead; verses stay solo and the final line returns to one unadorned voice", arrangement: "Flatpicked acoustic guitar establishes the pulse, followed by upright bass and mandolin chop. Banjo rolls answer vocal gaps; fiddle uses short fills rather than continuous sawing. After the second refrain, banjo and fiddle trade a concise break before the ensemble drops to guitar and voice for the ending", production: "Honest live-room acoustic recording with detailed string transients, minimal compression and natural player placement. Keep fret noise and ensemble breath; no drum kit, piano, pedal steel, glossy Nashville vocal, stadium clap, orchestral layer or pop-country electric guitar" },
  "Deep house relax": { genre: "Deep melodic house for a small late-night room: warm, patient and hypnotic rather than peak-hour EDM", tempo: "118 BPM, B minor, unhurried four-on-the-floor with a lightly swung offbeat and no tempo illusion", mood: "Quiet late-night focus, subtle attraction, a slow weightless lift, one suspended breath, then an easy release back into the groove", voice: "Singer A (Female), a soft contralto used sparingly, with airy close-mic phrases, low relaxed vowels and a distant answer tucked into the stereo field", delivery: "Sing short tuneful phrases with generous space between them. The hook should feel remembered rather than announced; no belting, rap cadence, diva run, spoken club command or full choir", arrangement: "Rounded sub bass and a warm compact kick establish the foundation. Brushed hats, muted chord stabs and filtered pads appear by degrees; a restrained two-bar melodic hook arrives after the groove is trusted. Filter elements down for the bridge, then restore the original pocket without adding a festival drop", production: "Smooth club-weight low end, soft transients, spacious delays and warm tape-like saturation. Keep the kick and bass centered with subtle peripheral detail; no supersaw, snare build, hard techno percussion, bright piano-house riff, trap hats or aggressive sidechain pumping" },
  "Brazilian phonk": { genre: "Brazilian phonk driven by baile funk and mandelão percussion, street-level and percussive rather than American drift phonk or trap", tempo: "132 BPM, F minor, hard syncopated tamborzão foundation with clipped stops and no half-time trap drag", mood: "Mischievous swagger, relentless forward motion, a taunting explosive hook, a breathless percussive break, then an abrupt confident finish", voice: "Singer A (Male), a gritty low Portuguese-speaking lead with compressed street-call energy, short rhythmic phrases and unmistakable human bite; a small crowd answers selected hook words", delivery: "Use a pitched chant-rap hybrid locked to the tamborzão pattern, with concise melodic contour in the hook. Keep lines short and percussive; avoid long English rap verses, smooth R&B crooning or anonymous sample-pack chatter", arrangement: "A distorted cowbell motif and syncopated tamborzão rhythm strike immediately. Heavy 808 follows the drum gaps; clipped brass stabs and metallic fills answer the vocal. Remove bass for a brief drum-and-crowd break, then return to the opening motif for one final impact and hard stop", production: "Loud gritty street mix with saturated bass, sharp dry percussion and dramatic width only at impacts. Preserve rhythmic clarity under distortion; no Memphis-horror sample, drifting-car ambience, endless trap rolls, glossy pop chorus, EDM riser or cinematic orchestra" },
  "Lo-fi study beats": { genre: "Instrumental lo-fi hip-hop study music with a small jazz-room vocabulary and an unobtrusive repeating form", tempo: "76 BPM, C major colored by major-seventh and ninth chords, relaxed swung pocket with no tempo changes", mood: "Settled concentration, gentle rainy-window nostalgia, tiny moments of curiosity, no dramatic peak, then a quiet unfinished-feeling fade", voice: "Instrumental; no vocals, speech, vocal chops or hummed melody", arrangement: "Dusty kick and snare, mellow electric piano and soft upright bass establish a four-bar loop. Muted guitar fragments and one understated vibraphone answer appear occasionally; remove drums for a short middle passage, then return with one altered chord voicing and fewer notes", production: "Warm close mix with softened high end, light tape wow, restrained vinyl texture and subtle room rain. Keep every element behind the listener's focus; no intrusive lead solo, boom-bap aggression, trap hats, dramatic filter sweep, cinematic transition or excessive vinyl crackle", instrumental: true },
  "Heroic anime opening": { genre: "Heroic modern J-rock opening theme with fast live-band drive, melodic urgency and concise dramatic turns; energetic without becoming symphonic trailer music", tempo: "168 BPM, E minor with a carefully earned G-major refrain, straight driving 4/4 and a brief half-time emotional bridge", mood: "Immediate urgency, a determined climb, a triumphant but vulnerable refrain, a moment of doubt, then an emotionally decisive final hook", voice: "Singer A (Female), a bright powerful mezzo with agile consonants, clean focused high notes, emotional edge and enough chest tone to remain human at full intensity", delivery: "Clearly sung rapid verses with precise pitch, a rising pre-chorus and a soaring memorable refrain built on sustained vowels. Add one lower harmony in the second refrain and a compact final stack only on the last phrase; never turn the lead into shouting", arrangement: "Driving live drums, melodic pick-style bass and distorted guitars begin immediately. Piano doubles the pre-chorus climb; a small string line appears only as a countervoice at the first refrain. Drop to piano, bass and half-time drums for the bridge, then use a short guitar lead to launch the final refrain", production: "High-energy polished rock mix with a tight real rhythm section, brilliant chorus width and a clear centered vocal. Keep cinematic transitions brief; no full orchestra bed, trailer percussion, metal breakdown, synthetic idol-pop sheen, endless key changes or wall-to-wall harmony stacks" },
  "Afrobeats sunset": { genre: "Warm contemporary Afrobeats with West African guitar conversation, elastic percussion and an intimate coastal evening character; not amapiano or generic tropical pop", tempo: "104 BPM, A major with pentatonic melodic color, relaxed syncopated pocket and no rushed double-time hats", mood: "Easy confidence, flirtatious warmth, a communal sunlit refrain, a playful call-and-response break, then a glowing unforced sunset outro", voice: "Singer A (Male), a smooth light tenor with relaxed melodic phrasing, conversational ad-libs and rhythmic ease. Two supporting voices provide brief warm responses without becoming a pop choir", delivery: "Keep the lead tuneful and rhythmically behind the beat, moving naturally between concise melody and spoken-sung ad-libs. The refrain should be simple and communal; avoid melismatic R&B runs, aggressive rap, belting or theatrical diction", arrangement: "Interlocking shakers, soft kick and rounded bass establish the pocket. Bright highlife-influenced guitar figures answer the voice; airy synth plucks add space. Use a restrained low drum accent rather than a dominant amapiano log-drum line. Strip to percussion, bass and call-and-response before the final refrain, then fade on guitar conversation", production: "Warm spacious mix with elastic groove, clean hand percussion, intimate lead vocal and sunlit stereo ambience. No EDM build, dancehall dembow takeover, trap hats, giant sub drops, glossy choir, orchestral sweetening or overcompressed club loudness" },
};

const VOCAL_PROFILES: Record<string, string> = {
  custom: "",
  "clear-alto": STYLE_PRESETS["Cinematic alt rock"].voice,
  "smoky-mezzo": STYLE_PRESETS["Dark synth-pop"].voice,
  "weathered-tenor": STYLE_PRESETS["Modern metal"].voice,
  "soft-androgynous": STYLE_PRESETS.Synthwave.voice,
  "female-male-duet": "Singer A (Female), a clear natural alto with close-miked clarity, restrained breath, minimal vibrato and a memorable melodic lead. Singer B (Male), a deep resonant bass-baritone with an earthy subharmonic edge. Singer A always carries the principal melody. Singer B is a clearly audible second performer who answers selected phrases, supplies low open-vowel drones beneath choruses, and takes only the lyric lines explicitly assigned to him. The two voices remain distinct rather than blending into a generic choir",
};

const VOCAL_DELIVERIES: Record<string, string> = {
  melodic: "Use clearly pitched melodic singing, sustained sung vowels, a defined verse melody and a stronger memorable chorus melody for normal lyric sections; faithfully follow any explicit spoken, whispered, chanted, rapped or call-and-response performance directions written in the lyrics",
  expressive: "Expressive fully sung lead performance, broad melodic range, shaped sustained notes, dynamic rise into the chorus, emotionally clear phrasing, no spoken narration",
  rhythmic: "Rhythmically precise but clearly sung lead, pitched melodic phrases, syncopated hook, tuneful chorus, no monotone speech or spoken-word cadence",
  theatrical: "Theatrical fully sung performance, strong melodic contour, dramatic sustained notes, distinct section melodies and layered climactic harmonies",
};

function sentence(value: string) {
  const clean = value.trim().replace(/[.\s]+$/, "");
  return clean ? `${clean}.` : "";
}

const structuredHeading = (name: string) => `^\\s*(?:#{1,6}\\s*)?${name}\\s*:?\\s*$`;

const LYRIC_SECTION = /^\s*\[(?:Intro|Verse|Pre-Chorus|Chorus|Post-Chorus|Bridge|Instrumental|Solo|Outro)\]\s*$/im;

function splitCaptionAndLyrics(text: string): { description: string; lyrics: string } {
  const body = text.trim();
  const match = body.match(LYRIC_SECTION);
  if (!match || match.index == null) {
    return /global metadata/i.test(body) ? { description: body, lyrics: "" } : { description: "", lyrics: body };
  }
  const before = body.slice(0, match.index).trim();
  const after = body.slice(match.index).trim();
  if (/global metadata|vocal details|^arrangement\b/im.test(before)) return { description: before, lyrics: after };
  return { description: "", lyrics: body };
}

function unwrapWriting(raw: string): { lyrics: string; title: string; description: string } {
  const text = raw.trim().replace(/^```(?:json|text)?\s*/i, "").replace(/\s*```$/, "").trim();
  const grab = (name: string) => {
    const match = text.match(new RegExp(`"${name}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s"));
    if (!match) return "";
    try { return JSON.parse(`"${match[1]}"`) as string; }
    catch { return match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"'); }
  };
  let lyrics = grab("lyrics");
  let title = grab("title");
  if (!lyrics) {
    const titled = text.match(/^title\s*:\s*(.+)\n+([\s\S]+)$/i);
    if (titled) { title = titled[1].trim().replace(/^"|"$/g, ""); lyrics = titled[2].trim(); }
    else lyrics = text;
  }
  const split = splitCaptionAndLyrics(lyrics);
  return { lyrics: split.lyrics, title, description: split.description };
}

function isStructuredCaption(value: string) {
  return ["Global Metadata", "Vocal Details", "Arrangement"].every((heading) => new RegExp(structuredHeading(heading), "im").test(value));
}

function applyDescriptionControls(value: string, instrumentalSong: boolean, gender: "auto" | "female" | "male", exclusions: string) {
  let result = value.trim();
  const vocalHeading = structuredHeading("Vocal Details");
  const arrangementHeading = structuredHeading("Arrangement");
  if (instrumentalSong) {
    const instrumentalDetails = "Vocal Gender & Timbre: Instrumental composition; no sung, spoken, chanted, sampled, or hummed human voice. The principal melodic instrument named in the arrangement occupies the lead role.\nVocal Style: Not applicable.\nHarmony/Backing Vocals: None.\nVocal FX: None.";
    result = result.replace(new RegExp(`(${vocalHeading}\\s*)[\\s\\S]*?(?=${arrangementHeading})`, "im"), `$1\n${instrumentalDetails}\n\n`);
  } else if (gender !== "auto") {
    const override = `Principal Lead Gender Override: The principal lead singer is ${gender}. This instruction overrides any conflicting lead-gender wording elsewhere in the description.`;
    result = result.replace(new RegExp(`(${vocalHeading})`, "im"), `$1\n${override}`);
  }
  if (exclusions.trim()) {
    const constraint = `User Exclusions: Do not introduce ${exclusions.trim()}. Preserve the requested instrumentation, vocal behavior, groove, and production instead.`;
    result = result.replace(new RegExp(`(${arrangementHeading})`, "im"), `$1\n${constraint}`);
  }
  return result;
}

function buildStructuredCaption({ genre, tempo, mood, voice, arrangement, production, instrumentalSong, delivery }: {
  genre: string; tempo: string; mood: string; voice: string; arrangement: string; production: string; instrumentalSong: boolean; delivery: string;
}) {
  const vocalText = instrumentalSong
    ? "Vocal Gender & Timbre: Instrumental composition; no sung, spoken, chanted, or sampled human voice. The principal melodic instrument named in the arrangement carries the role normally occupied by a lead singer.\nVocal Style: Not applicable; keep the music fully instrumental.\nHarmony/Backing Vocals: None.\nVocal FX: None."
    : [
      `Vocal Gender & Timbre: ${sentence(voice)}`,
      `Vocal Style: ${sentence(delivery)}`,
      "Harmony/Backing Vocals: Keep every named singer sonically distinct and preserve their assigned roles across the entire song. Supporting voices enter only in the sections described, and never replace the principal melody unless explicitly requested.",
      "Vocal FX: Keep effects subordinate to diction and performance. Use natural space appropriate to the production, with no generic choir stack or glossy pop doubling unless requested.",
    ].join("\n");
  return [
    "Global Metadata",
    `Basic Attributes: ${sentence(tempo)} ${sentence(genre)}`,
    `Global Emotional Progression: ${sentence(mood)} The emotional shape must evolve section by section rather than remaining at one static intensity.`,
    `Application Scenarios & Imagery: Let the genre, narrative atmosphere, and lyric imagery define a specific physical scene. Preserve that scene from the opening through the final resolution instead of drifting toward generic contemporary pop.`,
    `Sonics & Production Profile: ${sentence(production)} Preserve the requested dynamics, frequency balance, stereo depth, and degree of polish throughout.`,
    "",
    "Vocal Details",
    vocalText,
    "",
    "Arrangement",
    `Instrument Lifecycle (Primary/Secondary): ${sentence(arrangement)} State the musical identity immediately, then let secondary elements enter, leave, or transform in support of the written sections.`,
    "Groove & Foundation Progression: Establish the requested tempo, meter, and pulse clearly, then follow the tagged lyric sections without imposing a generic pop energy curve. Let intensity change only through the instruments and vocal behaviors explicitly requested. Never introduce a faster-feeling double-time groove unless the description asks for one.",
    "Embellishments, Textures & Spatial FX: Use transitions and environmental texture sparingly and purposefully. Avoid adding genre-default instruments, rhythmic subdivisions, backing choirs, or cinematic impacts that contradict the description.",
  ].join("\n");
}

function rewritePastedPrompt(value: string, instrumentalSong: boolean) {
  const rawParts = value
    .replace(/\r/g, "\n")
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const exclusions: string[] = [];
  const parts: string[] = [];
  for (const part of rawParts) {
    if (/^[\s\-‐‑‒–—−]+/.test(part)) exclusions.push(part.replace(/^[\s\-‐‑‒–—−]+/, "").trim());
    else parts.push(part);
  }
  const take = (pattern: RegExp) => parts.filter((part) => pattern.test(part));
  const tempo = take(/\b(?:\d{2,3}\s*bpm|tempo|half[ -]?time|double[ -]?time|\d+\/\d+|(?:major|minor|dorian|mixolydian|phrygian|lydian|aeolian|ionian)\b|\bkey\b)/i);
  const vocals = take(/\b(?:female|male|woman|man|singer|vocal|alto|soprano|mezzo|contralto|tenor|baritone|bass|duet|choir|harmony|harmonies|chant|throat|voice|vibrato|diction|phrasing|breath|belting|falsetto|spoken|rapped|whisper)/i);
  const instruments = take(/\b(?:drum|percussion|bass|guitar|piano|keys|keyboard|synth|pad|string|violin|fiddle|cello|lyre|tagelharpa|harp|banjo|mandolin|brass|trumpet|sax|flute|pipe|bagpipe|organ|rattle|bell|808|kick|snare|hat|pulse|groove|rhythm|hoofstep|drone|arpeggio|instrument)/i);
  const production = take(/\b(?:production|mix|stereo|mono|frequency|dynamic|compressed|uncompressed|polished|unpolished|raw|glossy|close[ -]?mic|room|reverb|delay|saturation|soundstage|cinematic|field[ -]?record|texture|spatial|transient|low[ -]?end|high[ -]?end)/i);
  const used = new Set([...tempo, ...vocals, ...instruments, ...production]);
  const remaining = parts.filter((part) => !used.has(part));
  const genreTerms = remaining.slice(0, Math.min(3, remaining.length));
  const moodTerms = remaining.slice(genreTerms.length);
  const genre = genreTerms.join(", ") || parts.slice(0, 2).join(", ") || "A coherent song in the described style";
  const mood = moodTerms.join(", ") || "Follow the emotional arc and imagery expressed by the lyrics, building deliberately toward the central hook before a fitting resolution";
  const voice = vocals.join(", ") || (instrumentalSong ? "" : "Singer A, an explicitly identified lead vocalist whose timbre and delivery suit the requested genre");
  const arrangement = instruments.join(", ") || "Use a focused instrumental palette suited to the requested genre, with a clear primary musical anchor and purposeful section-by-section development";
  const mix = production.join(", ") || "Use an intentional production profile suited to the requested period, setting, and degree of polish";
  return {
    genre,
    tempo: tempo.join(", ") || "Use a natural tempo and scale suited to the description",
    mood,
    voice,
    arrangement,
    production: mix,
    caption: buildStructuredCaption({
      genre,
      tempo: tempo.join(", ") || "Use a natural tempo and scale suited to the description",
      mood,
      voice,
      arrangement,
      production: mix,
      instrumentalSong,
      delivery: VOCAL_DELIVERIES.melodic,
    }),
    exclusions: exclusions.join(", "),
  };
}

function preparePastedLyrics(value: string) {
  const sectionNames: Record<string, string> = {
    intro: "Intro", verse: "Verse", "pre chorus": "Pre-Chorus", prechorus: "Pre-Chorus",
    chorus: "Chorus", "final chorus": "Chorus", "post chorus": "Post-Chorus", postchorus: "Post-Chorus",
    bridge: "Bridge", interlude: "Interlude", break: "Interlude", breakdown: "Interlude",
    instrumental: "Instrumental", solo: "Solo", outro: "Outro", hook: "Hook",
  };
  const output: string[] = [];
  for (const original of value.replace(/\r\n?/g, "\n").split("\n")) {
    let line = original.trimEnd();
    const tagged = line.match(/^\s*\[([^\]]+)]\s*(.*)$/);
    if (!tagged) { output.push(line); continue; }
    const tagText = tagged[1].replace(/\s+/g, " ").trim();
    const remainder = tagged[2].trim();
    const pieces = tagText.split(/\s+[-–—]\s+/, 2);
    const simpleHead = pieces[0].replace(/\s+\d+$/, "").toLowerCase();
    if (simpleHead === "start" || simpleHead === "end") continue;
    if (pieces.length === 1 && sectionNames[simpleHead]) line = `[${sectionNames[simpleHead]}]`;
    else line = `[${tagText}]`;
    output.push(line);
    if (remainder) output.push(remainder);
  }
  const compact: string[] = [];
  for (const line of output) {
    if (line || (compact.length > 0 && compact.at(-1))) compact.push(line);
  }
  return compact.join("\n").trim();
}

function songFolderName(song: Song) {
  return song.folder_name || song.folder.split(/[\\/]/).filter(Boolean).at(-1) || "";
}

function stemLabel(file: string) {
  const stem = file.replace(/\.wav$/i, "");
  if (stem === "no_vocals") return "Instrumental";
  if (stem === "other") return "Other · guitars, keys, synths and FX";
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

function jobClock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = whole % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function elapsedLabel(job: Job) {
  return jobClock((Date.now() / 1000) - job.created_at);
}

function remainingLabel(job: Job) {
  if (!["queued", "running"].includes(job.status)) return "";
  if (job.eta_seconds == null) return job.progress >= 0.9 ? "Finishing…" : "Calculating ETA…";
  const seconds = Math.max(0, Math.round(job.eta_seconds));
  const time = jobClock(seconds);
  return `About ${time} remaining`;
}

function timingLabel(job: Job) {
  const remaining = remainingLabel(job);
  return remaining ? `${elapsedLabel(job)} elapsed · ${remaining}` : "";
}

function playbackTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function displayWords(line: TimedLyricLine): TimedWord[] {
  if (line.words?.length) return line.words;
  const words = line.text.trim().split(/\s+/).filter(Boolean);
  const span = Math.max(0.18, line.end - line.start);
  return words.map((text, index) => ({ text, start: line.start + (span * index / words.length), end: index === words.length - 1 ? line.end : line.start + (span * (index + 1) / words.length) }));
}

function KaraokeLyrics({ lyrics, currentTime }: { lyrics?: TimedLyrics | null; currentTime: number }) {
  const lines = lyrics?.lines ?? [];
  if (!lines.length) return null;
  const performingIndex = lines.findIndex((line) => currentTime >= line.start - 0.12 && currentTime <= line.end + 0.16);
  let focusIndex = performingIndex;
  if (focusIndex < 0) {
    const upcoming = lines.findIndex((line) => line.start > currentTime);
    focusIndex = upcoming >= 0 ? upcoming : lines.length - 1;
  }
  const lineHeight = 76;
  return <section className="karaoke" aria-label="Synchronized lyrics">
    <div className="karaoke-focus" aria-hidden="true" />
    <div className="karaoke-track" style={{ transform: `translateY(${104 - focusIndex * lineHeight}px)` }}>
      {lines.map((line, index) => <div className={`karaoke-line ${index === performingIndex ? "active" : currentTime > line.end + 0.16 ? "past" : "future"}`} key={`${line.index}-${line.start}`}>
        <div className="karaoke-original">{displayWords(line).map((word, wordIndex) => {
          const state = currentTime >= word.end ? "sung" : currentTime >= word.start ? "singing" : "waiting";
          return <span className={state} key={`${word.start}-${wordIndex}`}>{word.text}{wordIndex < displayWords(line).length - 1 ? " " : ""}</span>;
        })}</div>
        {line.translation && <div className="karaoke-translation">{line.translation}</div>}
      </div>)}
    </div>
  </section>;
}

function SongVisualizer({ src, timedLyrics, onEnded }: { src: string; timedLyrics?: TimedLyrics | null; onEnded: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [lyricsVisible, setLyricsVisible] = useState(() => localStorage.getItem("music3-lyrics-visible") !== "false");
  const hasTimedLyrics = Boolean(timedLyrics?.lines?.length);
  useEffect(() => {
    const element = audio.current; const surface = canvas.current;
    if (!element || !surface) return;
    type CapturableAudio = HTMLAudioElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
    let context: AudioContext | null = null; let analyser: AnalyserNode | null = null; let source: MediaStreamAudioSourceNode | null = null;
    let data = new Uint8Array(64); const paint = surface.getContext("2d"); let frame = 0;
    const beginAnalysis = async () => {
      if (context) { if (context.state === "suspended") await context.resume(); return; }
      const capturable = element as CapturableAudio;
      const stream = capturable.captureStream?.() ?? capturable.mozCaptureStream?.();
      if (!stream) return;
      context = new AudioContext(); analyser = context.createAnalyser(); analyser.fftSize = 128; analyser.smoothingTimeConstant = 0.78;
      source = context.createMediaStreamSource(stream); source.connect(analyser); data = new Uint8Array(analyser.frequencyBinCount);
      await context.resume();
    };
    const draw = () => {
      frame = requestAnimationFrame(draw); analyser?.getByteFrequencyData(data);
      const ratio = window.devicePixelRatio || 1; const width = surface.clientWidth; const height = surface.clientHeight;
      if (surface.width !== width * ratio || surface.height !== height * ratio) { surface.width = width * ratio; surface.height = height * ratio; paint?.setTransform(ratio, 0, 0, ratio, 0, 0); }
      if (!paint) return; paint.clearRect(0, 0, width, height);
      const bars = 42; const gap = 3; const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
      const gradient = paint.createLinearGradient(0, height, width, 0); gradient.addColorStop(0, "#55e6ee"); gradient.addColorStop(.58, "#7d65f4"); gradient.addColorStop(1, "#b654ff"); paint.fillStyle = gradient;
      for (let index = 0; index < bars; index += 1) { const sample = data[Math.floor(index * data.length / bars)] / 255; const barHeight = Math.max(2, sample * height); paint.fillRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight); }
    };
    element.addEventListener("play", beginAnalysis); draw();
    if (!element.paused) void beginAnalysis();
    return () => { element.removeEventListener("play", beginAnalysis); cancelAnimationFrame(frame); source?.disconnect(); analyser?.disconnect(); if (context) void context.close(); };
  }, [src]);
  useEffect(() => {
    const element = audio.current; if (!element) return;
    const updateTime = () => setCurrentTime(element.currentTime || 0);
    const updateDuration = () => setTotalTime(Number.isFinite(element.duration) ? element.duration : 0);
    const playingNow = () => setIsPlaying(true); const pausedNow = () => setIsPlaying(false);
    let animationFrame = 0;
    const followPlayback = () => { if (!element.paused) setCurrentTime(element.currentTime || 0); animationFrame = requestAnimationFrame(followPlayback); };
    element.addEventListener("timeupdate", updateTime); element.addEventListener("durationchange", updateDuration); element.addEventListener("loadedmetadata", updateDuration); element.addEventListener("play", playingNow); element.addEventListener("pause", pausedNow);
    animationFrame = requestAnimationFrame(followPlayback);
    return () => { cancelAnimationFrame(animationFrame); element.removeEventListener("timeupdate", updateTime); element.removeEventListener("durationchange", updateDuration); element.removeEventListener("loadedmetadata", updateDuration); element.removeEventListener("play", playingNow); element.removeEventListener("pause", pausedNow); };
  }, [src]);
  const togglePlayback = () => { const element = audio.current; if (!element) return; if (element.paused) void element.play(); else element.pause(); };
  const stopPlayback = () => { const element = audio.current; if (!element) return; element.pause(); element.currentTime = 0; setCurrentTime(0); setIsPlaying(false); };
  const seek = (value: number) => { const element = audio.current; if (!element) return; element.currentTime = value; setCurrentTime(value); };
  const changeVolume = (value: number) => { const element = audio.current; if (!element) return; element.volume = value; setVolume(value); };
  const toggleLyrics = () => setLyricsVisible((visible) => { const next = !visible; localStorage.setItem("music3-lyrics-visible", String(next)); return next; });
  return <div className={`song-visualizer ${lyricsVisible && hasTimedLyrics ? "lyrics-visible" : "lyrics-hidden"}`}>
    {lyricsVisible && <KaraokeLyrics lyrics={timedLyrics} currentTime={currentTime} />}
    <canvas ref={canvas} />
    <div className="song-transport">
      <button className="transport-play" aria-label={isPlaying ? "Pause" : "Play"} title={isPlaying ? "Pause" : "Play"} onClick={togglePlayback}>{isPlaying ? "Ⅱ" : "▶"}</button>
      <button className="transport-stop" aria-label="Stop and return to the beginning" title="Stop and return to 0:00" onClick={stopPlayback}>■</button>
      <button className={`transport-lyrics ${lyricsVisible && hasTimedLyrics ? "active" : ""}`} disabled={!hasTimedLyrics} aria-label={`${lyricsVisible ? "Hide" : "Show"} synchronized lyrics`} aria-pressed={lyricsVisible && hasTimedLyrics} title={hasTimedLyrics ? `${lyricsVisible ? "Hide" : "Show"} synchronized lyrics` : "This song has no synchronized lyrics"} onClick={toggleLyrics}>Lyrics</button>
      <time>{playbackTime(currentTime)}</time>
      <input className="transport-seek" aria-label="Song position" type="range" min="0" max={Math.max(totalTime, 0.01)} step="0.01" value={Math.min(currentTime, Math.max(totalTime, 0.01))} onChange={(event) => seek(Number(event.target.value))} style={{ "--seek": `${totalTime ? (currentTime / totalTime) * 100 : 0}%` } as React.CSSProperties} />
      <time>{playbackTime(totalTime)}</time>
      <span className="transport-volume-icon" aria-hidden="true">VOL</span>
      <input className="transport-volume" aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => changeVolume(Number(event.target.value))} style={{ "--volume": `${volume * 100}%` } as React.CSSProperties} />
    </div>
    <audio ref={audio} autoPlay crossOrigin="anonymous" src={src} onEnded={() => { setIsPlaying(false); setCurrentTime(0); onEnded(); }} />
  </div>;
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [librarySection, setLibrarySection] = useState<"songs" | "playlists" | "workspaces" | "projects">("songs");
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [collectionDialog, setCollectionDialog] = useState<"playlist" | "workspace" | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState(() => localStorage.getItem("music3-default-artist") || "");
  const [album, setAlbum] = useState("");
  const [genre, setGenre] = useState("");
  const [description, setDescription] = useState(SAMPLE);
  const [lyrics, setLyrics] = useState("[Verse]\n\n[Chorus]\n\n[Bridge]\n\n[Outro]");
  const [englishTranslation, setEnglishTranslation] = useState("");
  const [lyricsLanguage, setLyricsLanguage] = useState("en");
  const [instrumental, setInstrumental] = useState(false);
  const [duration, setDuration] = useState(120);
  const [autoDuration, setAutoDuration] = useState(true);
  const [tiledDecode, setTiledDecode] = useState(false);
  const [generationJob, setGenerationJob] = useState<Job | null>(null);
  const [utilityJob, setUtilityJob] = useState<Job | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [error, setError] = useState("");
  const [serviceReachable, setServiceReachable] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const [expandedStems, setExpandedStems] = useState<string | null>(null);
  const [audioSources, setAudioSources] = useState<Record<string, string>>({});
  const [coverSources, setCoverSources] = useState<Record<string, string>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openSongSubmenu, setOpenSongSubmenu] = useState<string | null>(null);
  const [songMenuPosition, setSongMenuPosition] = useState<{ left: number; top: number; maxHeight: number; side: "left" | "right" } | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editAlbum, setEditAlbum] = useState("");
  const [editGenre, setEditGenre] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editTrackNumber, setEditTrackNumber] = useState("");
  const [editCoverDirection, setEditCoverDirection] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLyrics, setEditLyrics] = useState("");
  const [editTranslation, setEditTranslation] = useState("");
  const [editLyricsLanguage, setEditLyricsLanguage] = useState("en");
  const [deleteTarget, setDeleteTarget] = useState<Song | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [coverTarget, setCoverTarget] = useState<Song | null>(null);
  const [coverDirection, setCoverDirection] = useState("");
  const [stemTarget, setStemTarget] = useState<Song | null>(null);
  const [stemMode, setStemMode] = useState<"2" | "4">("2");
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [studioView, setStudioView] = useState<"create" | "library" | "effects">("create");
  const [systemOpen, setSystemOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [lyricAssist, setLyricAssist] = useState<{ source: "create" | "edit"; mode: "generate" | "optimize" } | null>(null);
  const [lyricIdea, setLyricIdea] = useState("");
  const [lyricPreview, setLyricPreview] = useState("");
  const [lyricPreviewTitle, setLyricPreviewTitle] = useState("");
  const [lyricPreviewDescription, setLyricPreviewDescription] = useState("");
  const [lyricBusy, setLyricBusy] = useState(false);
  const [lyricError, setLyricError] = useState("");
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [rightDrawer, setRightDrawer] = useState<"job" | "details" | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [editorSong, setEditorSong] = useState<Song | null>(null);
  const [editorSource, setEditorSource] = useState("");
  const [videoTool, setVideoTool] = useState<{ song: Song; url: string } | null>(null);
  const lyricsField = useRef<HTMLTextAreaElement>(null);
  const coverUploadInput = useRef<HTMLInputElement>(null);
  const [leftDrawerWidth, setLeftDrawerWidth] = useState(() => Number(localStorage.getItem("music3-left-drawer-width")) || 420);
  const [rightDrawerWidth, setRightDrawerWidth] = useState(() => Number(localStorage.getItem("music3-right-drawer-width")) || 420);
  const [promptHelpOpen, setPromptHelpOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [moreOptions, setMoreOptions] = useState(false);
  const [excludeStyles, setExcludeStyles] = useState("");
  const [vocalGender, setVocalGender] = useState<"auto" | "female" | "male">("auto");
  const [creativeLatitude, setCreativeLatitude] = useState(50);
  const [directionStrength, setDirectionStrength] = useState(50);
  const [steps, setSteps] = useState(30);
  const [lockedSeed, setLockedSeed] = useState("");
  const firstPreset = STYLE_PRESETS["Cinematic alt rock"];
  const [promptGenre, setPromptGenre] = useState(firstPreset.genre);
  const [promptTempo, setPromptTempo] = useState(firstPreset.tempo);
  const [promptMood, setPromptMood] = useState(firstPreset.mood);
  const [vocalProfile, setVocalProfile] = useState("clear-alto");
  const [promptVoice, setPromptVoice] = useState(firstPreset.voice);
  const [vocalDelivery, setVocalDelivery] = useState("melodic");
  const [promptDeliveryOverride, setPromptDeliveryOverride] = useState<string | null>(null);
  const [promptArrangement, setPromptArrangement] = useState(firstPreset.arrangement);
  const [promptProduction, setPromptProduction] = useState(firstPreset.production);
  const [promptImport, setPromptImport] = useState("");
  const [downloadNotice, setDownloadNotice] = useState("");
  const downloadNoticeTimer = useRef<number | null>(null);

  function showDownloadNotice(filename: string) {
    if (downloadNoticeTimer.current != null) window.clearTimeout(downloadNoticeTimer.current);
    setDownloadNotice(`Download started — ${filename} is being saved to your Downloads folder.`);
    downloadNoticeTimer.current = window.setTimeout(() => setDownloadNotice(""), 4200);
  }

  useEffect(() => () => {
    if (downloadNoticeTimer.current != null) window.clearTimeout(downloadNoticeTimer.current);
  }, []);

  async function refresh() {
    const [nextStatus, library, playlistData, workspaceData] = await Promise.all([getStatus(), getLibrary(), getPlaylists(), getWorkspaces()]);
    setServiceReachable(true);
    setStatus(nextStatus); setSongs(library.items); setPlaylists(playlistData.items); setWorkspaces(workspaceData.items);
    const active = nextStatus.jobs.filter((item) => ["queued", "running"].includes(item.status));
    const restoredGeneration = active.find((item) => item.kind === "music3");
    const restoredUtility = active.find((item) => item.kind !== "music3");
    if (restoredGeneration) setGenerationJob(restoredGeneration);
    if (restoredUtility) setUtilityJob(restoredUtility);
  }

  function beginDrawerResize(side: "left" | "right", event: React.PointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftDrawerWidth : rightDrawerWidth;
    const maximum = Math.max(360, Math.min(960, window.innerWidth - 110));
    let finalWidth = startWidth;
    document.body.classList.add("resizing-drawer");
    const move = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      finalWidth = Math.max(320, Math.min(maximum, startWidth + (side === "left" ? delta : -delta)));
      if (side === "left") setLeftDrawerWidth(finalWidth); else setRightDrawerWidth(finalWidth);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop);
      document.body.classList.remove("resizing-drawer");
      localStorage.setItem(`music3-${side}-drawer-width`, String(Math.round(finalWidth)));
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop, { once: true });
  }

  useEffect(() => {
    let stopped = false;
    const boot = async () => {
      if ("__TAURI_INTERNALS__" in window) {
        const startupError = await invoke<string | null>("sidecar_error").catch(() => null);
        if (startupError) setError(`The local Music 3 service could not start: ${startupError}`);
      }
      for (let i = 0; i < 40 && !stopped; i += 1) {
        try { await refresh(); return; } catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
      }
    };
    void boot();
    const timer = window.setInterval(() => void getStatus().then((next) => { setStatus(next); setServiceReachable(true); }).catch(() => setServiceReachable(false)), 3000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const receiveVideoStudioEvent = (event: MessageEvent) => {
      if (event.data?.type === "kraken-audio:video-studio-playback") setPlaying(null);
      if (event.data?.type === "codex-song-studio-refresh-library" || event.data?.type === "codex-song-studio-cover-art-updated") void refresh();
    };
    window.addEventListener("message", receiveVideoStudioEvent);
    return () => window.removeEventListener("message", receiveVideoStudioEvent);
  }, []);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    const restarted = listen("sidecar-restarted", () => { setError("The local service restarted. Any active generation stopped."); setGenerationJob(null); setUtilityJob(null); void refresh(); });
    const failed = listen<string>("sidecar-error", (event) => setError(`The local Music 3 service could not start: ${event.payload}`));
    return () => { void restarted.then((stop) => stop()); void failed.then((stop) => stop()); };
  }, []);

  useEffect(() => {
    if (!generationJob || ["succeeded", "failed", "cancelled"].includes(generationJob.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await getJob(generationJob.id); setGenerationJob(result.job);
        if (result.job.status === "succeeded") { await refresh(); setStudioView("library"); }
      } catch {
        void getStatus().then((next) => {
          setStatus(next);
          if (!next.jobs.some((item) => item.id === generationJob.id)) {
            setGenerationJob({ ...generationJob, status: "failed", phase: "Generation interrupted", error: "The local service no longer has this job. You can start another song." });
          }
        }).catch(() => undefined);
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [generationJob?.id, generationJob?.status]);

  useEffect(() => {
    if (!utilityJob || ["succeeded", "failed", "cancelled"].includes(utilityJob.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await getJob(utilityJob.id); setUtilityJob(result.job);
        if (result.job.status === "succeeded") await refresh();
      } catch {
        void getStatus().then((next) => {
          setStatus(next);
          if (!next.jobs.some((item) => item.id === utilityJob.id)) {
            setUtilityJob({ ...utilityJob, status: "failed", phase: "Task interrupted", error: "The local service no longer has this task." });
          }
        }).catch(() => undefined);
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [utilityJob?.id, utilityJob?.status]);

  useEffect(() => {
    void Promise.all(songs.map(async (song) => [song.id, await audioUrl(song.audio_url)] as const)).then((pairs) => setAudioSources(Object.fromEntries(pairs)));
    void Promise.all(songs.filter((song) => song.cover_url).map(async (song) => [song.id, await audioUrl(song.cover_url!)] as const)).then((pairs) => setCoverSources(Object.fromEntries(pairs)));
  }, [songs]);

  useEffect(() => {
    if (!editingSong) return;
    const latest = songs.find((song) => song.id === editingSong.id);
    if (!latest || latest.cover_url === editingSong.cover_url) return;
    setEditingSong((current) => current && current.id === latest.id ? { ...current, cover_url: latest.cover_url, cover_error: latest.cover_error } : current);
  }, [songs, editingSong?.id, editingSong?.cover_url]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-song-menu]")) { setOpenMenu(null); setOpenSongSubmenu(null); setSongMenuPosition(null); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpenMenu(null); setOpenSongSubmenu(null); setSongMenuPosition(null); setExpandedStems(null); setEditingSong(null); setDeleteTarget(null); setCoverTarget(null); setStemTarget(null); setSystemOpen(false); setLogsOpen(false); setKeysOpen(false); setLyricAssist(null); setRightDrawer(null); setEditorSong(null); setVideoTool(null); setPromptHelpOpen(false); setTemplatesOpen(false); }
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", dismiss); window.removeEventListener("keydown", escape); };
  }, []);

  function toggleSongMenu(songId: string, button: HTMLButtonElement) {
    if (openMenu === songId) { setOpenMenu(null); setOpenSongSubmenu(null); setSongMenuPosition(null); return; }
    setRightDrawer(null);
    const rect = button.getBoundingClientRect();
    const menuWidth = 220; const gap = 9; const edge = 10;
    const estimatedHeight = Math.min(520, Math.max(180, window.innerHeight - 76));
    const opensRight = window.innerWidth - rect.right >= menuWidth + gap + edge;
    const left = opensRight ? rect.right + gap : Math.max(edge, rect.left - menuWidth - gap);
    const desiredTop = rect.top + rect.height / 2 - estimatedHeight / 2;
    const top = Math.max(66, Math.min(desiredTop, window.innerHeight - estimatedHeight - edge));
    setOpenSongSubmenu(null); setSongMenuPosition({ left, top, maxHeight: Math.max(180, window.innerHeight - top - edge), side: opensRight ? "right" : "left" }); setOpenMenu(songId);
  }

  useEffect(() => {
    if (!openMenu) return;
    const closeForViewportMove = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(".song-menu")) return;
      setOpenMenu(null); setOpenSongSubmenu(null); setSongMenuPosition(null);
    };
    window.addEventListener("resize", closeForViewportMove);
    document.addEventListener("scroll", closeForViewportMove, true);
    return () => { window.removeEventListener("resize", closeForViewportMove); document.removeEventListener("scroll", closeForViewportMove, true); };
  }, [openMenu]);

  const ready = Boolean(status?.service.online && serviceReachable);
  const blocker = !serviceReachable
    ? "The local Music 3 service stopped answering. Close extra Studio windows, then reopen this app."
    : (status?.service.detail ?? "Connecting to the local studio…");
  const gpu = status?.gpu;
  const modelSize = status ? (status.model.size_bytes / 1024 ** 3).toFixed(1) : "0.0";
  const activeJobs = useMemo(() => status?.jobs.filter((item) => ["queued", "running"].includes(item.status)).length ?? 0, [status]);
  const selectedSong = songs.find((song) => song.id === selectedSongId) ?? null;
  const activeEditorSong = editorSong ? (songs.find((song) => song.id === editorSong.id) ?? editorSong) : null;
  const displayJob = utilityJob && ["queued", "running"].includes(utilityJob.status) ? utilityJob : generationJob ?? utilityJob;
  const activePlaylist = playlists.find((item) => item.id === activePlaylistId) ?? null;
  const activeWorkspace = workspaces.find((item) => item.id === activeWorkspaceId) ?? null;
  const librarySongs = librarySection === "projects" ? songs.filter((song) => Boolean(song.studio || song.studio_imports?.length || song.studio_mixes?.length)) : librarySection === "playlists" && activePlaylist ? songs.filter((song) => activePlaylist.song_ids.includes(song.id)) : librarySection === "workspaces" && activeWorkspace ? songs.filter((song) => activeWorkspace.song_ids.includes(song.id)) : songs;
  const showLibrarySongs = librarySection === "songs" || librarySection === "projects" || Boolean(activePlaylist) || Boolean(activeWorkspace);
  const writing = status?.ai?.writing;
  const writingConfigured = Boolean(writing?.configured);
  const writingEnabled = Boolean(writing?.enabled);

  function openLyricAssist(source: "create" | "edit", mode: "generate" | "optimize") {
    const currentLyrics = source === "edit" ? editLyrics : lyrics;
    if (mode === "optimize" && !currentLyrics.replace(/\[[^\]]+\]/g, "").trim()) {
      setError("Write or paste some lyrics first, then Optimize.");
      return;
    }
    if (!writingConfigured) {
      setKeysOpen(true); setLogsOpen(false); setSystemOpen(false);
      setError("Save a Writing key in KEYS, then use Generate Lyrics.");
      return;
    }
    setLyricError(""); setLyricPreview(""); setLyricPreviewTitle(""); setLyricPreviewDescription(""); setLyricIdea("");
    setLyricAssist({ source, mode });
    const cleaned = unwrapWriting(currentLyrics);
    if (cleaned.lyrics && (/"lyrics"\s*:/.test(currentLyrics) || cleaned.description)) {
      setLyricPreview(cleaned.lyrics);
      setLyricPreviewTitle(cleaned.title);
      setLyricPreviewDescription(cleaned.description);
    }
  }

  async function runLyricAssist(random = false) {
    if (!lyricAssist) return;
    setLyricBusy(true); setLyricError("");
    try {
      if (writingConfigured && !writingEnabled) {
        await saveAiKeys({ capabilities: { writing: { enabled: true, provider: writing?.provider || "gemini" } } });
        await refresh();
      }
      const sourceCreate = lyricAssist.source === "create";
      const existing = unwrapWriting(sourceCreate ? lyrics : editLyrics);
      const result = await assistWriting({
        action: lyricAssist.mode === "optimize" ? "optimize" : "generate",
        random: lyricAssist.mode === "generate" && random,
        idea: lyricIdea,
        title: sourceCreate ? title : editTitle,
        description: (sourceCreate ? description : editDescription) || existing.description,
        lyrics: existing.lyrics || (sourceCreate ? lyrics : editLyrics),
        language: sourceCreate ? lyricsLanguage : editLyricsLanguage,
      });
      const cleaned = unwrapWriting(result.lyrics || "");
      setLyricPreview(cleaned.lyrics);
      setLyricPreviewTitle((result.title || cleaned.title || "").trim());
      setLyricPreviewDescription((result.description || cleaned.description || "").trim());
    } catch (reason: any) {
      setLyricError(reason?.message ?? String(reason));
    } finally { setLyricBusy(false); }
  }

  function applyLyricAssist() {
    if (!lyricAssist || !lyricPreview.trim()) return;
    const cleaned = unwrapWriting(lyricPreview);
    const nextTitle = (lyricPreviewTitle || cleaned.title).trim();
    const nextDescription = (lyricPreviewDescription || cleaned.description).trim();
    if (lyricAssist.source === "edit") {
      setEditLyrics(cleaned.lyrics);
      if (nextTitle && (!editTitle.trim() || editTitle.trim() === "Untitled Song")) setEditTitle(nextTitle);
      if (nextDescription) setEditDescription(nextDescription);
    } else {
      setLyrics(cleaned.lyrics);
      if (nextTitle && (!title.trim() || title.trim() === "Untitled Song")) setTitle(nextTitle);
      if (nextDescription) setDescription(nextDescription);
    }
    setLyricAssist(null);
  }

  async function createSong() {
    setError("");
    try {
      const seed = lockedSeed.trim() === "" ? null : Number.parseInt(lockedSeed, 10);
      const cfg = 1.0 + (directionStrength / 100);
      // Music 3's reference workflow uses top_k 50. Keep the middle of the
      // user-facing range anchored to that proven default.
      const topK = Math.round(10 + (creativeLatitude / 100) * 80);
      let productionDescription = description.trim();
      if (!isStructuredCaption(productionDescription)) {
        productionDescription = buildStructuredCaption({ genre: productionDescription, tempo: "Use a natural tempo suited to the description", mood: "Follow the emotional progression implied by the description and lyrics", voice: vocalGender === "auto" ? "A clearly identified lead singer" : `Singer A (${vocalGender})`, arrangement: productionDescription, production: "A coherent, intentional mix appropriate to the described genre", instrumentalSong: instrumental, delivery: VOCAL_DELIVERIES[vocalDelivery] });
      }
      productionDescription = applyDescriptionControls(productionDescription, instrumental, vocalGender, excludeStyles);
      const cleanArtist = artist.trim();
      localStorage.setItem("music3-default-artist", cleanArtist);
      const result = await generate({ title: title.trim() || "Untitled Song", artist: cleanArtist, album: album.trim(), genre: genre.trim(), description: productionDescription, lyrics: instrumental ? "" : lyrics, english_translation: instrumental ? "" : englishTranslation, lyrics_language: lyricsLanguage, instrumental, seed: Number.isFinite(seed) ? seed : null, duration: autoDuration ? 300 : duration, auto_duration: autoDuration, steps, cfg, top_k: topK, tiled_decode: tiledDecode, exclude_styles: excludeStyles.trim(), vocal_gender: vocalGender });
      setGenerationJob(result.job);
    } catch (reason: any) { setError(reason?.message ?? String(reason)); }
  }

  function choosePreset(name: string) {
    const preset = STYLE_PRESETS[name];
    const presetInstrumental = Boolean(preset.instrumental);
    setPromptGenre(preset.genre); setPromptTempo(preset.tempo); setPromptMood(preset.mood);
    setPromptVoice(preset.voice); setVocalProfile("custom");
    setPromptDeliveryOverride(preset.delivery ?? null);
    setPromptArrangement(preset.arrangement); setPromptProduction(preset.production);
    setInstrumental(presetInstrumental);
    setDescription(buildStructuredCaption({ genre: preset.genre, tempo: preset.tempo, mood: preset.mood, voice: preset.voice, arrangement: preset.arrangement, production: preset.production, instrumentalSong: presetInstrumental, delivery: preset.delivery ?? VOCAL_DELIVERIES[vocalDelivery] }));
    setTemplatesOpen(false);
  }

  function applyPromptHelp() {
    setDescription(buildStructuredCaption({ genre: promptGenre, tempo: promptTempo, mood: promptMood, voice: promptVoice, arrangement: promptArrangement, production: promptProduction, instrumentalSong: instrumental, delivery: promptDeliveryOverride ?? VOCAL_DELIVERIES[vocalDelivery] }));
    setPromptHelpOpen(false);
  }

  function analyzeImportedPrompt() {
    if (!promptImport.trim()) return;
    const rewritten = rewritePastedPrompt(promptImport, instrumental);
    setPromptGenre(rewritten.genre);
    setPromptTempo(rewritten.tempo);
    setPromptMood(rewritten.mood);
    setPromptVoice(rewritten.voice);
    setPromptArrangement(rewritten.arrangement);
    setPromptProduction(rewritten.production);
    setVocalProfile("custom");
    setPromptDeliveryOverride(null);
    if (rewritten.exclusions) setExcludeStyles(rewritten.exclusions);
  }

  function insertLyricDirection(tag: string) {
    const field = lyricsField.current;
    const start = field?.selectionStart ?? lyrics.length;
    const end = field?.selectionEnd ?? start;
    const before = lyrics.slice(0, start);
    const after = lyrics.slice(end);
    const prefix = before && !before.endsWith("\n") ? "\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n" : "";
    const inserted = `${prefix}[${tag}]\n${suffix}`;
    setLyrics(before + inserted + after);
    window.setTimeout(() => { field?.focus(); field?.setSelectionRange(start + inserted.length, start + inserted.length); }, 0);
  }

  function formatCurrentLyrics() {
    setLyrics(preparePastedLyrics(lyrics));
    window.setTimeout(() => lyricsField.current?.focus(), 0);
  }

  async function openOutputFolder() {
    const song = selectedSong;
    if (song) {
      try { await openSongFolder(songFolderName(song)); return; }
      catch (reason: any) { setError(reason?.message ?? String(reason)); }
    }
    try { await openOutputs(); }
    catch {
      try { await invoke<string>("open_outputs_folder"); }
      catch (reason: any) { setError(reason?.message ?? String(reason)); }
    }
  }

  function editSong(song: Song) {
    setOpenMenu(null); setEditingSong(song); setEditTitle(song.title); setEditArtist(song.artist || ""); setEditAlbum(song.album || ""); setEditGenre(song.genre || ""); setEditYear(song.year || song.created_at?.slice(0, 4) || ""); setEditTrackNumber(song.track_number || ""); setEditCoverDirection(""); setEditDescription(song.description); setEditLyrics(song.lyrics || ""); setEditTranslation(song.english_translation || ""); setEditLyricsLanguage(song.lyrics_language || "en");
  }

  function reuseSong(song: Song) {
    setTitle(song.title); setArtist(song.artist || ""); setAlbum(song.album || ""); setGenre(song.genre || ""); setDescription(song.description); setLyrics(song.lyrics || ""); setEnglishTranslation(song.english_translation || ""); setLyricsLanguage(song.lyrics_language || "en"); setInstrumental(song.instrumental);
    setLockedSeed(String(song.seed));
    setAutoDuration(Boolean(song.auto_duration));
    setDuration(Math.max(10, Math.min(300, Math.round(song.requested_duration ?? song.duration ?? 120))));
    setSteps(song.steps ?? 30);
    setDirectionStrength(Math.max(0, Math.min(100, Math.round(((song.cfg ?? 1.5) - 1.0) * 100))));
    setCreativeLatitude(Math.max(0, Math.min(100, Math.round(((song.top_k ?? 50) - 10) / 0.8))));
    setTiledDecode(song.tiled_decode ?? false);
    setExcludeStyles(song.exclude_styles ?? "");
    setVocalGender(song.vocal_gender ?? "auto");
    setOpenMenu(null);
    setStudioView("create");
    document.querySelector(".composer")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveSongDetails() {
    if (!editingSong || !editTitle.trim()) return;
    setLibraryBusy(true); setError("");
    try {
      await updateSong(songFolderName(editingSong), { title: editTitle.trim(), artist: editArtist.trim(), album: editAlbum.trim(), genre: editGenre.trim(), year: editYear.trim(), track_number: editTrackNumber.trim(), description: editDescription, lyrics: editLyrics, english_translation: editTranslation, lyrics_language: editLyricsLanguage });
      await refresh(); setEditingSong(null);
    } catch (reason: any) { setError(reason?.message ?? String(reason)); }
    finally { setLibraryBusy(false); }
  }

  async function uploadEditedCover(file: File) {
    if (!editingSong) return;
    setLibraryBusy(true); setError("");
    try {
      const result = await uploadSongCover(songFolderName(editingSong), file);
      const coverSource = await audioUrl(result.cover_url);
      setCoverSources((current) => ({ ...current, [editingSong.id]: coverSource }));
      setEditingSong({ ...editingSong, cover_url: result.cover_url, cover_error: null });
      await refresh();
    } catch (reason: any) { setError(reason?.message ?? String(reason)); }
    finally { setLibraryBusy(false); if (coverUploadInput.current) coverUploadInput.current.value = ""; }
  }

  async function regenerateEditedCover() {
    if (!editingSong) return;
    setLibraryBusy(true); setError("");
    try {
      await updateSong(songFolderName(editingSong), { title: editTitle.trim(), artist: editArtist.trim(), album: editAlbum.trim(), genre: editGenre.trim(), year: editYear.trim(), track_number: editTrackNumber.trim(), description: editDescription, lyrics: editLyrics, english_translation: editTranslation, lyrics_language: editLyricsLanguage });
      const result = await regenerateCover(songFolderName(editingSong), editCoverDirection.trim());
      setUtilityJob(result.job);
    } catch (reason: any) { setError(reason?.message ?? String(reason)); }
    finally { setLibraryBusy(false); }
  }

  function downloadSong(song: Song) {
    const link = document.createElement("a");
    link.href = audioSources[song.id] || song.audio_url;
    link.download = "";
    document.body.appendChild(link); link.click(); link.remove(); setOpenMenu(null);
    showDownloadNotice(`${song.title || "song"}.wav`);
  }

  async function exportSong(song: Song, format: "mp3" | "flac") {
    setOpenMenu(null); setLibraryBusy(true); setError("");
    try {
      const result = await convertAudio(songFolderName(song), format);
      const link = document.createElement("a"); link.href = await downloadUrl(result.download_url);
      link.download = result.filename;
      document.body.appendChild(link); link.click(); link.remove();
      showDownloadNotice(result.filename);
    } catch (reason: any) { setError(reason?.message ?? String(reason)); }
    finally { setLibraryBusy(false); }
  }

  async function startCover() {
    if (!coverTarget) return;
    setLibraryBusy(true); setError("");
    try { const result = await regenerateCover(songFolderName(coverTarget), coverDirection); setUtilityJob(result.job); setCoverTarget(null); setRightDrawer("job"); }
    catch (reason: any) { setError(reason?.message ?? String(reason)); }
    finally { setLibraryBusy(false); }
  }

  async function startStems() {
    if (!stemTarget) return;
    setLibraryBusy(true); setError("");
    try { const result = await extractStems(songFolderName(stemTarget), stemMode); setUtilityJob(result.job); setRightDrawer("job"); }
    catch (reason: any) { setError(reason?.message ?? String(reason)); }
    finally { setLibraryBusy(false); }
  }

  async function startLyricsSync(song: Song) {
    setOpenMenu(null); setError("");
    try {
      const result = await synchronizeLyrics(songFolderName(song));
      setUtilityJob(result.job); setRightDrawer("job");
    } catch (reason: any) { setError(reason?.message ?? String(reason)); }
  }

  async function openStudioFromNav() {
    const lastId = (() => { try { return localStorage.getItem("music3-last-studio-song"); } catch { return null; } })();
    const projectSongs = songs.filter((song) => Boolean(song.studio || song.studio_imports?.length || song.studio_mixes?.length));
    const song = selectedSong
      ?? songs.find((item) => item.id === lastId)
      ?? projectSongs[0]
      ?? songs[0]
      ?? null;
    if (!song) {
      setStudioView("library");
      setError("Create or select a song first, then open Studio.");
      return;
    }
    setError("");
    await openAudioEditor(song);
  }

  async function openStudioFromEffects(folder: string) {
    try {
      const data = await getLibrary();
      setSongs(data.items);
      const song = data.items.find((item) => songFolderName(item) === folder);
      if (song) await openAudioEditor(song);
    } catch (reason: any) { setError(reason?.message ?? String(reason)); }
  }

  async function openAudioEditor(song: Song) {
    const source = audioSources[song.id] || await audioUrl(song.audio_url);
    setSelectedSongId(song.id); setOpenMenu(null); setExpandedStems(null); setRightDrawer(null); setEditorSource(source); setEditorSong(song); setPlaying(null);
    try { localStorage.setItem("music3-last-studio-song", song.id); } catch { /* ignore quota */ }
    const activeStemJob = status?.jobs.find((job) => job.kind === "stems" && ["queued", "running"].includes(job.status));
    if (!(song.stems?.length) && status?.stems.ready && !activeStemJob) {
      try { const result = await extractStems(songFolderName(song), "4"); setUtilityJob(result.job); }
      catch (reason: any) { setError(reason?.message ?? String(reason)); }
    }
  }

  async function openVideoStudio(song: Song) {
    const workspace = workspaces.find((item) => item.song_ids.includes(song.id))?.name || "My Workspace";
    setOpenMenu(null); setOpenSongSubmenu(null); setSongMenuPosition(null); setPlaying(null); setRightDrawer(null);
    try { setVideoTool({ song, url: await videoStudioUrl(song, workspace) }); }
    catch (reason: any) { setError(reason?.message ?? String(reason)); }
  }

  async function startStudioStems() {
    if (!activeEditorSong) return;
    setError("");
    try { const result = await extractStems(songFolderName(activeEditorSong), "4"); setUtilityJob(result.job); }
    catch (reason: any) { setError(reason?.message ?? String(reason)); }
  }

  async function removeSong() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setLibraryBusy(true); setError("");
    setDeleteError("");
    try {
      if (playing === target.id) setPlaying(null);
      setAudioSources((current) => { const next = { ...current }; delete next[target.id]; return next; });
      setCoverSources((current) => { const next = { ...current }; delete next[target.id]; return next; });
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.setTimeout(resolve, 50))));
      await deleteSong(songFolderName(target));
      setSongs((current) => current.filter((song) => song.id !== target.id));
      if (selectedSongId === target.id) setSelectedSongId(null);
      await refresh(); setDeleteTarget(null);
    } catch (reason: any) { setDeleteError(reason?.message ?? String(reason)); }
    finally { setLibraryBusy(false); }
  }

  async function saveCollection() {
    const name = collectionName.trim(); if (!collectionDialog || !name) return;
    setLibraryBusy(true); setError("");
    try {
      const result = collectionDialog === "playlist" ? await createPlaylist(name) : await createWorkspace(name);
      if (collectionDialog === "playlist") { setActivePlaylistId((result as { playlist: Playlist }).playlist.id); setLibrarySection("playlists"); }
      else { setActiveWorkspaceId((result as { workspace: Workspace }).workspace.id); setLibrarySection("workspaces"); }
      setCollectionDialog(null); setCollectionName(""); await refresh();
    } catch (reason: any) { setError(reason?.message ?? String(reason)); }
    finally { setLibraryBusy(false); }
  }

  async function addToPlaylist(song: Song, playlist: Playlist) {
    setLibraryBusy(true); setError("");
    try { await addSongToPlaylist(playlist.id, song.id); await refresh(); setOpenMenu(null); setOpenSongSubmenu(null); setSongMenuPosition(null); }
    catch (reason: any) { setError(reason?.message ?? String(reason)); }
    finally { setLibraryBusy(false); }
  }

  async function removeFromActivePlaylist(song: Song) {
    if (!activePlaylist) return;
    setLibraryBusy(true); setError("");
    try { await removeSongFromPlaylist(activePlaylist.id, song.id); await refresh(); setOpenMenu(null); setOpenSongSubmenu(null); setSongMenuPosition(null); }
    catch (reason: any) { setError(reason?.message ?? String(reason)); }
    finally { setLibraryBusy(false); }
  }

  async function moveToWorkspace(song: Song, workspace: Workspace) {
    setLibraryBusy(true); setError("");
    try { await moveSongToWorkspace(workspace.id, song.id); await refresh(); setOpenMenu(null); setOpenSongSubmenu(null); setSongMenuPosition(null); }
    catch (reason: any) { setError(reason?.message ?? String(reason)); }
    finally { setLibraryBusy(false); }
  }

  async function removeCurrentCollection() {
    setLibraryBusy(true); setError("");
    try {
      if (librarySection === "playlists" && activePlaylist) { await deletePlaylist(activePlaylist.id); setActivePlaylistId(null); }
      else if (librarySection === "workspaces" && activeWorkspace && activeWorkspace.id !== "my-workspace") { await deleteWorkspace(activeWorkspace.id); setActiveWorkspaceId(null); }
      await refresh();
    } catch (reason: any) { setError(reason?.message ?? String(reason)); }
    finally { setLibraryBusy(false); }
  }

  return <div className="app">
    <header className="topbar">
      <div className="brand"><img className="brand-logo" src={logoUrl} alt="" /><span>MiniMax Music 3</span></div>
      <nav className="top-modes" aria-label="Studio modes"><button className={studioView === "create" && !editorSong ? "active" : ""} onClick={() => setStudioView("create")}>Create</button><button className={studioView === "library" && !editorSong ? "active" : ""} onClick={() => setStudioView("library")}>Library</button><button className={studioView === "effects" && !editorSong ? "active" : ""} onClick={() => setStudioView("effects")}>Effects</button><button className={editorSong ? "active" : ""} onClick={() => void openStudioFromNav()}>Studio</button></nav>
      <span className={`pill ${ready ? "ok" : "warn"}`}><i />{ready ? "Music 3 ready" : "engine unavailable"}</span>
      {gpu?.detected && <span className="pill ok desktop-status"><i />{gpu.name?.replace("NVIDIA GeForce ", "")}</span>}
      <span className="spacer" />
      <span className="top-context">Standalone local music studio</span>
    </header>

    <main className="studio-shell">
      <nav className="edge-tabs left-edge" aria-label="Local utility panels">
        <button className={logsOpen ? "active" : ""} onClick={() => { setLogsOpen((open) => !open); setSystemOpen(false); setKeysOpen(false); }}><span>{[..."LOGS"].map((letter, index) => <b key={`${letter}-${index}`}>{letter}</b>)}</span></button>
        <i />
        <button className={keysOpen ? "active" : ""} onClick={() => { setKeysOpen((open) => !open); setLogsOpen(false); setSystemOpen(false); }}><span>{[..."KEYS"].map((letter, index) => <b key={`${letter}-${index}`}>{letter}</b>)}</span></button>
        <i />
        <button className={systemOpen ? "active" : ""} onClick={() => { setSystemOpen((open) => !open); setLogsOpen(false); setKeysOpen(false); }}><span>{[..."SYSTEM"].map((letter, index) => <b key={`${letter}-${index}`}>{letter}</b>)}</span></button>
      </nav>

      <section className={`composer main-view ${studioView === "create" ? "active" : ""}`}>
        <div className="eyebrow">CREATE</div><h1>Make a full song</h1>
        {generationJob && <div className={`job-banner create-job-banner ${generationJob.status}`}><div><strong>{generationJob.phase}</strong><span>{generationJob.error || timingLabel(generationJob)}</span></div><div className="progress"><i style={{ width: `${Math.round(generationJob.progress * 100)}%` }} /></div></div>}
        <div className="create-grid">
          <div className="create-direction">
            <div className="song-identity-grid"><label>Song title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Untitled Song" /></label><label>Artist name<input value={artist} onChange={(event) => setArtist(event.target.value)} placeholder="Your artist or band name" /></label></div>
            <label>Music description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={10} placeholder="Genre, tempo/key, mood progression, voice, arrangement and production…" />
              <div className="prompt-actions"><button type="button" className="templates-button" onClick={() => setTemplatesOpen(true)}>▦ Templates</button><button type="button" className="prompt-help-button" onClick={() => { setPromptImport(isStructuredCaption(description) ? "" : description); setPromptHelpOpen(true); }}>✦ Build or rewrite prompt</button></div>
            </label>
            <div className="create-options">
              <label className="switch"><input type="checkbox" checked={instrumental} onChange={(event) => setInstrumental(event.target.checked)} /><span />Instrumental</label>
              <label className="switch" title="On: decode in tiles to save VRAM. Off (default on this 3090): faster full decode, fewer seams."><input type="checkbox" checked={tiledDecode} onChange={(event) => setTiledDecode(event.target.checked)} /><span />Low-memory decode</label>
            </div>
            <label className="switch duration-switch"><input type="checkbox" checked={autoDuration} onChange={(event) => setAutoDuration(event.target.checked)} /><span />Auto duration</label>
            {autoDuration
              ? <div className="auto-duration-note"><strong>Natural ending</strong><span>Music 3 can use up to 5:00 and finish the song earlier when it reaches a natural ending.</span></div>
              : <label className="duration-control">Maximum duration <div className="range-row"><input type="range" min="10" max="300" step="5" value={duration} onChange={(event) => setDuration(Number(event.target.value))} /><b>{Math.floor(duration / 60)}:{String(duration % 60).padStart(2, "0")}</b></div></label>}
            <button type="button" className={`more-options-button ${moreOptions ? "open" : ""}`} aria-expanded={moreOptions} aria-controls="music3-more-options" onClick={() => setMoreOptions((open) => !open)}><svg className="options-sliders" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6" /></svg><span>More options</span><i className="options-chevron" aria-hidden="true" /></button>
            {moreOptions && <section className="more-options-card" id="music3-more-options">
              <div className="metadata-grid"><label>Album <input value={album} onChange={(event) => setAlbum(event.target.value)} placeholder="Optional album name" /></label><label>Genre <input value={genre} onChange={(event) => setGenre(event.target.value)} placeholder="Optional genre" /></label></div>
              <label>Exclude styles <input value={excludeStyles} onChange={(event) => setExcludeStyles(event.target.value)} placeholder="festival EDM drops, pop belting, trap hats…" /><small>Soft guidance: Music 3 has no separate negative-prompt channel.</small></label>
              {!instrumental && <label>Vocal gender <div className="segmented"><button type="button" className={vocalGender === "auto" ? "active" : ""} onClick={() => setVocalGender("auto")}>Auto</button><button type="button" className={vocalGender === "male" ? "active" : ""} onClick={() => setVocalGender("male")}>Male</button><button type="button" className={vocalGender === "female" ? "active" : ""} onClick={() => setVocalGender("female")}>Female</button></div></label>}
              <label>Creative latitude <div className="range-row"><input type="range" min="0" max="100" value={creativeLatitude} onChange={(event) => setCreativeLatitude(Number(event.target.value))} /><b>{creativeLatitude}%</b></div><small>Controls how broadly Music 3 explores musical possibilities. Lower is more predictable; higher allows less conventional choices.</small></label>
              <label>Direction strength <div className="range-row"><input type="range" min="0" max="100" value={directionStrength} onChange={(event) => setDirectionStrength(Number(event.target.value))} /><b>{directionStrength}%</b></div><small>Controls how firmly the arrangement follows your music description. Very high values can trade natural flow for stricter adherence.</small></label>
              <div className="advanced-row"><label>Refinement steps<input type="number" min="10" max="60" value={steps} onChange={(event) => setSteps(Math.max(10, Math.min(60, Number(event.target.value))))} /></label><label>Seed<input inputMode="numeric" value={lockedSeed} onChange={(event) => setLockedSeed(event.target.value.replace(/\D/g, ""))} placeholder="Random" /></label></div>
            </section>}
          </div>
          <div className="create-lyrics">
            {!instrumental ? <><label>Lyrics<div className="lyrics-toolbar"><div className="lyric-direction-pills"><span>Insert:</span>{["Spoken", "Spoken Countdown", "Whispered", "Chanted", "Rapped", "Call and Response"].map((tag) => <button type="button" key={tag} onClick={() => insertLyricDirection(tag)}>{tag}</button>)}</div><div className="lyric-ai-actions"><button type="button" className="lyric-ai-button" title={writingConfigured ? (writingEnabled ? "Rewrite the current lyrics" : "Uses your Writing key (turns Enable on)") : "Save a Writing key in KEYS first"} disabled={!lyrics.replace(/\[[^\]]+\]/g, "").trim()} onClick={() => openLyricAssist("create", "optimize")}>Optimize</button><button type="button" className="lyric-ai-button generate" title={writingConfigured ? "Open lyric idea helper" : "Save a Writing key in KEYS first"} onClick={() => openLyricAssist("create", "generate")}>Generate Lyrics</button><button type="button" className="prepare-lyrics-button" disabled={!lyrics.trim()} onClick={formatCurrentLyrics}>↻ Prepare pasted lyrics</button></div></div><textarea ref={lyricsField} value={lyrics} onChange={(event) => setLyrics(event.target.value)} rows={18} placeholder="[Verse]\nWords to sing…" /><small>Only official song-section tags remain in the lyric stream. Performance directions move into the Music Description.</small></label><div className="translation-grid"><label>Lyrics language<select value={lyricsLanguage} onChange={(event) => setLyricsLanguage(event.target.value)}>{LYRIC_LANGUAGES.map(([code, name]) => <option value={code} key={code}>{name}</option>)}</select></label><label>English translation (display only)<textarea value={englishTranslation} onChange={(event) => setEnglishTranslation(event.target.value)} rows={7} placeholder="One translated line for each sung lyric line. Section tags are optional." /><small>Saved for karaoke display and review. It is never sent to Music 3 or sung.</small></label></div></> : <div className="instrumental-stage"><span>♫</span><strong>Instrumental song</strong><p>Music 3 will build the arrangement from your description without vocals or written lyrics.</p></div>}
          </div>
        </div>
        <div className="create-footer">
          <button className="primary" disabled={!ready || Boolean(generationJob && ["queued", "running"].includes(generationJob.status))} onClick={createSong}>Create song</button>
          {generationJob && ["queued", "running"].includes(generationJob.status) && <button className="danger" onClick={() => void cancelJob(generationJob.id)}>Cancel</button>}
        </div>
        {!ready && <div className="truth-note">Run Setup MiniMax Music 3.bat to install the private single-GPU runtime and the three optimized model files. Nothing connects to ComfyUI or another generation server.</div>}
        {error && <div className="error">{error}</div>}
      </section>

      <section className={`library-pane main-view ${studioView === "library" ? "active" : ""}`}>
        <div className="library-head"><div><div className="eyebrow">LIBRARY</div><h2>{activePlaylist?.name ?? activeWorkspace?.name ?? (librarySection === "projects" ? "Studio Projects" : librarySection === "playlists" ? "Playlists" : librarySection === "workspaces" ? "Workspaces" : "My songs")}</h2></div><div className="library-head-actions">{(librarySection === "playlists" || librarySection === "workspaces") && <button onClick={() => { setCollectionName(""); setCollectionDialog(librarySection === "playlists" ? "playlist" : "workspace"); }}>+ New {librarySection === "playlists" ? "playlist" : "workspace"}</button>}{((librarySection === "playlists" && activePlaylist) || (librarySection === "workspaces" && activeWorkspace?.id !== "my-workspace")) && <button className="danger" disabled={libraryBusy} onClick={() => void removeCurrentCollection()}>Delete</button>}<span>{librarySongs.length} songs · {activeJobs} active</span></div></div>
        <nav className="library-sections" aria-label="Library sections"><button className={librarySection === "songs" ? "active" : ""} onClick={() => { setLibrarySection("songs"); setActivePlaylistId(null); setActiveWorkspaceId(null); }}>My songs</button><button className={librarySection === "playlists" ? "active" : ""} onClick={() => { setLibrarySection("playlists"); setActivePlaylistId(null); }}>Playlists</button><button className={librarySection === "workspaces" ? "active" : ""} onClick={() => { setLibrarySection("workspaces"); setActiveWorkspaceId(null); }}>Workspaces</button><button className={librarySection === "projects" ? "active" : ""} onClick={() => setLibrarySection("projects")}>Studio Projects</button></nav>
        {librarySection === "playlists" && !activePlaylist && <div className="collection-grid">{playlists.map((playlist) => <button key={playlist.id} onClick={() => setActivePlaylistId(playlist.id)}><span className="collection-icon">♫</span><strong>{playlist.name}</strong><small>{playlist.song_ids.length} songs</small></button>)}{playlists.length === 0 && <div className="collection-empty">Create a playlist to collect songs without moving them from their workspace.</div>}</div>}
        {librarySection === "workspaces" && !activeWorkspace && <div className="collection-grid">{workspaces.map((workspace) => <button key={workspace.id} onClick={() => setActiveWorkspaceId(workspace.id)}><span className="collection-icon workspace-icon">▣</span><strong>{workspace.name}</strong><small>{workspace.song_ids.length} songs</small></button>)}</div>}
        {(activePlaylist || activeWorkspace) && <button className="collection-back" onClick={() => { setActivePlaylistId(null); setActiveWorkspaceId(null); }}>← Back to {librarySection}</button>}
        {generationJob && <div className={`job-banner ${generationJob.status}`}><div><strong>{generationJob.phase}</strong><span>{generationJob.error || timingLabel(generationJob)}</span></div><div className="progress"><i style={{ width: `${Math.round(generationJob.progress * 100)}%` }} /></div>{generationJob.stage_progress != null && generationJob.phase.includes("thumbnail") && <div className="stage-progress"><span>Thumbnail</span><b>{Math.round(generationJob.stage_progress * 100)}%</b><div className="progress"><i style={{ width: `${Math.round(generationJob.stage_progress * 100)}%` }} /></div></div>}</div>}
        {showLibrarySongs && <div className="song-list">{librarySongs.length === 0 && <div className="empty"><strong>{librarySection === "projects" ? "No Studio projects yet" : "No songs here yet"}</strong><span>{librarySection === "projects" ? "Open a song in Studio and save the session to create a project." : "Add songs from their action menu."}</span></div>}
          {librarySongs.map((song) => <article className={`song ${openMenu === song.id ? "menu-open" : ""} ${selectedSongId === song.id ? "selected" : ""} ${expandedStems === song.id ? "stems-open" : ""}`} key={song.id} onClick={() => setSelectedSongId(song.id)}>
            <button className={`play ${coverSources[song.id] ? "has-cover" : ""}`} style={coverSources[song.id] ? { backgroundImage: `linear-gradient(rgba(5,8,20,.25),rgba(5,8,20,.42)),url(${coverSources[song.id]})` } : undefined} onClick={() => setPlaying(playing === song.id ? null : song.id)}>{playing === song.id ? "Ⅱ" : "▶"}</button>
            {Boolean(song.stems?.length) && <button
              className="stem-tree-button"
              style={coverSources[song.id] ? { backgroundImage: `linear-gradient(rgba(7,10,25,.68),rgba(21,17,48,.88)),url(${coverSources[song.id]})` } : undefined}
              title="Stems"
              aria-label={`Stems for ${song.title}`}
              aria-expanded={expandedStems === song.id}
              onClick={(event) => { event.stopPropagation(); setOpenMenu(null); setExpandedStems(expandedStems === song.id ? null : song.id); }}
            ><span className="stem-tree-icon" aria-hidden="true"><i /><i /><i /></span><b>{song.stems?.length}</b></button>}
            <div className="song-copy"><strong>{song.title}</strong><p>{song.description}</p><span>{song.artist ? `${song.artist} · ` : ""}{song.album ? `${song.album} · ` : ""}{song.instrumental ? "Instrumental" : "Vocal song"} · seed {song.seed} · {song.created_at}</span></div>
            <div className="song-menu-anchor" data-song-menu>
              <button className="dots" aria-label={`More actions for ${song.title}`} aria-expanded={openMenu === song.id} onClick={(event) => { event.stopPropagation(); toggleSongMenu(song.id, event.currentTarget); }}>•••</button>
              {openMenu === song.id && songMenuPosition && <div className={`song-menu side-popout side-${songMenuPosition.side}`} style={{ left: songMenuPosition.left, top: songMenuPosition.top, maxHeight: songMenuPosition.maxHeight }} role="menu">
                <button onClick={() => reuseSong(song)}><span className="menu-icon" aria-hidden="true">↻</span>Reuse as new song</button>
                <button onClick={() => void openAudioEditor(song)}><span className="menu-icon" aria-hidden="true">≋</span>Open in Studio</button>
                <button onClick={() => void openVideoStudio(song)}><span className="menu-icon" aria-hidden="true">▶</span>Make video</button>
                <button onClick={() => editSong(song)}><span className="menu-icon" aria-hidden="true">✎</span>Edit song details</button>
                {status?.cover_art.ready && <button onClick={() => { setOpenMenu(null); setCoverDirection(""); setCoverTarget(song); }}><span className="menu-icon" aria-hidden="true">✦</span>Generate cover art</button>}
                {status?.lyrics_sync.ready && !song.instrumental && Boolean(song.lyrics?.trim()) && <button onClick={() => void startLyricsSync(song)}><span className="menu-icon" aria-hidden="true">≡</span>{song.timed_lyrics?.lines?.length ? "Re-sync lyrics" : "Sync lyrics"}</button>}
                {status?.stems.ready && <button onClick={() => { setOpenMenu(null); setStemTarget(song); }}><span className="menu-icon" aria-hidden="true">⑂</span>Extract stems</button>}
                <div className={`song-submenu-anchor ${openSongSubmenu === `playlist:${song.id}` ? "open" : ""}`}>
                  <button className="submenu-trigger" aria-haspopup="menu" aria-expanded={openSongSubmenu === `playlist:${song.id}`} onClick={(event) => { event.stopPropagation(); setOpenSongSubmenu(openSongSubmenu === `playlist:${song.id}` ? null : `playlist:${song.id}`); }}><span className="menu-icon" aria-hidden="true">＋</span>Add to playlist<span className="submenu-chevron" aria-hidden="true">›</span></button>
                  <div className="song-download-menu collection-submenu" role="menu">{playlists.map((playlist) => <button key={playlist.id} disabled={playlist.song_ids.includes(song.id)} onClick={() => void addToPlaylist(song, playlist)}><span className="menu-icon" aria-hidden="true">♫</span>{playlist.name}{playlist.song_ids.includes(song.id) && <small>Added</small>}</button>)}<button onClick={() => { setOpenMenu(null); setSongMenuPosition(null); setCollectionName(""); setCollectionDialog("playlist"); }}><span className="menu-icon" aria-hidden="true">＋</span>New playlist</button></div>
                </div>
                {librarySection === "playlists" && activePlaylist?.song_ids.includes(song.id) && <button onClick={() => void removeFromActivePlaylist(song)}><span className="menu-icon" aria-hidden="true">−</span>Remove from playlist</button>}
                <div className={`song-submenu-anchor ${openSongSubmenu === `workspace:${song.id}` ? "open" : ""}`}>
                  <button className="submenu-trigger" aria-haspopup="menu" aria-expanded={openSongSubmenu === `workspace:${song.id}`} onClick={(event) => { event.stopPropagation(); setOpenSongSubmenu(openSongSubmenu === `workspace:${song.id}` ? null : `workspace:${song.id}`); }}><span className="menu-icon" aria-hidden="true">▣</span>Move to workspace<span className="submenu-chevron" aria-hidden="true">›</span></button>
                  <div className="song-download-menu collection-submenu" role="menu">{workspaces.map((workspace) => <button key={workspace.id} disabled={workspace.song_ids.includes(song.id)} onClick={() => void moveToWorkspace(song, workspace)}><span className="menu-icon" aria-hidden="true">▣</span>{workspace.name}{workspace.song_ids.includes(song.id) && <small>Current</small>}</button>)}<button onClick={() => { setOpenMenu(null); setSongMenuPosition(null); setCollectionName(""); setCollectionDialog("workspace"); }}><span className="menu-icon" aria-hidden="true">＋</span>New workspace</button></div>
                </div>
                <div className={`song-submenu-anchor ${openSongSubmenu === `download:${song.id}` ? "open" : ""}`}>
                  <button className="submenu-trigger" aria-haspopup="menu" aria-expanded={openSongSubmenu === `download:${song.id}`} onClick={(event) => { event.stopPropagation(); setOpenSongSubmenu(openSongSubmenu === `download:${song.id}` ? null : `download:${song.id}`); }}><span className="menu-icon" aria-hidden="true">⇩</span>Download<span className="submenu-chevron" aria-hidden="true">›</span></button>
                  <div className="song-download-menu" role="menu">
                    <button onClick={() => downloadSong(song)}><span className="menu-icon format-icon" aria-hidden="true">W</span>Download WAV</button>
                    {status?.exports.ready && <button disabled={libraryBusy} onClick={() => void exportSong(song, "mp3")}><span className="menu-icon format-icon" aria-hidden="true">M</span>Download MP3 <small>V0</small></button>}
                    {status?.exports.ready && <button disabled={libraryBusy} onClick={() => void exportSong(song, "flac")}><span className="menu-icon format-icon" aria-hidden="true">F</span>Download FLAC</button>}
                  </div>
                </div>
                <button onClick={() => void openSongFolder(songFolderName(song)).then(() => setOpenMenu(null)).catch((reason) => setError(reason.message))}><span className="menu-icon" aria-hidden="true">▣</span>Open song folder</button>
                <button className="menu-danger" onClick={() => { setOpenMenu(null); setOpenSongSubmenu(null); setDeleteError(""); setDeleteTarget(song); }}><span className="menu-icon" aria-hidden="true">⌫</span>Delete song</button>
              </div>}
            </div>
            {playing === song.id && audioSources[song.id] && <SongVisualizer src={audioSources[song.id]} timedLyrics={song.timed_lyrics} onEnded={() => setPlaying(null)} />}
            {expandedStems === song.id && Boolean(song.stems?.length) && <section className="stem-branch-panel" onClick={(event) => event.stopPropagation()} aria-label={`Separated stems for ${song.title}`}>
              <div className="stem-branch-copy"><span className="stem-trunk" aria-hidden="true" />{song.stems?.map((file) => <span className={`stem-child stem-${file.replace(/\.wav$/i, "").replace(/_/g, "-")}`} key={file}>{stemLabel(file)}</span>)}</div>
              <button className="primary move-stems-button" onClick={() => void openAudioEditor(song)}>Move stems to Studio</button>
            </section>}
          </article>)}
        </div>}
      </section>

      {studioView === "effects" && <EffectsPage ready={Boolean(status?.sound_effects.ready)} detail={status?.sound_effects.detail ?? "Install the local sound-effects model and runtime to enable generation."} songs={songs} onOpenStudio={(folder) => void openStudioFromEffects(folder)} />}

      <nav className="edge-tabs right-edge" aria-label="Song panels">
        <button className={rightDrawer === "job" ? "active" : ""} onClick={() => setRightDrawer(rightDrawer === "job" ? null : "job")}><span>{[..."JOB"].map((letter, index) => <b key={`${letter}-${index}`}>{letter}</b>)}</span></button>
        <i />
        <button className={rightDrawer === "details" ? "active" : ""} onClick={() => setRightDrawer(rightDrawer === "details" ? null : "details")}><span>{[..."DETAILS"].map((letter, index) => <b key={`${letter}-${index}`}>{letter}</b>)}</span></button>
      </nav>
    </main>

    {systemOpen && <aside className="system-drawer left-drawer" style={{ width: leftDrawerWidth }}><div className="drawer-resizer right" role="separator" aria-label="Resize System panel" onPointerDown={(event) => beginDrawerResize("left", event)} />
      <div className="drawer-head"><div><div className="eyebrow">SYSTEM</div><h2>Local resources</h2></div><button aria-label="Close System" onClick={() => setSystemOpen(false)}>✕</button></div>
      <button className={`memory memory-top ${status?.service.worker_loaded ? "memory-loaded" : "memory-empty"}`} disabled={activeJobs > 0 || !status?.service.worker_loaded} onClick={() => void clearMemory().then(refresh).catch((reason) => setError(reason.message))}>{status?.service.worker_loaded ? "Clear VRAM and Cache" : "VRAM and Cache Clear"}</button>
      <p className="drawer-note">{status?.service.worker_loaded ? "Red means Music 3 is loaded in GPU memory. Clear it when you are finished generating; the next song will reload the model." : "Green means the Music 3 worker is unloaded and its cached GPU memory has been released."}</p>
      <div className="eyebrow">GPU</div>
      <section className="card kv"><span>device</span><b>{gpu?.name ?? "—"}</b><span>usage</span><b>{gpu?.usage == null ? "—" : `${gpu.usage}%`}</b><span>temperature</span><b>{gpu?.temperature == null ? "—" : `${gpu.temperature} °C`}</b><span>VRAM free</span><b>{gpu?.vram_free_mb ? `${(gpu.vram_free_mb / 1024).toFixed(1)} GB` : "—"}</b><span>driver</span><b>{gpu?.driver ?? "—"}</b></section>
      <div className="eyebrow">MUSIC 3 ENGINE</div>
      <section className="card kv"><span>checkpoint</span><b>{status?.model.ready ? "complete" : "not installed"}</b><span>detected</span><b>{modelSize} GB</b><span>components</span><b>{status ? `${status.model.present}/${status.model.required}` : "—"}</b></section>
      <p className="path">{status?.model.root}</p>
      <div className="eyebrow">COVER ART MODEL</div>
      <section className="card kv"><span>status</span><b>{status?.cover_art.ready ? "installed" : "not installed"}</b><span>automatic art</span><b>{status?.cover_art.ready ? "enabled" : "disabled"}</b><span>renderer</span><b>SD 1.5 · 512×512</b></section>
      <p className="path">{status?.cover_art.detail}</p>
      <div className="eyebrow">STEM EXTRACTION</div>
      <section className="card kv"><span>status</span><b>{status?.stems.ready ? "ready" : "not installed"}</b><span>model</span><b>{status?.stems.model ?? "htdemucs"}</b><span>processor</span><b>CUDA GPU</b></section>
      <p className="path">{status?.stems.detail}</p>
      <div className="eyebrow">SOUND-EFFECT GENERATION</div>
      <section className="card kv"><span>status</span><b>{status?.sound_effects.ready ? "ready" : status?.sound_effects.runtime_ready ? "model missing" : "setup needed"}</b><span>model</span><b>{status?.sound_effects.model ?? "Stable Audio 3 Small SFX"}</b><span>processor</span><b>{status?.sound_effects.processor ?? "CPU"}</b></section>
      <p className="path">{status?.sound_effects.detail}</p>
      <div className="eyebrow">LYRIC SYNCHRONIZATION</div>
      <section className="card kv"><span>status</span><b>{status?.lyrics_sync.ready ? "ready" : "optional setup needed"}</b><span>aligner</span><b>{status?.lyrics_sync.model ?? "WhisperX"}</b><span>processor</span><b>CUDA GPU</b></section>
      <p className="path">{status?.lyrics_sync.detail}</p>
      <button className="system-action" disabled={refreshingModels} onClick={() => { setRefreshingModels(true); void refreshModels().then(refresh).catch((reason) => setError(reason.message)).finally(() => setRefreshingModels(false)); }}>{refreshingModels ? "Checking Music 3 files…" : "Check Music 3 files"}</button>
      <button className="system-action" onClick={openOutputFolder}>Open output folder</button>
      <div className="eyebrow">RUNTIME</div>
      <section className={`runtime-card ${ready ? "ready" : "blocked"}`}><strong>{ready ? "Ready to generate" : "Setup needed"}</strong><p>{blocker}</p><code>Private local worker · no external service</code></section>
    </aside>}
    <Logs open={logsOpen} onClose={() => setLogsOpen(false)} width={leftDrawerWidth} onResizeStart={(event) => beginDrawerResize("left", event)} />
    <KeysDrawer open={keysOpen} onClose={() => setKeysOpen(false)} width={leftDrawerWidth} onResizeStart={(event) => beginDrawerResize("left", event)} />
    {rightDrawer === "job" && <aside className="right-drawer job-drawer" style={{ width: rightDrawerWidth }}><div className="drawer-resizer left" role="separator" aria-label="Resize Job panel" onPointerDown={(event) => beginDrawerResize("right", event)} /><div className="drawer-head"><div><div className="eyebrow">CURRENT JOB</div><h2>{displayJob?.kind === "music3" ? "Song generation" : displayJob?.kind === "cover_art" ? "Cover art" : displayJob?.kind === "stems" ? "Stem extraction" : displayJob?.kind === "lyrics_sync" ? "Lyric synchronization" : "Generation"}</h2></div><button onClick={() => setRightDrawer(null)}>✕</button></div>{displayJob ? <><div className={`job-banner ${displayJob.status}`}><div><strong>{displayJob.phase}</strong><span>{displayJob.error || timingLabel(displayJob)}</span></div><div className="progress"><i style={{ width: `${Math.round(displayJob.progress * 100)}%` }} /></div>{displayJob.stage_progress != null && displayJob.phase.includes("thumbnail") && <div className="stage-progress"><span>Thumbnail</span><b>{Math.round(displayJob.stage_progress * 100)}%</b><div className="progress"><i style={{ width: `${Math.round(displayJob.stage_progress * 100)}%` }} /></div></div>}</div><section className="card kv"><span>status</span><b>{displayJob.status}</b><span>progress</span><b>{Math.round(displayJob.progress * 100)}%</b><span>elapsed</span><b>{elapsedLabel(displayJob)}</b><span>remaining</span><b>{remainingLabel(displayJob) || "—"}</b><span>active jobs</span><b>{activeJobs}</b></section>{["queued", "running"].includes(displayJob.status) && <button className="danger memory" onClick={() => void cancelJob(displayJob.id)}>Cancel {displayJob.kind === "music3" ? "generation" : "task"}</button>}</> : <div className="drawer-empty"><span>♫</span><strong>No active generation</strong><p>Your next Music 3 job will appear here with live progress and cancellation.</p></div>}</aside>}
    {rightDrawer === "details" && <aside className="right-drawer details-drawer" style={{ width: rightDrawerWidth }}><div className="drawer-resizer left" role="separator" aria-label="Resize Details panel" onPointerDown={(event) => beginDrawerResize("right", event)} /><div className="drawer-head"><div><div className="eyebrow">SONG DETAILS</div><h2>{selectedSong?.title ?? "No song selected"}</h2></div><button onClick={() => setRightDrawer(null)}>✕</button></div>{selectedSong ? <><p className="details-summary">{selectedSong.description}</p><section className="card kv"><span>artist</span><b>{selectedSong.artist || "Not set"}</b><span>album</span><b>{selectedSong.album || "Not set"}</b><span>genre</span><b>{selectedSong.genre || "Not set"}</b><span>year / track</span><b>{[selectedSong.year, selectedSong.track_number].filter(Boolean).join(" / ") || "Not set"}</b><span>type</span><b>{selectedSong.instrumental ? "Instrumental" : "Vocal"}</b><span>seed</span><b>{selectedSong.seed}</b><span>lyrics</span><b>{selectedSong.timed_lyrics?.lines?.length ? `${selectedSong.timed_lyrics.lines.length} timed lines` : "not synchronized"}</b><span>created</span><b>{selectedSong.created_at}</b></section>{selectedSong.lyrics && <section className="details-lyrics"><div className="eyebrow">LYRICS</div><pre>{selectedSong.lyrics}</pre></section>}{selectedSong.english_translation && <section className="details-lyrics"><div className="eyebrow">ENGLISH TRANSLATION</div><pre>{selectedSong.english_translation}</pre></section>}<div className="detail-actions"><button onClick={() => editSong(selectedSong)}>Edit details</button><button disabled={!status?.lyrics_sync.ready || selectedSong.instrumental} onClick={() => void startLyricsSync(selectedSong)}>{selectedSong.timed_lyrics?.lines?.length ? "Re-sync lyrics" : "Sync lyrics"}</button><button onClick={() => void openAudioEditor(selectedSong)}>Studio</button><button onClick={() => void openVideoStudio(selectedSong)}>Make video</button><button onClick={() => reuseSong(selectedSong)}>Reuse song</button><button onClick={() => downloadSong(selectedSong)}>Download WAV</button><button onClick={() => void openSongFolder(songFolderName(selectedSong))}>Open folder</button></div></> : <div className="drawer-empty"><span>♫</span><strong>Select a song</strong><p>Choose a library song to see its saved prompt, seed, lyrics, and actions.</p></div>}</aside>}
    {videoTool && <section className="tool-workspace video-tool-workspace" aria-label={`Video Studio for ${videoTool.song.title}`}><header className="tool-head"><div><div className="eyebrow">STUDIO TOOL</div><h2>Video Studio</h2><span>{videoTool.song.title} · local visualizer and MP4 renderer</span></div><button onClick={() => setVideoTool(null)}>Close</button></header><iframe title={`Video Studio — ${videoTool.song.title}`} src={videoTool.url} allow="autoplay" /></section>}
    {activeEditorSong && <SongStudio song={activeEditorSong} mixUrl={editorSource} stemJob={utilityJob?.kind === "stems" ? utilityJob : null} stemsReady={Boolean(status?.stems.ready)} soundEffectsReady={Boolean(status?.sound_effects.ready)} soundEffectsDetail={status?.sound_effects.detail ?? "Sound-effects setup is not installed."} onStartStems={() => void startStudioStems()} onClose={() => { setEditorSong(null); void refresh(); }} />}
    {templatesOpen && <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setTemplatesOpen(false); }}>
      <section className="template-browser" role="dialog" aria-modal="true" aria-labelledby="template-browser-title">
        <div className="modal-head template-head"><div><div className="eyebrow">MUSIC 3 STARTING POINTS</div><h2 id="template-browser-title">Start with a template</h2></div><button aria-label="Close templates" onClick={() => setTemplatesOpen(false)}>✕</button></div>
        <div className="template-grid">{Object.entries(STYLE_PRESETS).map(([name, preset]) => <button type="button" className="template-card" key={name} onClick={() => choosePreset(name)}><img className="template-art" src={TEMPLATE_ART[name]} alt="" /><span><strong>{name}</strong><small>{preset.genre}. {preset.mood}</small></span><b>Use template</b></button>)}</div>
      </section>
    </div>}
    {promptHelpOpen && <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setPromptHelpOpen(false); }}>
      <section className="modal-card prompt-helper" role="dialog" aria-modal="true" aria-labelledby="prompt-helper-title">
        <div className="modal-head"><div><div className="eyebrow">MUSIC 3 PROMPT HELP</div><h2 id="prompt-helper-title">Build a structured music description</h2></div><button aria-label="Close" onClick={() => setPromptHelpOpen(false)}>✕</button></div>
        <p className="modal-note">This creates one finished Music Description—not a second prompt. Music 3 works best with a detailed timeline under Global Metadata, Vocal Details, and Arrangement. The finished description is expanded for you.</p>
        <section className="prompt-import">
          <label>Paste an existing prompt<textarea rows={4} value={promptImport} onChange={(event) => setPromptImport(event.target.value)} placeholder="Paste a Suno-style prompt, comma-separated style list, or your own plain-language description…" /></label>
          <div><span>We will sort its tempo, voices, instruments, production, mood, and exclusions into the fields below. You can edit everything before applying it.</span><button type="button" className="rewrite-button" disabled={!promptImport.trim()} onClick={analyzeImportedPrompt}>↻ Analyze and rebuild</button></div>
        </section>
        <div className="helper-presets">{Object.keys(STYLE_PRESETS).map((name) => <button type="button" key={name} onClick={() => choosePreset(name)}>{name}</button>)}</div>
        <div className="prompt-helper-grid"><label>Genre and subgenre<input value={promptGenre} onChange={(event) => setPromptGenre(event.target.value)} /></label><label>Tempo, key and scale<input value={promptTempo} onChange={(event) => setPromptTempo(event.target.value)} /></label></div>
        <label>Mood progression<input value={promptMood} onChange={(event) => setPromptMood(event.target.value)} placeholder="How the emotion changes from intro to outro" /></label>
        {!instrumental && <><div className="prompt-helper-grid"><label>Vocal profile<select value={vocalProfile} onChange={(event) => { const next = event.target.value; setVocalProfile(next); setPromptDeliveryOverride(null); if (next !== "custom") setPromptVoice(VOCAL_PROFILES[next]); }}><option value="custom">Custom description</option><option value="female-male-duet">Female lead + male response</option><option value="clear-alto">Clear natural alto</option><option value="smoky-mezzo">Smoky low mezzo</option><option value="weathered-tenor">Weathered tenor</option><option value="soft-androgynous">Soft androgynous voice</option></select></label><label>Vocal delivery<select value={vocalDelivery} onChange={(event) => { setVocalDelivery(event.target.value); setPromptDeliveryOverride(null); }}><option value="melodic">Melodic singing</option><option value="expressive">Expressive singing</option><option value="rhythmic">Rhythmic singing</option><option value="theatrical">Theatrical singing</option></select>{promptDeliveryOverride && <small>Specialized delivery from the selected template is active.</small>}</label></div><label>Voice character<textarea rows={4} value={promptVoice} onChange={(event) => { setVocalProfile("custom"); setPromptVoice(event.target.value); }} placeholder="Name Singer A and Singer B separately when you want a duet; state exactly who leads, answers, and harmonizes" /></label></>}
        <label>Arrangement<textarea rows={3} value={promptArrangement} onChange={(event) => setPromptArrangement(event.target.value)} placeholder="Instruments, groove and how the sections evolve" /></label>
        <label>Production and mix<textarea rows={3} value={promptProduction} onChange={(event) => setPromptProduction(event.target.value)} /></label>
        <label>Avoid / exclude styles<input value={excludeStyles} onChange={(event) => setExcludeStyles(event.target.value)} placeholder="Modern pop vocal, double-time drums, trailer percussion…" /><small>Music 3 has no separate negative-prompt channel. These are converted into positive arrangement constraints when you generate.</small></label>
        <div className="prompt-tags"><span>Useful lyric tags:</span><code>[Intro]</code><code>[Verse]</code><code>[Pre-Chorus]</code><code>[Chorus]</code><code>[Post-Chorus]</code><code>[Bridge]</code><code>[Instrumental]</code><code>[Solo]</code><code>[Outro]</code></div>
        <div className="modal-actions"><button onClick={() => setPromptHelpOpen(false)}>Cancel</button><button className="primary" onClick={applyPromptHelp}>Use this description</button></div>
      </section>
    </div>}
    {lyricAssist && <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && !lyricBusy) setLyricAssist(null); }}>
      <section className="modal-card lyric-assist-modal" role="dialog" aria-modal="true" aria-labelledby="lyric-assist-title">
        <div className="modal-head"><div><div className="eyebrow">WRITING</div><h2 id="lyric-assist-title">{lyricAssist.mode === "optimize" ? "Optimize lyrics" : "Input your idea for lyric generation"}</h2></div><button aria-label="Close" disabled={lyricBusy} onClick={() => setLyricAssist(null)}>✕</button></div>
        {lyricAssist.mode === "generate" && !lyricPreview && <label>Explain the lyrics you’re looking for, or give me a theme or topic.<textarea rows={5} autoFocus value={lyricIdea} onChange={(event) => setLyricIdea(event.target.value)} placeholder="A midnight walk home, two people who will not say the real thing…" /></label>}
        {lyricAssist.mode === "optimize" && !lyricPreview && <p className="modal-note">This rewrites the current lyrics with MiniMax Music 3 section tags. Meaning stays; repeats get tightened. Preview before Apply.</p>}
        {lyricPreview && <label>Lyrics preview<textarea rows={14} value={lyricPreview} onChange={(event) => setLyricPreview(event.target.value)} /><small>{lyricPreviewTitle ? `Suggested title if yours is empty: ${lyricPreviewTitle}` : "Section tags only. Apply writes this into the lyrics box."}</small></label>}
        {lyricPreviewDescription && <label>Music description found<textarea rows={8} value={lyricPreviewDescription} onChange={(event) => setLyricPreviewDescription(event.target.value)} /><small>Apply will move this into Music Description, not the lyrics.</small></label>}
        {lyricError && <div className="error">{lyricError}</div>}
        <p className="modal-note">{writingEnabled ? "This uses your enabled Writing key." : writingConfigured ? "The first generate turns Writing Enable on so this key can be used. Uncheck Enable in KEYS later to stop spending." : "Save a Writing key in KEYS first."}</p>
        <div className="modal-actions">
          <button disabled={lyricBusy} onClick={() => setLyricAssist(null)}>Cancel</button>
          {!lyricPreview && lyricAssist.mode === "generate" && <button disabled={lyricBusy} onClick={() => void runLyricAssist(true)}>{lyricBusy ? "Writing…" : "Generate random lyrics"}</button>}
          {!lyricPreview && <button className="primary" disabled={lyricBusy} onClick={() => void runLyricAssist(false)}>{lyricBusy ? "Writing…" : lyricAssist.mode === "optimize" ? "Optimize" : "Generate lyrics"}</button>}
          {lyricPreview && <button disabled={lyricBusy} onClick={() => void runLyricAssist(lyricAssist.mode === "generate" && !lyricIdea.trim())}>Try again</button>}
          {lyricPreview && <button className="primary" disabled={!lyricPreview.trim()} onClick={applyLyricAssist}>Apply to lyrics</button>}
        </div>
      </section>
    </div>}
    {collectionDialog && <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setCollectionDialog(null); }}><section className="modal-card collection-dialog" role="dialog" aria-modal="true" aria-labelledby="collection-dialog-title"><div className="modal-head"><div><div className="eyebrow">LIBRARY</div><h2 id="collection-dialog-title">New {collectionDialog}</h2></div><button onClick={() => setCollectionDialog(null)}>✕</button></div><label>{collectionDialog === "playlist" ? "Playlist" : "Workspace"} name<input autoFocus maxLength={80} value={collectionName} onChange={(event) => setCollectionName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveCollection(); }} placeholder={collectionDialog === "playlist" ? "Road trip favorites" : "Album project"} /></label><p className="modal-note">{collectionDialog === "playlist" ? "A song can appear in as many playlists as you like." : "Moving a song here changes its primary workspace. Every song belongs to one workspace."}</p>{error && <div className="error">{error}</div>}<div className="modal-actions"><button onClick={() => setCollectionDialog(null)}>Cancel</button><button className="primary" disabled={libraryBusy || !collectionName.trim()} onClick={() => void saveCollection()}>{libraryBusy ? "Creating…" : `Create ${collectionDialog}`}</button></div></section></div>}
    {editingSong && <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setEditingSong(null); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="edit-song-title">
        <div className="modal-head"><div><div className="eyebrow">LIBRARY</div><h2 id="edit-song-title">Edit song details</h2></div><button aria-label="Close" onClick={() => setEditingSong(null)}>✕</button></div>
        <section className="edit-cover-section"><div className={`edit-cover-preview ${coverSources[editingSong.id] ? "has-cover" : ""}`} style={coverSources[editingSong.id] ? { backgroundImage: `url(${coverSources[editingSong.id]})` } : undefined}>{!coverSources[editingSong.id] && <span>♪</span>}</div><div className="edit-cover-actions"><strong>Cover artwork</strong><p>This artwork is embedded in MP3 and FLAC downloads.</p><input ref={coverUploadInput} className="cover-upload-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadEditedCover(file); }} /><button type="button" disabled={libraryBusy} onClick={() => coverUploadInput.current?.click()}>Upload your own art</button><label>AI visual direction<input value={editCoverDirection} onChange={(event) => setEditCoverDirection(event.target.value)} placeholder="Optional — leave blank to use the song details" /></label><button type="button" className="cover-regenerate-button" disabled={libraryBusy || !status?.cover_art.ready || Boolean(utilityJob && utilityJob.kind === "cover_art" && ["queued", "running"].includes(utilityJob.status))} onClick={() => void regenerateEditedCover()}>{utilityJob && utilityJob.kind === "cover_art" && ["queued", "running"].includes(utilityJob.status) ? "Generating cover…" : "Regenerate cover art"}</button>{utilityJob?.kind === "cover_art" && ["queued", "running"].includes(utilityJob.status) && <div className="edit-cover-job"><span>{utilityJob.phase}</span><b>{Math.round(utilityJob.progress * 100)}%</b><div className="progress"><i style={{ width: `${Math.round(utilityJob.progress * 100)}%` }} /></div></div>}{utilityJob?.kind === "cover_art" && utilityJob.status === "failed" && <div className="error">{utilityJob.error || "Cover generation failed."}</div>}</div></section>
        <label>Song title<input autoFocus value={editTitle} maxLength={120} onChange={(event) => setEditTitle(event.target.value)} /></label>
        <div className="metadata-grid"><label>Artist<input value={editArtist} maxLength={160} onChange={(event) => setEditArtist(event.target.value)} placeholder="Artist or band name" /></label><label>Album<input value={editAlbum} maxLength={160} onChange={(event) => setEditAlbum(event.target.value)} placeholder="Album name" /></label><label>Genre<input value={editGenre} maxLength={120} onChange={(event) => setEditGenre(event.target.value)} placeholder="Genre" /></label><label>Year<input value={editYear} inputMode="numeric" maxLength={4} onChange={(event) => setEditYear(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="2026" /></label><label>Track number<input value={editTrackNumber} maxLength={7} onChange={(event) => setEditTrackNumber(event.target.value.replace(/[^\d/]/g, ""))} placeholder="1 or 1/12" /></label></div>
        <label>Music description<textarea rows={7} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></label>
        {!editingSong.instrumental && <><label>Lyrics language<select value={editLyricsLanguage} onChange={(event) => setEditLyricsLanguage(event.target.value)}>{LYRIC_LANGUAGES.map(([code, name]) => <option value={code} key={code}>{name}</option>)}</select></label><label>Lyrics<div className="lyrics-toolbar edit-lyrics-toolbar"><div className="lyric-ai-actions"><button type="button" className="lyric-ai-button" disabled={!editLyrics.replace(/\[[^\]]+\]/g, "").trim()} onClick={() => openLyricAssist("edit", "optimize")}>Optimize</button><button type="button" className="lyric-ai-button generate" onClick={() => openLyricAssist("edit", "generate")}>Generate Lyrics</button></div></div><textarea rows={10} value={editLyrics} onChange={(event) => setEditLyrics(event.target.value)} /></label><label>English translation (display only)<textarea rows={8} value={editTranslation} onChange={(event) => setEditTranslation(event.target.value)} placeholder="One translated line for each sung line" /><small>The translation appears beneath synchronized lyrics and is never sung.</small></label></>}
        <p className="modal-note">This updates the saved library details. If lyrics changed, run Re-sync lyrics so playback timing matches the new words.</p>
        <div className="modal-actions"><button onClick={() => setEditingSong(null)}>Cancel</button><button className="primary" disabled={libraryBusy || !editTitle.trim()} onClick={() => void saveSongDetails()}>{libraryBusy ? "Saving…" : "Save changes"}</button></div>
      </section>
    </div>}
    {deleteTarget && <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}>
      <section className="modal-card confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="delete-song-title">
        <div className="eyebrow">DELETE SONG</div><h2 id="delete-song-title">Remove “{deleteTarget.title}”?</h2>
        <p>This permanently removes its WAV file and saved details from the MiniMaxM3 library.</p>
        {deleteError && <div className="error">{deleteError}</div>}
        <div className="modal-actions"><button onClick={() => setDeleteTarget(null)}>Keep song</button><button className="danger" disabled={libraryBusy} onClick={() => void removeSong()}>{libraryBusy ? "Deleting…" : "Delete song"}</button></div>
      </section>
    </div>}
    {coverTarget && <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setCoverTarget(null); }}>
      <section className="modal-card cover-dialog" role="dialog" aria-modal="true" aria-labelledby="cover-title">
        <div className="modal-head"><div><div className="eyebrow">COVER ART</div><h2 id="cover-title">Regenerate “{coverTarget.title}”</h2></div><button onClick={() => setCoverTarget(null)}>✕</button></div>
        <div className="cover-dialog-preview">{coverSources[coverTarget.id] ? <img src={coverSources[coverTarget.id]} alt="Current cover" /> : <span>♫</span>}<p>The new image replaces this cover only after generation succeeds.</p></div>
        <label>Optional visual direction<textarea autoFocus rows={5} value={coverDirection} onChange={(event) => setCoverDirection(event.target.value)} placeholder="Example: close-up red high heels beside a neon dance floor. Leave blank to use the saved song details." /></label>
        <p className="modal-note">The saved title, music description, and lyrics are always included. This box lets you steer the subject or composition.</p>
        <div className="modal-actions"><button onClick={() => setCoverTarget(null)}>Cancel</button><button className="primary" disabled={libraryBusy} onClick={() => void startCover()}>{libraryBusy ? "Starting…" : "Generate new cover"}</button></div>
      </section>
    </div>}
    {downloadNotice && <div className="download-toast" role="status" aria-live="polite"><span aria-hidden="true">✓</span><div><strong>Download started</strong><p>{downloadNotice.replace(/^Download started — /, "")}</p></div><button aria-label="Dismiss download message" onClick={() => setDownloadNotice("")}>✕</button></div>}
    {stemTarget && <div className="modal-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget && utilityJob?.kind !== "stems") setStemTarget(null); }}>
      <section className="modal-card stems-dialog" role="dialog" aria-modal="true" aria-labelledby="stems-title">
        <div className="modal-head"><div><div className="eyebrow">STEM EXTRACTION</div><h2 id="stems-title">Separate “{stemTarget.title}”</h2></div><button onClick={() => setStemTarget(null)}>✕</button></div>
        {utilityJob?.kind === "stems" && utilityJob.status === "succeeded" && utilityJob.result?.folder === songFolderName(stemTarget) && utilityJob.result?.files ? <><p className="modal-note">Your stems are ready. The original WAV was not changed.</p><div className="stem-downloads">{utilityJob.result.files.map((file: any) => <button key={file.name} onClick={() => void downloadUrl(file.url).then((url) => { const link = document.createElement("a"); link.href = url; link.download = file.name; link.click(); })}>Download {file.name}</button>)}</div><div className="modal-actions"><button className="primary" onClick={() => setStemTarget(null)}>Done</button></div></> : <>
          <p className="modal-note">Demucs runs locally on your GPU. Music 3 generation waits while separation is running so the two models do not fight over VRAM.</p>
          <div className="stem-choices"><button className={stemMode === "2" ? "active" : ""} onClick={() => setStemMode("2")}><strong>2 stems</strong><span>Vocals + Instrumental</span><b>Recommended</b></button><button className={stemMode === "4" ? "active" : ""} onClick={() => setStemMode("4")}><strong>4 stems</strong><span>Vocals, Drums, Bass + Other</span><b>Full mix control</b></button></div>
          {utilityJob?.kind === "stems" && ["queued", "running"].includes(utilityJob.status) ? <div className="job-banner"><strong>{utilityJob.phase}</strong><div className="progress"><i style={{ width: `${Math.round(utilityJob.progress * 100)}%` }} /></div><div className="modal-actions"><button className="danger" onClick={() => void cancelJob(utilityJob.id)}>Cancel extraction</button></div></div> : <div className="modal-actions"><button onClick={() => setStemTarget(null)}>Cancel</button><button className="primary" disabled={libraryBusy} onClick={() => void startStems()}>{libraryBusy ? "Starting…" : "Extract stems"}</button></div>}
        </>}
      </section>
    </div>}
  </div>;
}
