"""
Нарезка листа фигур на двенадцать файлов с прозрачным фоном.

Запускается руками и в сборку не входит: нужен Pillow и numpy, которых в
зависимостях проекта нет. Лежит здесь, чтобы фигуры можно было перерезать —
например, если хозяин пришлёт новый лист.

    python3 src/games/turbochess/scripts/cut-pieces.py

Лист нарисован на ровном почти чёрном фоне, а у каждой фигуры — сплошной
чёрный контур, темнее фона. Поэтому порог по яркости здесь не годится: он
съел бы тёмные фигуры вместе с фоном. Фон заливается от края листа с узким
допуском и упирается в контур; всё, до чего заливка не дошла, — рисунок.

Под фигурами подписи, над рядами заголовки «Светлые» и «Тёмные», и заголовок
заходит в колонку пешки. Поэтому фигура берётся не рамкой, а одной связной
областью от зерна в теле фишки: подпись и заголовок с ней не соприкасаются.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter
import numpy as np

SRC = Path(__file__).with_name("pieces-sheet.png")
DEST = Path(__file__).parents[4] / "public/games/turbochess/pieces"
# Порядок колонок на листе.
KINDS = ["p", "n", "b", "r", "q", "k"]
# Полосы рядов по вертикали — вместе с заголовком, но без подписей.
BANDS = {"w": (54, 405), "b": (505, 840)}
# Фон листа и допуск: фон держится в 10–14, контур фигур — 0–6.
BACKGROUND = (12, 12, 12)
TOLERANCE = 4
SIZE = 256
PAD = 5


def foreground(sheet: Image.Image) -> np.ndarray:
    """Всё, до чего не дошла заливка фона от угла листа."""
    rgb = np.asarray(sheet).astype(np.int16)
    near = np.abs(rgb - np.array(BACKGROUND)).max(axis=2) <= TOLERANCE
    # Копия обязательна: картинка поверх массива numpy только для чтения, и
    # заливка по ней молча не делает ничего.
    marks = Image.fromarray(np.where(near, 255, 0).astype(np.uint8)).copy()
    ImageDraw.floodfill(marks, (0, 0), 128)
    return np.asarray(marks) != 128


def columns(mask: np.ndarray, min_width: int = 20) -> list[tuple[int, int]]:
    """Колонки фигур: непрерывные полосы, где есть рисунок."""
    filled = mask.sum(axis=0) > 0
    found, start = [], None

    for x, on in enumerate(filled):
        if on and start is None:
            start = x
        elif not on and start is not None:
            if x - start >= min_width:
                found.append((start, x))
            start = None
    if start is not None:
        found.append((start, len(filled)))

    return found


def extract() -> dict[str, Image.Image]:
    sheet = Image.open(SRC).convert("RGB")
    drawing = foreground(sheet)
    plane = Image.fromarray(np.where(drawing, 255, 0).astype(np.uint8))
    pieces: dict[str, Image.Image] = {}

    for color, (top, bottom) in BANDS.items():
        found = columns(drawing[top:bottom])
        if len(found) != len(KINDS):
            raise SystemExit(f"{color}: найдено {len(found)} фигур вместо {len(KINDS)}")

        for kind, (x0, x1) in zip(KINDS, found):
            # Зерно — середина колонки на двух третях полосы: там тело фишки.
            seed = ((x0 + x1) // 2, top + int((bottom - top) * 0.68))
            if not drawing[seed[1], seed[0]]:
                raise SystemExit(f"{color}{kind}: зерно попало в фон")

            region = plane.copy()
            ImageDraw.floodfill(region, seed, 128)
            mask = np.asarray(region) == 128
            ys, xs = np.nonzero(mask)
            box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)

            # Край чуть растушёван: заливка режет по пикселю, и без этого
            # контур на уменьшенной фигуре шёл бы лесенкой.
            alpha = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8))
            piece = sheet.convert("RGBA")
            piece.putalpha(alpha.filter(ImageFilter.GaussianBlur(0.7)))
            pieces[f"{color}{kind}"] = piece.crop(box)

    return pieces


def save(pieces: dict[str, Image.Image]) -> list[tuple[str, tuple[int, int], int]]:
    """Один масштаб на весь набор: пешка обязана быть ниже короля."""
    room = SIZE - PAD * 2
    scale = min(
        room / max(p.height for p in pieces.values()),
        room / max(p.width for p in pieces.values()),
    )

    DEST.mkdir(parents=True, exist_ok=True)
    made = []
    for name, piece in pieces.items():
        sized = piece.resize(
            (max(1, round(piece.width * scale)), max(1, round(piece.height * scale))),
            Image.LANCZOS,
        )
        canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
        # Фигура стоит на поле, а не висит по центру: опора на нижний край.
        canvas.paste(sized, ((SIZE - sized.width) // 2, SIZE - PAD - sized.height), sized)

        # WebP, а не PNG, как у шахмат: фигуры в фактуре и мелких надписях, и
        # PNG того же размера весит впятеро больше — 724 КиБ на набор против
        # 139. Прозрачность WebP держит без потерь.
        target = DEST / f"{name}.webp"
        canvas.save(target, "WEBP", quality=90, method=6)
        made.append((target.name, sized.size, target.stat().st_size))

    return made


if __name__ == "__main__":
    total = 0
    for name, size, weight in save(extract()):
        total += weight
        print(name, size, f"{weight // 1024} КиБ")
    print(f"всего {total // 1024} КиБ")
