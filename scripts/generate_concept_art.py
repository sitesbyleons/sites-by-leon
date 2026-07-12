"""Create original abstract photography-site concept artwork.

The images intentionally avoid real people and brands. They act as atmospheric
editorial art inside the portfolio browser compositions, not as client work.
"""

from __future__ import annotations

from pathlib import Path
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter


WIDTH = 1600
HEIGHT = 1050
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "images" / "concepts"


def gradient(top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    strip = Image.new("RGB", (1, HEIGHT))
    pixels = strip.load()
    for y in range(HEIGHT):
        mix = y / (HEIGHT - 1)
        pixels[0, y] = tuple(round(a + (b - a) * mix) for a, b in zip(top, bottom))
    return strip.resize((WIDTH, HEIGHT))


def grain(image: Image.Image, amount: float = 0.08, seed: int = 1) -> Image.Image:
    random.seed(seed)
    noise = Image.effect_noise((WIDTH, HEIGHT), 22).convert("L")
    neutral = Image.new("RGB", image.size, "#777777")
    textured = Image.merge("RGB", (noise, noise, noise))
    textured = ImageChops.soft_light(neutral, textured)
    return Image.blend(image, textured, amount)


def vow_and_light() -> Image.Image:
    base = gradient((18, 14, 13), (44, 34, 28)).convert("RGBA")
    glow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse((420, -260, 1640, 960), fill=(243, 225, 188, 92))
    draw.polygon([(800, -50), (1600, 0), (1030, 1050), (330, 1050)], fill=(255, 238, 202, 42))
    glow = glow.filter(ImageFilter.GaussianBlur(85))
    base = Image.alpha_composite(base, glow)

    shapes = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shapes)
    draw.rounded_rectangle((120, 110, 740, 940), radius=305, outline=(231, 216, 187, 190), width=6)
    draw.rounded_rectangle((220, 210, 640, 940), radius=210, outline=(231, 216, 187, 80), width=2)
    draw.ellipse((920, 285, 1310, 675), outline=(245, 231, 205, 145), width=4)
    draw.ellipse((995, 360, 1235, 600), outline=(245, 231, 205, 70), width=2)
    draw.rectangle((0, 870, WIDTH, HEIGHT), fill=(8, 8, 9, 78))
    base = Image.alpha_composite(base, shapes)
    return grain(base.convert("RGB"), 0.09, 11)


def northline_portraits() -> Image.Image:
    base = gradient((4, 6, 12), (12, 15, 24)).convert("RGBA")
    lights = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(lights)
    draw.ellipse((130, -240, 1120, 750), fill=(42, 91, 255, 150))
    draw.ellipse((740, 160, 1740, 1160), fill=(96, 55, 255, 88))
    lights = lights.filter(ImageFilter.GaussianBlur(120))
    base = Image.alpha_composite(base, lights)

    shapes = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shapes)
    draw.ellipse((535, 165, 1065, 695), fill=(5, 7, 12, 230))
    draw.rounded_rectangle((430, 610, 1170, 1210), radius=360, fill=(5, 7, 12, 238))
    draw.line((130, 120, 1470, 920), fill=(231, 236, 255, 120), width=3)
    draw.line((340, 0, 1420, 1050), fill=(76, 125, 255, 150), width=2)
    for x in (120, 210, 1390, 1480):
        draw.rectangle((x, 120, x + 2, 930), fill=(225, 232, 255, 42))
    base = Image.alpha_composite(base, shapes)
    return grain(base.convert("RGB"), 0.1, 29)


def fieldwork_commercial() -> Image.Image:
    base = gradient((203, 204, 201), (126, 130, 137)).convert("RGBA")
    draw = ImageDraw.Draw(base)
    for x in range(0, WIDTH, 100):
        draw.line((x, 0, x, HEIGHT), fill=(22, 24, 29, 28), width=1)
    for y in range(0, HEIGHT, 100):
        draw.line((0, y, WIDTH, y), fill=(22, 24, 29, 28), width=1)

    draw.rounded_rectangle((135, 120, 660, 905), radius=8, fill=(238, 236, 226, 240))
    draw.rectangle((250, 245, 545, 780), fill=(18, 20, 25, 255))
    draw.rounded_rectangle((810, 130, 1435, 540), radius=22, fill=(13, 16, 21, 236))
    draw.ellipse((965, 205, 1280, 520), fill=(76, 125, 255, 225))
    draw.rounded_rectangle((790, 650, 1350, 940), radius=18, fill=(231, 228, 218, 230))
    draw.polygon([(920, 695), (1230, 695), (1130, 890), (850, 860)], fill=(50, 54, 62, 245))
    draw.line((95, 970, 1500, 90), fill=(250, 248, 241, 110), width=4)
    return grain(base.convert("RGB"), 0.07, 47)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    images = {
        "vow-and-light.webp": vow_and_light(),
        "northline-portraits.webp": northline_portraits(),
        "fieldwork-commercial.webp": fieldwork_commercial(),
    }
    for filename, image in images.items():
        image.save(OUTPUT / filename, "WEBP", quality=82, method=6, exif=b"")
        size_kb = (OUTPUT / filename).stat().st_size / 1024
        if size_kb >= 350:
            raise RuntimeError(f"{filename} is {size_kb:.1f} KB; expected under 350 KB")
        print(f"{filename}: {image.width}x{image.height}, {size_kb:.1f} KB")


if __name__ == "__main__":
    main()
