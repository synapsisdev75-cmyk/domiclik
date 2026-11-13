"""Generate DomiClick favicons, Android launcher icons and splash from the new mark."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(
    r"C:\Users\empre\.cursor\projects\c-Users-empre-Desktop-domiclik-main\assets"
    r"\DomiClick_Redondo_PNG_-af1377c7-e8b1-4d56-9472-8773adae772d.png"
)
WHITE = (255, 255, 255, 255)
DARK = (5, 8, 15, 255)
RES = ROOT / "client-web" / "android" / "app" / "src" / "main" / "res"


def load_mark() -> Image.Image:
    img = Image.open(SRC).convert("RGBA")
    # Flatten JPEG white to true white so edges stay clean when scaled.
    bg = Image.new("RGBA", img.size, WHITE)
    bg.alpha_composite(img)
    return bg


def contain(img: Image.Image, size: int, pad: float, bg: tuple[int, int, int, int]) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    inner = max(1, int(size * (1 - pad * 2)))
    fitted = img.copy()
    fitted.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas


def circle_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    return mask


def save_png(img: Image.Image, path: Path, rgb: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    out = img.convert("RGB") if rgb else img
    out.save(path, "PNG", optimize=True)


def splash(mark: Image.Image, w: int, h: int) -> Image.Image:
    canvas = Image.new("RGBA", (w, h), DARK)
    side = int(min(w, h) * 0.52)
    logo = contain(mark, side, 0.04, WHITE)
    # Round the logo plate so it sits cleanly on the dark splash.
    rounded = Image.new("RGBA", logo.size, (0, 0, 0, 0))
    rounded.paste(logo, (0, 0))
    mask = circle_mask(side)
    rounded.putalpha(mask)
    canvas.paste(rounded, ((w - side) // 2, (h - side) // 2), rounded)
    return canvas


def main() -> None:
    mark = load_mark()

    master = contain(mark, 1024, 0.04, WHITE)
    save_png(master, ROOT / "public" / "brand" / "logo-domiclick.png")
    save_png(master, ROOT / "client-web" / "public" / "brand" / "logo-domiclick.png")
    # Landing header / BrandLogo variants (overwrite legacy files)
    header = contain(mark, 512, 0.06, WHITE)
    mark256 = contain(mark, 256, 0.06, WHITE)
    save_png(header, ROOT / "client-web" / "public" / "brand" / "logo-optimized-transparent.png")
    save_png(header, ROOT / "client-web" / "public" / "brand" / "logo-header.png")
    save_png(mark256, ROOT / "client-web" / "public" / "brand" / "logo-mark.png")
    save_png(mark256, ROOT / "public" / "brand" / "logo-mark.png")
    save_png(mark256, ROOT / "public" / "brand" / "logo-domiclick.png")

    fav64 = contain(mark, 64, 0.04, WHITE)
    fav192 = contain(mark, 192, 0.04, WHITE)
    fav512 = contain(mark, 512, 0.04, WHITE)
    apple = contain(mark, 180, 0.04, WHITE)

    save_png(fav64, ROOT / "public" / "brand" / "favicon.png")
    save_png(fav64, ROOT / "public" / "brand" / "ops-favicon.png")
    save_png(fav64, ROOT / "client-web" / "public" / "brand" / "favicon.png")
    save_png(fav192, ROOT / "public" / "brand" / "ops-logo-192.png")
    save_png(fav192, ROOT / "client-web" / "public" / "brand" / "logo-192.png")
    save_png(apple, ROOT / "client-web" / "public" / "brand" / "apple-touch-icon.png")
    save_png(fav512, ROOT / "client-web" / "public" / "brand" / "logo-512.png")
    save_png(fav512, ROOT / "client-web" / "play-store-assets" / "icon-512.png")

    ico_sizes = [16, 32, 48]
    ico_images = [contain(mark, s, 0.04, WHITE).convert("RGBA") for s in ico_sizes]
    ico_images[0].save(
        ROOT / "client-web" / "public" / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_images[1:],
    )
    ico_images[0].save(
        ROOT / "public" / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_images[1:],
    )

    launchers = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }
    foregrounds = {
        "mdpi": 108,
        "hdpi": 162,
        "xhdpi": 216,
        "xxhdpi": 324,
        "xxxhdpi": 432,
    }
    for density, size in launchers.items():
        icon = contain(mark, size, 0.08, WHITE)
        folder = RES / f"mipmap-{density}"
        save_png(icon, folder / "ic_launcher.png")
        round_icon = icon.copy()
        round_icon.putalpha(circle_mask(size))
        save_png(round_icon, folder / "ic_launcher_round.png")
        fg = contain(mark, foregrounds[density], 0.18, WHITE)
        save_png(fg, folder / "ic_launcher_foreground.png")

    splashes = {
        "drawable/splash.png": (480, 480),
        "drawable-land-mdpi/splash.png": (480, 320),
        "drawable-land-hdpi/splash.png": (800, 480),
        "drawable-land-xhdpi/splash.png": (1280, 720),
        "drawable-land-xxhdpi/splash.png": (1600, 960),
        "drawable-land-xxxhdpi/splash.png": (1920, 1280),
        "drawable-port-mdpi/splash.png": (320, 480),
        "drawable-port-hdpi/splash.png": (480, 800),
        "drawable-port-xhdpi/splash.png": (720, 1280),
        "drawable-port-xxhdpi/splash.png": (960, 1600),
        "drawable-port-xxxhdpi/splash.png": (1280, 1920),
    }
    for rel, (w, h) in splashes.items():
        rgb = rel != "drawable/splash.png"
        save_png(splash(mark, w, h), RES / rel, rgb=rgb)

    print("icons generated")


if __name__ == "__main__":
    main()
