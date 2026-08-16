"""How-to packs sent with every cloud job. A key is not enough — the model is told the job."""
from __future__ import annotations

from typing import Any, Literal

GUIDE_VERSION = 1

LYRIC_SECTION_TAGS = (
    "[Intro]", "[Verse]", "[Pre-Chorus]", "[Chorus]", "[Post-Chorus]",
    "[Bridge]", "[Instrumental]", "[Solo]", "[Outro]",
)
PERFORMANCE_TAGS = (
    "Spoken", "Spoken Countdown", "Whispered", "Chanted", "Rapped", "Call and Response",
)

WRITING_RULES = [
    "Write for MiniMax Music 3, not Suno or a generic chatbot song.",
    "Music Description must use the three headings Global Metadata, Vocal Details, and Arrangement.",
    "Under Global Metadata include Basic Attributes, Global Emotional Progression, Application Scenarios & Imagery, and Sonics & Production Profile.",
    "Name singers as Singer A / Singer B with gender and timbre. Do not claim they are a real person.",
    "Lyrics may only use official section tags: [Intro] [Verse] [Pre-Chorus] [Chorus] [Post-Chorus] [Bridge] [Instrumental] [Solo] [Outro].",
    "Do not put [Spoken], [Whispered], [Chanted], [Rapped], or similar performance tags in the lyric stream. Those belong in Vocal Details.",
    "Keep the combined description + lyrics inside a 5,000-token Music 3 budget. Prefer one finished caption, not a second parallel prompt.",
    "Titles must be short and memorable. Never copy a chorus line, first verse, or a generic genre label.",
    "Never silently replace user text. Return a proposal the app can preview.",
    "Do not invent a different song duration, seed, or a cloud music model. Music 3 stays local.",
]

IMAGE_RULES = [
    "Output a 1:1 square image only. Never 16:9, 9:16, or any other ratio.",
    "This is an album thumbnail / cover, not a poster or landscape still.",
    "No text, lettering, logos, watermarks, or typography on the image.",
    "Literal visual storytelling from the song title, description imagery, and lyric images — not a generic vinyl-on-a-table cliché unless asked.",
]

VIDEO_RULES = [
    "Landscape (horizontal) is exactly 16:9.",
    "Portrait (vertical) is exactly 9:16.",
    "Never output 1:1, 4:3, or a free-form ratio.",
    "Keep titles, lyrics, and cover art readable in the chosen frame. Do not letterbox a square cover into the video as the whole picture.",
    "This is a companion video for an already-generated local song, not a new piece of music.",
]


def lyrics_system() -> str:
    tags = " ".join(LYRIC_SECTION_TAGS)
    return (
        "You write MiniMax Music 3 lyrics only.\n"
        "Output shape:\n"
        "- Optional first line: Title: short original title\n"
        f"- Then only these section tags and the words to sing: {tags}\n"
        "Forbidden in the output:\n"
        "- JSON, braces, markdown fences, or key/value dumps\n"
        "- The headings Global Metadata, Vocal Details, or Arrangement\n"
        "- BPM, mix notes, guitar/drum production, singer-range essays\n"
        "- Performance tags such as [Spoken] or [Whispered]\n"
        "If you are given a music description, obey it silently. Do not reprint it."
    )


def writing_system() -> str:
    tags = " ".join(LYRIC_SECTION_TAGS)
    return (
        "You are the MiniMax Music 3 writing assistant inside a local studio app.\n"
        "The user already has a local Music 3 engine. You only draft text they can apply.\n\n"
        + "\n".join(f"- {rule}" for rule in WRITING_RULES)
        + f"\n\nOfficial lyric section tags only: {tags}."
    )


def image_system() -> str:
    return (
        "You generate a square album cover for MiniMax Music 3 Studio.\n"
        "Hard constraint: aspect ratio 1:1. Size preference 1024×1024 (or 512×512 if that is the model maximum).\n\n"
        + "\n".join(f"- {rule}" for rule in IMAGE_RULES)
    )


def video_system(orientation: Literal["landscape", "portrait"] = "landscape") -> str:
    if orientation == "portrait":
        aspect, size, label = "9:16", "720×1280 or 1080×1920", "vertical / portrait"
    else:
        aspect, size, label = "16:9", "1280×720 or 1920×1080", "horizontal / landscape"
    return (
        "You generate a companion music video for a song that already exists locally.\n"
        f"Hard constraint: {label} only. Aspect ratio {aspect}. Preferred size {size}.\n\n"
        + "\n".join(f"- {rule}" for rule in VIDEO_RULES)
    )


def catalog() -> dict[str, Any]:
    return {
        "version": GUIDE_VERSION,
        "writing": {
            "summary": "Lyrics and style follow MiniMax Music 3 caption + tag rules.",
            "rules": WRITING_RULES,
            "lyric_tags": list(LYRIC_SECTION_TAGS),
            "constraints": {"kind": "text", "engine": "minimax-music-3"},
        },
        "images": {
            "summary": "Thumbnails and covers are 1:1 square. No text on the image.",
            "rules": IMAGE_RULES,
            "constraints": {"kind": "image", "aspect": "1:1", "prefer_px": [1024, 1024]},
        },
        "video": {
            "summary": "Horizontal 16:9 or vertical 9:16. Never square.",
            "rules": VIDEO_RULES,
            "constraints": {
                "kind": "video",
                "landscape": {"aspect": "16:9", "prefer_px": [1280, 720]},
                "portrait": {"aspect": "9:16", "prefer_px": [720, 1280]},
            },
        },
    }


def pack(capability: str, orientation: Literal["landscape", "portrait"] = "landscape") -> dict[str, Any]:
    if capability == "writing":
        return {"capability": "writing", "system": writing_system(), "constraints": catalog()["writing"]["constraints"]}
    if capability == "images":
        return {"capability": "images", "system": image_system(), "constraints": catalog()["images"]["constraints"]}
    if capability == "video":
        constraints = catalog()["video"]["constraints"][orientation]
        return {"capability": "video", "system": video_system(orientation), "constraints": constraints, "orientation": orientation}
    raise ValueError(f"Unknown capability {capability}")
