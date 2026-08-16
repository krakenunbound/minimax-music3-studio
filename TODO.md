# MiniMax Music 3 Studio — Roadmap

This file tracks planned product work. Confirmed defects and completed repairs remain in `bugslist.md`.

## 1. AI song and prompt assistant

Add an optional AI assistant for turning a plain-language idea into a complete Music 3 request:

- Support a Gemini Flash-class model through a provider adapter, so the exact model can be changed without rewriting the application.
- Keep the API key out of source code, logs, exported projects, and Git. Store it in the operating-system credential store or a local ignored settings file.
- Give the assistant a versioned, human-readable Music 3 authoring guide that explains the required caption structure, supported lyric section tags, vocal assignment strategy, exclusions, duration behavior, and common failure modes.
- Let the user choose among: improve the music description, write lyrics, restructure pasted lyrics, create a complete song, or suggest several distinct directions.
- Always show the proposed description and lyrics before generation. The AI must never silently overwrite the user's text.
- Preserve both the original request and rewritten result in the song's generation history.
- Allow the AI provider to be disabled completely; local music generation must continue to work without internet access.

## 2. Secure LAN browser access

Let the 3090 computer act as the Music 3 host while other computers, tablets, or phones on the local network use the full Studio interface.

- Add an explicit **Enable network access** setting. The default remains local-only.
- Bind the web service to the selected LAN interface and display the usable address, port, and a scannable QR code.
- Require a generated access password or token. Do not expose an unauthenticated generation server to the network.
- Serve the same Create, Library, Effects, job progress, playback, and Studio pages through a normal browser.
- Keep model execution, library files, exports, and queues on the 3090 host.
- Support multiple clients without starting duplicate model workers or losing active jobs when a browser closes.
- Add clear Windows Firewall setup guidance and an option to revoke all remembered clients.
- Prevent arbitrary filesystem access: remote clients may access only app-managed songs, effects, projects, and approved uploads.

## 3. Clear song form

Add a visible **Clear fields** action to the Create page.

- Clear title, artist, album, genre, music description, lyrics, translation, exclusions, seed, and transient helper state.
- Restore intentional defaults such as Auto duration and safe generation settings.
- Ask for confirmation only when the form contains meaningful unsaved work.
- Do not delete saved songs, templates, playlists, workspaces, or Studio projects.
- Offer **Clear lyrics** and **Clear description** beside the corresponding fields for faster paste-and-replace workflows.

## 4. Automatic title generation

When Song title is empty or still contains the untouched default:

- Ask the configured AI assistant for a short title based on the lyrics and music description.
- Prefer a memorable phrase or central image from the song rather than a generic genre label.
- Generate the title before the job enters the queue so cards, folders, metadata, artwork prompts, and downloads all use the same name.
- When no AI provider is configured, use a deterministic local fallback derived from meaningful lyric or description phrases.
- Never replace a title the user entered deliberately.

## 5. Generation lineage and A/B listening

Add a visual version tree for every song idea so experimentation is safe and understandable.

- **Reuse as new song** creates a child version linked to its source instead of an unrelated duplicate.
- Record exactly what changed: prompt, lyrics, seed, duration mode, creative latitude, direction strength, and other generation settings.
- Compare two versions side by side with synchronized playback and instant A/B switching at the same timestamp.
- Mark a preferred version and optionally archive rejected experiments without deleting them.
- Let the user restore any earlier version's complete generation recipe with one click.
- Show which cover art, stems, Studio project, exports, and lyric timing belong to each version.

This turns the app into a local song-development workspace rather than a folder of disconnected generations, and makes AI-assisted rewrites from item 1 easy to judge without losing the original.

## 6. Reusable prompt-based voice profiles

Add reusable named vocal recipes without filling the visible Music Description field with technical text.

- Store a friendly private name, gender/role, register, timbre, delivery, accent or dialect guidance, vibrato, dynamics, harmony behavior, and restrained vocal effects.
- Let the user assign separate **Female**, **Male**, **Backing**, and optional additional singer profiles while keeping Vocal gender set to **Auto**.
- Treat profile names such as “Stevie” or “Chris” as local labels only. Send their expanded descriptive traits to Music 3, not the private label or a claim that the generated singer is a real person.
- Compile selected profiles behind the scenes into a structured `Vocal Details` block such as `Singer A (Female)` and `Singer B (Male)`.
- Add section-aware assignments to the compiled Arrangement when the lyrics contain `[Female]`, `[Male]`, `[Duet]`, call-and-response, or similar performance directions.
- Keep the ordinary Music Description clean and editable. Provide an optional **View compiled prompt** disclosure for troubleshooting and prompt-token visibility.
- Save the selected profile IDs and a snapshot of their text with every song so later edits to a profile do not silently change an older song's recipe.
- Support duplicate, rename, edit, audition notes, archive, import, and export for profiles.
- Clearly label these as **Prompt voices**: they encourage a consistent vocal family but are not guaranteed speaker identities or reference-audio clones.

## Suggested implementation order

1. Clear-field controls and local automatic-title fallback.
2. Generation lineage data model and A/B playback.
3. Prompt-based voice profiles and hidden compiled-caption generation.
4. Secure LAN server mode and persistent job ownership.
5. AI-provider credentials, adapter, and Music 3 authoring guide.
6. AI prompt/lyrics/title workflows layered onto the version tree.
