"""Cloud assist. Every call attaches the job's how-to pack; a key alone is not a prompt."""
from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from typing import Any, Literal

import ai_guides
import ai_vault

log = logging.getLogger("music3.assist")

ENDPOINTS = {
    "gemini": "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    "xai": "https://api.x.ai/v1/chat/completions",
    "groq": "https://api.groq.com/openai/v1/chat/completions",
    "openai": "https://api.openai.com/v1/chat/completions",
    "anthropic": "https://api.anthropic.com/v1/messages",
}


def prepare(capability: str, orientation: Literal["landscape", "portrait"] = "landscape") -> dict[str, Any]:
    """Refuse unless Enable is on, then bind the matching instruction pack."""
    access = ai_vault.require_enabled(capability)
    guide = ai_guides.pack(capability, orientation=orientation)
    return {
        "provider": access["provider"],
        "model": access["model"],
        "key": access["key"],
        "system": guide["system"],
        "constraints": guide["constraints"],
        "orientation": guide.get("orientation"),
    }


def write(action: str, *, idea: str = "", random: bool = False, title: str = "", description: str = "", lyrics: str = "", language: str = "en") -> dict[str, str]:
    if action not in {"generate", "optimize", "title"}:
        raise ValueError("Unknown writing action")
    packed = prepare("writing")
    user = _writing_user(action, idea=idea, random=random, title=title, description=description, lyrics=lyrics, language=language)
    raw = _complete(packed["provider"], packed["model"], packed["key"], ai_guides.lyrics_system(), user)
    parsed = _parse_writing(raw)
    out_lyrics = str(parsed.get("lyrics") or "").strip()
    out_title = str(parsed.get("title") or "").strip()
    if action != "title" and _looks_like_json_junk(out_lyrics):
        raise RuntimeError("The writing model returned raw JSON instead of lyrics. Try Generate again.")
    if action != "title" and not out_lyrics:
        raise RuntimeError("The writing model returned empty lyrics")
    if action == "title" and not out_title:
        raise RuntimeError("The writing model returned an empty title")
    return {"lyrics": out_lyrics, "title": out_title, "description": str(parsed.get("description") or "").strip()}


def _writing_user(action: str, **fields: Any) -> str:
    language = fields.get("language") or "en"
    title = str(fields.get("title") or "").strip()
    description = str(fields.get("description") or "").strip()
    lyrics = str(fields.get("lyrics") or "").strip()
    idea = str(fields.get("idea") or "").strip()
    if action == "optimize":
        task = "Rewrite and structure the current lyrics for MiniMax Music 3. Keep the meaning. Fix official section tags. Tighten repeats. Do not paste the same verses back."
    elif action == "title":
        task = "Propose one short song title from the lyrics and description. Do not copy a chorus line, first verse, or a generic genre label. Return JSON with title only (lyrics may be empty)."
    elif fields.get("random"):
        task = "Write a complete original lyric from the music description and title. Invent a specific story. Do not reuse stock AI-lyric clichés."
    elif idea:
        task = f"Write a complete original lyric from this idea:\n{idea}"
    else:
        task = "Write a complete original lyric from the title and music description."
    return (
        f"{task}\n\n"
        f"Language: {language}\n"
        f"Current title: {title or '(empty)'}\n"
        f"Music description:\n{description or '(none)'}\n\n"
        f"Current lyrics:\n{lyrics or '(empty)'}\n\n"
        "Reply in plain text only. First line may be Title: a short title. "
        "Then ONLY the sung lyric stream, starting with an official section tag such as [Verse]. "
        "Do not write Global Metadata, Vocal Details, Arrangement, production notes, or bullet lists in the lyrics. "
        "Those belong in the Music Description field, not the lyric stream. "
        "Do not wrap the answer in JSON, braces, or markdown fences."
    )


def _complete(provider: str, model: str, key: str, system: str, user: str) -> str:
    if provider == "gemini":
        return _gemini(model, key, system, user)
    if provider == "anthropic":
        return _anthropic(model, key, system, user)
    if provider in {"xai", "groq", "openai"}:
        return _openai_compat(provider, model, key, system, user)
    raise ValueError(f"Writing is not wired for {provider}")


def _gemini(model: str, key: str, system: str, user: str) -> str:
    url = ENDPOINTS["gemini"].format(model=model or "gemini-3.5-flash")
    configs = (
        {"temperature": 0.9, "maxOutputTokens": 8192, "thinkingConfig": {"thinkingLevel": "MINIMAL"}},
        {"temperature": 0.9, "maxOutputTokens": 8192, "thinkingConfig": {"thinkingBudget": 0}},
        {"temperature": 0.9, "maxOutputTokens": 8192},
    )
    last_error: Exception | None = None
    for config in configs:
        payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": config,
        }
        request = urllib.request.Request(
            url, data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-goog-api-key": key},
            method="POST",
        )
        try:
            body = _http(request)
            parts = body["candidates"][0]["content"]["parts"]
            return "".join(str(part.get("text") or "") for part in parts if not part.get("thought"))
        except RuntimeError as error:
            last_error = error
            if "HTTP 400" not in str(error):
                raise
        except (KeyError, IndexError, TypeError) as error:
            raise RuntimeError("Gemini returned an unexpected response") from error
    raise RuntimeError(str(last_error) if last_error else "Gemini request failed")


def _openai_compat(provider: str, model: str, key: str, system: str, user: str) -> str:
    defaults = {"xai": "grok-3", "groq": "llama-3.3-70b-versatile", "openai": "gpt-4.1-mini"}
    payload = {
        "model": model or defaults[provider],
        "temperature": 0.9,
        "max_tokens": 4096,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    request = urllib.request.Request(
        ENDPOINTS[provider], data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
        method="POST",
    )
    body = _http(request)
    try:
        return str(body["choices"][0]["message"]["content"] or "")
    except (KeyError, IndexError, TypeError) as error:
        raise RuntimeError(f"{provider} returned an unexpected response") from error


def _anthropic(model: str, key: str, system: str, user: str) -> str:
    payload = {
        "model": model or "claude-sonnet-4-5",
        "max_tokens": 4000,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    request = urllib.request.Request(
        ENDPOINTS["anthropic"], data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"},
        method="POST",
    )
    body = _http(request)
    try:
        return "".join(str(block.get("text") or "") for block in body.get("content") or [] if block.get("type") == "text")
    except TypeError as error:
        raise RuntimeError("Anthropic returned an unexpected response") from error


def _http(request: urllib.request.Request) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"Writing provider HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach the writing provider ({error.reason})") from error
    try:
        return json.loads(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError("Writing provider did not return JSON") from error


def _looks_like_json_junk(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    if stripped in {"{", "}", "{}", "[", "]"}:
        return True
    if re.match(r'^[{\s]*"(?:title|lyrics)"\s*:', stripped):
        return True
    return stripped.startswith("{") and "[Verse]" not in stripped and "[Chorus]" not in stripped and "[Intro]" not in stripped


def _unescape_json_string(value: str) -> str:
    try:
        return json.loads(f'"{value}"')
    except json.JSONDecodeError:
        return value.replace("\\n", "\n").replace("\\t", "\t").replace('\\"', '"').replace("\\\\", "\\")


def _field(text: str, name: str) -> str:
    quoted = re.search(rf'"{name}"\s*:\s*"((?:\\.|[^"\\])*)"', text, re.S)
    if quoted:
        return _unescape_json_string(quoted.group(1)).strip()
    block = re.search(rf'"{name}"\s*:\s*"""([\s\S]*?)"""', text)
    if block:
        return block.group(1).strip()
    return ""


def _parse_writing(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json|text)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()
    parsed = _parse_json(text)
    lyrics = str(parsed.get("lyrics") or "").strip() or _field(text, "lyrics")
    title = str(parsed.get("title") or "").strip() or _field(text, "title")
    if not lyrics and not title:
        title_match = re.match(r"(?i)^title\s*:\s*(.+)\n+([\s\S]+)$", text)
        if title_match:
            title = title_match.group(1).strip().strip('"')
            lyrics = title_match.group(2).strip()
        else:
            lyrics = text
    description, lyrics = _split_caption_and_lyrics(lyrics)
    return {"lyrics": lyrics, "title": title, "description": description}


SECTION_LINE = re.compile(
    r"(?im)^\s*\[(?:Intro|Verse|Pre-Chorus|Chorus|Post-Chorus|Bridge|Instrumental|Solo|Outro)\]\s*$"
)


def _split_caption_and_lyrics(text: str) -> tuple[str, str]:
    body = (text or "").strip()
    if not body:
        return "", ""
    match = SECTION_LINE.search(body)
    if not match:
        if re.search(r"(?im)^(?:#{1,6}\s*)?Global Metadata\b", body):
            return body, ""
        return "", body
    before = body[: match.start()].strip()
    after = body[match.start():].strip()
    if re.search(r"(?im)Global Metadata|Vocal Details|^Arrangement\b", before):
        return before, after
    return "", body


def _parse_json(raw: str) -> dict[str, Any]:
    text = raw.strip().lstrip("\ufeff")
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        text = text.strip()
    candidates = [text]
    if not text.startswith("{"):
        candidates.append("{" + text)
    for candidate in list(candidates):
        trimmed = candidate.rstrip()
        while trimmed.endswith("}") and trimmed.count("}") > trimmed.count("{"):
            extra = trimmed[:-1].rstrip()
            candidates.append(extra)
            trimmed = extra
        if not trimmed.endswith("}"):
            candidates.append(trimmed + "}")
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            continue
    match = re.search(r"\{.*\}", text, re.S)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
    lyrics, title = _field(text, "lyrics"), _field(text, "title")
    if lyrics or title:
        return {"lyrics": lyrics, "title": title}
    return {}
