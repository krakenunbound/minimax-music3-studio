# Native multitrack Studio

MiniMax Music 3 Studio now ships one integrated editor: the native, stem-aware multitrack Studio. The former AudioMass browser bundle and `/editor` route were removed on 2026-08-13 because they duplicated a weaker, disconnected workflow.

## Current workflow

- Open **Studio** from a song's `…` menu or from its expanded Stems branch.
- Songs with Demucs stems open synchronized Bass, Drums, Other, and Vocals lanes beside the preserved original mix.
- Songs without stems can begin local four-stem extraction from inside Studio.
- Import as many local WAV, MP3, FLAC, M4A, AAC, or OGG tracks as the machine can reasonably mix.
- Drag reusable Effects-library sounds onto the timeline. A 5-second clip stays 5 seconds.
- After **Add to Studio** on the Effects page, **Open Studio** jumps straight to that song.
- Move imported tracks along the timeline, adjust lane volume, mute or solo them, and remove the project copy without touching the source file.
- Work on a 10-minute timeline canvas. Zoom with the slider or Ctrl/Cmd + wheel. Exports still stop at the last audible clip.
- Use **Move** (V) to slide clips, **Razor** (C) to cut, and **Range** (R) to select time for effects.
- **Insert space** splits at the playhead and pushes later audio to the right so a countdown or spoken line can sit in front of the song.
- Drag the yellow clip handles to create cosine fade-ins and fade-outs.
- **All lanes** slides every clip together, including the Original mix reference.
- Transport jumps to song start, clip/range start, clip/range end, or song end.
- Drag the yellow gain line on a clip to raise or lower level. **L/R split** shows separate left and right waves with independent channel lines.
- Drag a time range across the timeline, then target **This lane** or **All lanes**.
- Apply range mute (opens a gap), quieter/louder gain, echo, reverb, automatic leveling, normalization, clarity EQ, or compression.
- Add non-destructive trim, fade-in, fade-out, and loop regions.
- Preview effect regions during playback and save the complete session into the song metadata.
- Export a custom WAV mix, a selected range, an instrumental, or an acapella into the song's local `mixes` folder.

## Design rules

- The original generated WAV is never overwritten.
- The original-mix lane is a reference and is never doubled into stem bounces.
- All editing stays inside the MiniMax application; no browser popup or external service is required.
- Stem extraction, imported audio, edits, and rendered mixes remain local to the song library.
- The interface follows the app's deep-sea purple styling instead of embedding unrelated third-party chrome.

## Useful future additions

- Lyric-derived verse, chorus, bridge, and outro markers on the Studio ruler.
- Detailed automation curves beyond clip fade handles.
- Per-lane effect ordering, bypass, and wet/dry controls.
- Mix buses, master metering, limiter controls, and reusable effect presets.
- Section replacement or regeneration when Music 3 exposes a reliable local continuation/editing path.
