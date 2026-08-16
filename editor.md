# Native multitrack Studio

MiniMax Music 3 Studio now ships one integrated editor: the native, stem-aware multitrack Studio. The former AudioMass browser bundle and `/editor` route were removed on 2026-08-13 because they duplicated a weaker, disconnected workflow.

## Current workflow

- Open **Studio** from a song's `…` menu or from its expanded Stems branch.
- Songs with Demucs stems open synchronized Bass, Drums, Other, and Vocals lanes beside the preserved original mix.
- Songs without stems can begin local four-stem extraction from inside Studio.
- Import as many local WAV, MP3, FLAC, M4A, AAC, or OGG tracks as the machine can reasonably mix.
- Move imported tracks along the timeline, adjust lane volume, mute or solo them, and remove the project copy without touching the source file.
- Drag a time range across the timeline, then target **This lane** or **All lanes**.
- Apply range mute, quieter/louder gain, echo, reverb, automatic leveling, normalization, clarity EQ, or compression.
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

- Direct drag handles for imported clips in addition to the precise start control.
- Lyric-derived verse, chorus, bridge, and outro markers on the Studio ruler.
- Detailed automation curves and draggable fades.
- Per-lane effect ordering, bypass, and wet/dry controls.
- Mix buses, master metering, limiter controls, and reusable effect presets.
- Section replacement or regeneration when Music 3 exposes a reliable local continuation/editing path.
