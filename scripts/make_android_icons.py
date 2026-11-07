"""Write the Android launcher icons from the same drawing as the web icon (scripts/make_icons.py).
uv run python scripts/make_android_icons.py
"""

from pathlib import Path

from make_icons import draw

RES = Path(__file__).resolve().parents[1] / "app/android/app/src/main/res"
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

for dens, px in SIZES.items():
    d = RES / f"mipmap-{dens}"
    d.mkdir(parents=True, exist_ok=True)
    draw(px, 0.95).save(d / "ic_launcher.png")
    draw(px, 0.95).save(d / "ic_launcher_round.png")
    # adaptive icons crop to the middle 72 of 108, so the drawing sits in the safe zone
    draw(FOREGROUND[dens], 0.62).save(d / "ic_launcher_foreground.png")
bg = RES / "values/ic_launcher_background.xml"
bg.write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1B2A4A</color>\n</resources>\n'
)
print("wrote launcher icons for", ", ".join(SIZES))
