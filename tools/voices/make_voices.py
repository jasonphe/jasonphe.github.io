"""Makes the toddler games' voice clips with Kokoro, a free text-to-speech model
that runs locally. The clips are committed, so the games stay plain static pages.

One-time setup (from the repo root):
    python -m venv tools/voices/.venv
    tools/voices/.venv/Scripts/python -m pip install kokoro-onnx soundfile lameenc
    # then put these two files in tools/voices/.models/:
    # https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
    # https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

Usage:
    tools/voices/.venv/Scripts/python tools/voices/make_voices.py           # make missing clips
    ... make_voices.py --force                                              # remake every generated clip
    ... make_voices.py --game ChooChoo --voice af_bella --speed 0.9         # one game, another voice
    ... make_voices.py --samples                                            # compare voices in tools/voices/samples/

Recordings (.m4a) are never touched, and a name that has a recording is never generated.
"""

import argparse
import json
import re
from pathlib import Path

import lameenc
import numpy as np
from kokoro_onnx import Kokoro

from lines import BY_NAME, BY_TEXT

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
MODELS = HERE / ".models"
# Where each name-based game looks for recordings, in its own lookup order
RECORDING_DIRS = {"PeekabooBarn": ["PeekabooBarn", "TapZoo"]}
# Words Kokoro says wrong, as (what it says, what it should say) in its phonemes.
# To see a word's phonemes: tts.tokenizer.phonemize("woof", "en-us")
PHONEME_FIXES = [
    ("wˈuːf", "wˈʊf"),  # "woof" like "foot", not "woo-f"
]
SAMPLE_VOICES = ["af_heart", "af_bella", "af_nicole", "af_sky", "bf_emma", "am_puck"]


def slug(text):
    # Must match slug() in the games
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def tidy(samples, rate):
    """Trim silence at both ends and even out the loudness, so a tap gets an instant answer."""
    peak = float(np.max(np.abs(samples))) or 1.0
    loud = np.nonzero(np.abs(samples) > peak * 0.03)[0]
    if len(loud):
        start = max(0, loud[0] - int(rate * 0.02))
        end = min(len(samples), loud[-1] + int(rate * 0.08))
        samples = samples[start:end]
    samples = samples * (0.9 / peak)
    fade = min(len(samples) // 4, int(rate * 0.005))
    if fade:
        samples[:fade] *= np.linspace(0, 1, fade)
        samples[-fade:] *= np.linspace(1, 0, fade)
    return samples


def to_mp3(samples, rate):
    enc = lameenc.Encoder()
    enc.set_bit_rate(64)
    enc.set_in_sample_rate(rate)
    enc.set_channels(1)
    enc.set_quality(2)
    pcm = (np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes()
    return enc.encode(pcm) + enc.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--speed", type=float, default=0.9)
    ap.add_argument("--game", help="only this game folder")
    ap.add_argument("--force", action="store_true", help="remake clips that already exist (never recordings)")
    ap.add_argument("--samples", action="store_true", help="say one line in several voices, to pick one")
    args = ap.parse_args()

    tts = Kokoro(str(MODELS / "kokoro-v1.0.onnx"), str(MODELS / "voices-v1.0.bin"))

    def speak(text, voice=args.voice):
        phonemes = tts.tokenizer.phonemize(text, "en-us")
        for wrong, right in PHONEME_FIXES:
            phonemes = phonemes.replace(wrong, right)
        samples, rate = tts.create(phonemes, voice=voice, speed=args.speed, is_phonemes=True)
        return to_mp3(tidy(np.asarray(samples, dtype=np.float32), rate), rate)

    if args.samples:
        out = HERE / "samples"
        out.mkdir(exist_ok=True)
        for v in SAMPLE_VOICES:
            (out / f"{v}.mp3").write_bytes(speak("Hi! I'm a hungry monster! The cow says moo! Yummy banana!", v))
            print("sample", v)
        return

    made = skipped = 0
    for game, lines in BY_TEXT.items():
        if args.game and game != args.game:
            continue
        vdir = ROOT / game / "voice"
        vdir.mkdir(exist_ok=True)
        slugs = sorted({slug(t) for t in lines})
        for text in lines:
            path = vdir / f"{slug(text)}.mp3"
            if path.exists() and not args.force:
                skipped += 1
                continue
            path.write_bytes(speak(text))
            made += 1
            print(f"{game}: {text}")
        # Every clip in these folders is generated, so drop ones no longer used
        for old in vdir.glob("*.mp3"):
            if old.stem not in slugs:
                old.unlink()
                print(f"{game}: removed unused {old.name}")
        (vdir / "lines.json").write_text(json.dumps(slugs, indent=0) + "\n")

    for game, names in BY_NAME.items():
        if args.game and game != args.game:
            continue
        dirs = [ROOT / d / "voice" for d in RECORDING_DIRS.get(game, [game])]
        vdir = dirs[0]
        vdir.mkdir(exist_ok=True)
        for name, text in names.items():
            if any((d / f"{name}.m4a").exists() for d in dirs):
                continue  # a real recording wins
            path = vdir / f"{name}.mp3"
            if path.exists() and not args.force:
                skipped += 1
                continue
            path.write_bytes(speak(text))
            made += 1
            print(f"{game}: {name} = {text}")

    print(f"made {made}, kept {skipped} existing")


if __name__ == "__main__":
    main()
