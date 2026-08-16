from __future__ import annotations

import sys
from pathlib import Path
from unittest import TestCase

PYTHON_ROOT = Path(__file__).resolve().parents[1]
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

import ai_assist
import ai_guides
import ai_vault


class AiGuideTests(TestCase):
    def test_images_are_square(self):
        pack = ai_guides.pack("images")
        self.assertEqual(pack["constraints"]["aspect"], "1:1")
        self.assertIn("1:1", pack["system"])

    def test_video_orientation(self):
        wide = ai_guides.pack("video", orientation="landscape")
        tall = ai_guides.pack("video", orientation="portrait")
        self.assertEqual(wide["constraints"]["aspect"], "16:9")
        self.assertEqual(tall["constraints"]["aspect"], "9:16")
        self.assertIn("16:9", wide["system"])
        self.assertIn("9:16", tall["system"])

    def test_writing_is_music3(self):
        system = ai_guides.writing_system()
        self.assertIn("Global Metadata", system)
        self.assertIn("[Chorus]", system)
        self.assertIn("Do not put [Spoken]", system)

    def test_assist_refuses_when_disabled(self):
        from tempfile import TemporaryDirectory
        from pathlib import Path
        from unittest.mock import patch
        with TemporaryDirectory() as temp, patch.object(ai_vault, "VAULT_PATH", Path(temp) / "api-keys.json"):
            with self.assertRaises(PermissionError):
                ai_assist.prepare("writing")

    def test_parse_json_fenced_block(self):
        parsed = ai_assist._parse_writing('```json\n{"lyrics":"[Verse]\\nHello","title":"Hello"}\n```')
        self.assertEqual("[Verse]\nHello", parsed["lyrics"])
        self.assertEqual("Hello", parsed["title"])

    def test_parse_plain_lyrics_and_reject_brace(self):
        parsed = ai_assist._parse_writing("Title: Event Horizon\n\n[Verse]\nI fall through the dark")
        self.assertEqual("Event Horizon", parsed["title"])
        self.assertIn("[Verse]", parsed["lyrics"])
        self.assertTrue(ai_assist._looks_like_json_junk("{"))
        self.assertFalse(ai_assist._looks_like_json_junk("[Verse]\nhello"))

    def test_split_caption_out_of_lyrics(self):
        raw = "Global Metadata\nBasic Attributes: space rock.\n\nVocal Details\nSinger A.\n\nArrangement\nSparse drums.\n\n[Intro]\n\n[Verse]\nThe stars begin to stretch"
        parsed = ai_assist._parse_writing(raw)
        self.assertIn("[Verse]", parsed["lyrics"])
        self.assertNotIn("Global Metadata", parsed["lyrics"])
        self.assertIn("Global Metadata", parsed["description"])
        self.assertIn("space rock", parsed["description"])

    def test_parse_broken_gemini_json_blob(self):
        raw = (
            '  "title": "Singularity",\n'
            '  "lyrics": "[Intro]\\n\\n[Verse]\\nThe stars begin to stretch and fade\\n'
            'A silent curve that we have made\\n[Chorus]\\nFalling deep into the gravity\\n'
            'Singularity\\nSet me free"\n'
            "}\n}"
        )
        parsed = ai_assist._parse_writing(raw)
        self.assertEqual("Singularity", parsed["title"])
        self.assertIn("[Intro]", parsed["lyrics"])
        self.assertIn("Falling deep into the gravity", parsed["lyrics"])
        self.assertNotIn('"lyrics"', parsed["lyrics"])
        self.assertFalse(ai_assist._looks_like_json_junk(parsed["lyrics"]))
