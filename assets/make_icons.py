"""Generate app / tray icons for WorkPlan."""
from PIL import Image, ImageDraw
import os

OUT = os.path.dirname(os.path.abspath(__file__))
BG = (22, 22, 26, 255)
ACCENT = (255, 107, 61, 255)
DARK = (20, 16, 14, 255)
RED = (255, 77, 79, 255)


def rounded(size, radius, color):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=color)
    return img


def check(draw, cx, cy, s, color, width):
    pts = [(cx - s * 0.42, cy + s * 0.02), (cx - s * 0.08, cy + s * 0.34), (cx + s * 0.46, cy - s * 0.38)]
    draw.line(pts, fill=color, width=width, joint="curve")
    # round caps
    r = width / 2 - 0.5
    for x, y in (pts[0], pts[-1]):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)


# ---- app icon 256 ----
S = 256
icon = rounded(S, 56, BG)
d = ImageDraw.Draw(icon)
d.ellipse([S * 0.16, S * 0.16, S * 0.84, S * 0.84], fill=ACCENT)
check(d, S / 2, S / 2, S * 0.62, BG, 22)
icon.save(os.path.join(OUT, "icon.png"))

icon.save(
    os.path.join(OUT, "icon.ico"),
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)


def tray(alert=False):
    s = 64
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    dd = ImageDraw.Draw(img)
    pad = 4 if alert else 2
    r = (s - pad * 2) / 2
    cx = cy = s / 2 - (2 if alert else 0)
    dd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT)
    check(dd, cx, cy, r * 1.15, DARK, 7)
    if alert:
        dd.ellipse([s - 24, 2, s - 2, 24], fill=RED, outline=(14, 14, 16, 255), width=2)
    return img


tray(False).save(os.path.join(OUT, "tray.png"))
tray(True).save(os.path.join(OUT, "tray-alert.png"))
tray(False).save(os.path.join(OUT, "tray.ico"), sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (48, 48), (64, 64)])
tray(True).save(os.path.join(OUT, "tray-alert.ico"), sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (48, 48), (64, 64)])
print("icons written:", sorted(f for f in os.listdir(OUT) if f.endswith((".png", ".ico"))))
