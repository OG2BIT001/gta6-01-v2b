#!/usr/bin/env python3
"""Rasterise the four screenshots for Neon Tide: Coral Bay.

The city layout (buildings, palms, lamps, lots, piers, places) is the real
seed-7 output of the game's own generator, dumped by tools/dump_city.mjs.
Actors (player, traffic, police, rivals) are staged on top and the HUD is
drawn in the game's style, so each frame shows what play looks like; the
frames are compositions, not browser captures — SESSION.md says so too.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "screenshots"
W, H = 1280, 720
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONTB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

AVENUES_X = [420, 1240, 2060, 2880, 3700, 4520, 5340, 6100]
STREETS_Y = [420, 1240, 2060, 2880, 3700, 4460]
ROAD_W = 168
BAY = (4700, 3560, 1700, 1240)
GROUND = {
    "Old Town": "#6d5a49", "Coral Heights": "#4c7350", "Downtown": "#4a4d55",
    "Palm Gardens": "#527a4c", "North Works": "#5d5d58", "Neon Mile": "#4e4258",
    "Mercado": "#7a5c40", "South Beach": "#c9ab72", "The Docks": "#5a5e5c",
}


def district_at(x, y):
    if x > BAY[0] - 60 and y > BAY[1] - 60:
        return "The Docks"
    if y > 3760:
        return "Mercado" if x < 3000 else "South Beach"
    if y < 1150:
        return "Old Town" if x < 2100 else ("Coral Heights" if x < 4300 else "North Works")
    if x > 4400:
        return "Neon Mile"
    if 2100 < x < 4400 and 1150 < y < 2900:
        return "Downtown"
    if x < 2100:
        return "Palm Gardens"
    return "Mercado"


def f(size, bold=False):
    return ImageFont.truetype(FONTB if bold else FONT, size)


class Scene:
    def __init__(self, city, cx, cy, night=0.0):
        self.city = city
        self.img = Image.new("RGB", (W, H), "#333")
        self.d = ImageDraw.Draw(self.img, "RGBA")
        self.cx, self.cy = cx, cy
        self.night = night

    def s(self, x, y):
        return (x - self.cx + W / 2, y - self.cy + H / 2)

    def visible(self, x, y, pad=80):
        sx, sy = self.s(x, y)
        return -pad < sx < W + pad and -pad < sy < H + pad

    def base(self):
        d = self.d
        slab = 800
        gx = int((self.cx - W / 2) // slab * slab)
        gy = int((self.cy - H / 2) // slab * slab)
        for x in range(gx, gx + W + slab, slab):
            for y in range(gy, gy + H + slab, slab):
                sx, sy = self.s(x, y)
                d.rectangle([sx, sy, sx + slab, sy + slab], fill=GROUND[district_at(x + slab / 2, y + slab / 2)])
        # bay
        bx, by = self.s(BAY[0], BAY[1])
        d.rectangle([bx, by, bx + BAY[2], by + BAY[3]], fill="#14506e")
        d.rectangle([bx - 26, by - 26, bx + BAY[2], by], fill="#d9bd7f")
        d.rectangle([bx - 26, by, bx, by + BAY[3]], fill="#d9bd7f")
        for lot in self.city["lots"]:
            if not self.visible(lot["x"], lot["y"], 500):
                continue
            x, y = self.s(lot["x"], lot["y"])
            col = {"green": "#47824b", "plaza": "#8d8578"}.get(lot["kind"], "#4c4f55")
            d.rectangle([x, y, x + lot["w"], y + lot["h"]], fill=col)
        # roads
        for rx in AVENUES_X:
            x, _ = self.s(rx, 0)
            d.rectangle([x - ROAD_W / 2, 0, x + ROAD_W / 2, H], fill="#33373f")
        for ry in STREETS_Y:
            _, y = self.s(0, ry)
            d.rectangle([0, y - ROAD_W / 2, W, y + ROAD_W / 2], fill="#33373f")
        for rx in AVENUES_X:
            x, _ = self.s(rx, 0)
            for yy in range(12, 4800, 46):
                _, sy = self.s(0, yy)
                if -30 < sy < H + 30:
                    d.rectangle([x - 2, sy, x + 2, sy + 26], fill="#d8c26a")
        for ry in STREETS_Y:
            _, y = self.s(0, ry)
            for xx in range(12, 6400, 46):
                sx, _ = self.s(xx, 0)
                if -30 < sx < W + 30:
                    d.rectangle([sx, y - 2, sx + 26, y + 2], fill="#d8c26a")
        for pier in self.city["piers"]:
            x, y = self.s(pier["x"], pier["y"])
            d.rectangle([x, y, x + pier["w"], y + pier["h"]], fill="#7a6a52")
        # palms
        for palm in self.city["palms"]:
            if not self.visible(palm["x"], palm["y"], 40):
                continue
            x, y = self.s(palm["x"], palm["y"])
            for k in range(6):
                a = k / 6 * math.tau + palm["s"]
                d.line([x, y, x + math.cos(a) * 17 * palm["s"], y + math.sin(a) * 12 * palm["s"] + 3],
                       fill="#3f8f4f", width=3)
            d.ellipse([x - 2, y - 2, x + 2, y + 2], fill="#6b5136")
        # buildings
        for b in self.city["buildings"]:
            if not self.visible(b["x"] + b["w"] / 2, b["y"] + b["h"] / 2, 420):
                continue
            x, y = self.s(b["x"], b["y"])
            lift = b["tier"] * 7
            d.rectangle([x + lift + 5, y + lift + 7, x + b["w"] + lift + 5, y + b["h"] + lift + 7],
                        fill=(0, 0, 0, 80))
            d.rectangle([x, y, x + b["w"], y + b["h"]], fill=b["colour"])
            d.rectangle([x, y, x + b["w"], y + 7], fill=(255, 255, 255, 26))
            cols = max(2, int(b["w"] // 30))
            rows = max(2, int(b["h"] // 30))
            for i in range(cols):
                for j in range(rows):
                    lit = ((i * 7 + j * 13 + b["windows"]) % 5) < (3 if self.night > 0.45 else 1)
                    col = (255, 205, 110, 215) if (lit and self.night > 0.45) else (170, 210, 235, 70)
                    wx = x + 9 + i * ((b["w"] - 18) / cols)
                    wy = y + 9 + j * ((b["h"] - 18) / rows)
                    d.rectangle([wx, wy, wx + 9, wy + 6], fill=col)
            if b.get("neon") and self.night > 0.3:
                d.rectangle([x + 6, y + 6, x + 6 + min(64, b["w"] - 12), y + 12], fill=b["neon"])

    def night_pass(self, lamps=True):
        if self.night <= 0.03:
            return
        overlay = Image.new("RGBA", (W, H), (7, 10, 34, int(135 * self.night)))
        self.img = Image.alpha_composite(self.img.convert("RGBA"), overlay).convert("RGB")
        self.d = ImageDraw.Draw(self.img, "RGBA")
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        if lamps:
            for lamp in self.city["lamps"]:
                if not self.visible(lamp["x"], lamp["y"], 100):
                    continue
                x, y = self.s(lamp["x"], lamp["y"])
                gd.ellipse([x - 60, y - 60, x + 60, y + 60], fill=(255, 214, 140, int(30 * self.night)))
        glow = glow.filter(ImageFilter.GaussianBlur(18))
        self.img = Image.alpha_composite(self.img.convert("RGBA"), glow).convert("RGB")
        self.d = ImageDraw.Draw(self.img, "RGBA")

    def car(self, x, y, angle, colour, cop=False, target=False):
        layer = Image.new("RGBA", (120, 120), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        cx = cy = 60
        ld.rounded_rectangle([cx - 17, cy - 7, cx + 23, cy + 13], 6, fill=(0, 0, 0, 70))
        body = "#26262a" if target else colour
        ld.rounded_rectangle([cx - 20, cy - 10, cx + 20, cy + 10], 6, fill=body)
        if cop:
            ld.rounded_rectangle([cx - 20, cy - 10, cx + 20, cy + 10], 6, fill="#15181d")
            ld.rounded_rectangle([cx - 14, cy - 8, cx + 14, cy + 8], 4, fill="#e8ecf2")
        if target:
            ld.rounded_rectangle([cx - 20, cy - 10, cx + 20, cy + 10], 6, fill="#596068")
        ld.rounded_rectangle([cx - 8, cy - 6.5, cx + 9, cy + 6.5], 3, fill=(16, 22, 32, 235))
        ld.rectangle([cx + 18, cy - 8, cx + 20, cy - 4], fill="#fff6c9")
        ld.rectangle([cx + 18, cy + 4, cx + 20, cy + 8], fill="#fff6c9")
        ld.rectangle([cx - 20, cy - 8, cx - 18, cy - 4], fill="#ee3333")
        ld.rectangle([cx - 20, cy + 4, cx - 18, cy + 8], fill="#ee3333")
        if cop:
            ld.rounded_rectangle([cx - 4, cy - 4, cx + 5, cy + 4], 2, fill="#ff3b30")
        layer = layer.rotate(-math.degrees(angle), resample=Image.BILINEAR, center=(cx, cy))
        sx, sy = self.s(x, y)
        self.img.paste(layer, (int(sx - 60), int(sy - 60)), layer)
        self.d = ImageDraw.Draw(self.img, "RGBA")

    def person(self, x, y, angle, colour, skin="#c68850", gun=False, marker=None):
        d = self.d
        sx, sy = self.s(x, y)
        d.ellipse([sx - 9, sy - 6, sx + 11, sy + 9], fill=(0, 0, 0, 70))
        d.ellipse([sx - 8.4, sy - 8.4, sx + 8.4, sy + 8.4], fill=colour)
        hx, hy = sx + math.cos(angle) * 2.4, sy + math.sin(angle) * 2.4
        d.ellipse([hx - 4.6, hy - 4.6, hx + 4.6, hy + 4.6], fill=skin)
        if gun:
            d.line([sx + math.cos(angle) * 6, sy + math.sin(angle) * 6,
                    sx + math.cos(angle) * 17, sy + math.sin(angle) * 17], fill="#151515", width=3)
        if marker:
            d.polygon([(sx, sy - 20), (sx - 6, sy - 30), (sx + 6, sy - 30)], fill=marker)

    def marker(self, x, y, colour="#facc15"):
        sx, sy = self.s(x, y)
        self.d.ellipse([sx - 30, sy - 30, sx + 30, sy + 30], outline=colour, width=3)
        self.d.polygon([(sx, sy - 42), (sx - 9, sy - 58), (sx + 9, sy - 58)], fill=colour)

    def minimap(self, px, py, pangle, obj=None, cops=()):
        d = self.d
        mw, mh = 196, 147
        mx, my = W - mw - 16, H - mh - 46
        sx, sy = mw / 6400, mh / 4800
        d.rounded_rectangle([mx - 3, my - 3, mx + mw + 3, my + mh + 3], 8, fill=(12, 16, 22, 200))
        d.rectangle([mx, my, mx + mw, my + mh], fill="#2e4630")
        d.rectangle([mx + BAY[0] * sx, my + BAY[1] * sy, mx + (BAY[0] + BAY[2]) * sx, my + (BAY[1] + BAY[3]) * sy],
                    fill="#0d3d57")
        for rx in AVENUES_X:
            d.line([mx + rx * sx, my, mx + rx * sx, my + mh], fill=(230, 230, 230, 128), width=2)
        for ry in STREETS_Y:
            d.line([mx, my + ry * sy, mx + mw, my + ry * sy], fill=(230, 230, 230, 128), width=2)
        for cx, cy in cops:
            d.rectangle([mx + cx * sx - 2, my + cy * sy - 2, mx + cx * sx + 2, my + cy * sy + 2], fill="#3b82f6")
        if obj:
            ox, oy = mx + obj[0] * sx, my + obj[1] * sy
            d.ellipse([ox - 4.4, oy - 4.4, ox + 4.4, oy + 4.4], fill="#facc15")
        ax, ay = mx + px * sx, my + py * sy
        d.polygon([(ax + math.cos(pangle) * 6, ay + math.sin(pangle) * 6),
                   (ax + math.cos(pangle + 2.5) * 5, ay + math.sin(pangle + 2.5) * 5),
                   (ax + math.cos(pangle - 2.5) * 5, ay + math.sin(pangle - 2.5) * 5)], fill="#ffffff")
        d.text((mx + mw, my - 9), "CORAL BAY", font=f(10), fill=(255, 255, 255, 165), anchor="ra")

    def hud(self, money=420, stars=0, health=100, armour=30, car_health=None, objective=None,
            mission=None, clock="13:24", district="Downtown", speed=None):
        d = self.d
        d.rounded_rectangle([12, 10, 248, 74], 8, fill=(10, 12, 18, 140))
        d.rounded_rectangle([18, 16, 238, 29], 6, fill="#3a3f47")
        d.rounded_rectangle([18, 16, 18 + 220 * health / 100, 29], 6, fill="#4ade80")
        d.rounded_rectangle([18, 35, 238, 44], 5, fill="#3a3f47")
        if armour:
            d.rounded_rectangle([18, 35, 18 + 220 * armour / 100, 44], 5, fill="#7dd3fc")
        if car_health is not None:
            d.rounded_rectangle([18, 50, 238, 57], 4, fill="#3a3f47")
            d.rounded_rectangle([18, 50, 18 + 220 * car_health / 100, 57], 4, fill="#fbbf24")
        d.text((20, 62), "HEALTH / ARMOUR" + (" / CAR" if car_health is not None else ""),
               font=f(11, True), fill="#ffffff")
        d.text((W - 20, 16), f"${money:,}", font=f(26, True), fill="#4ade80", anchor="ra")
        d.text((W - 20, 50), f"{clock}  ·  {district}", font=f(14), fill=(255, 255, 255, 215), anchor="ra")
        for i in range(5):
            d.text((W - 24 - (4 - i) * 26, 66), "★", font=f(22),
                   fill="#ffd34d" if i < stars else (255, 255, 255, 56), anchor="ra")
        if objective:
            tw = d.textlength(objective, font=f(15, True)) + 30
            d.rounded_rectangle([W / 2 - tw / 2, 14, W / 2 + tw / 2, 44], 8, fill=(10, 12, 18, 140))
            d.text((W / 2, 22), objective, font=f(15, True), fill="#fde68a", anchor="ma")
        if mission:
            d.text((W / 2, 52), mission, font=f(12), fill=(255, 255, 255, 190), anchor="ma")
        if speed is not None:
            d.text((W - 52, H - 44), str(speed), font=f(30, True), fill="#ffffff", anchor="ra")
            d.text((W - 20, H - 32), "mph", font=f(12), fill=(255, 255, 255, 178), anchor="ra")

    def dialogue(self, who, text):
        d = self.d
        w = 680
        x, y = W / 2 - w / 2, H - 118
        d.rounded_rectangle([x, y, x + w, y + 74], 10, fill=(8, 10, 16, 210))
        d.rounded_rectangle([x, y, x + w, y + 74], 10, outline="#ff4fa3", width=2)
        d.text((x + 16, y + 8), who.upper(), font=f(12, True), fill="#ff8fc7")
        # crude wrap
        words, lines, cur = text.split(), [], ""
        for word in words:
            trial = f"{cur} {word}".strip()
            if d.textlength(trial, font=f(15)) > w - 32 and cur:
                lines.append(cur)
                cur = word
            else:
                cur = trial
        if cur:
            lines.append(cur)
        for i, ln in enumerate(lines[:2]):
            d.text((x + 16, y + 28 + i * 19), ln, font=f(15), fill="#f4f4f5")

    def save(self, name):
        OUT.mkdir(exist_ok=True)
        path = OUT / name
        self.img.save(path, quality=84)
        size = path.stat().st_size
        print(f"{name}: {size} bytes")
        if size > 262144:
            self.img.save(path, quality=68)
            print(f"  recompressed -> {path.stat().st_size} bytes")


def main():
    raw = subprocess.run(["node", str(ROOT / "tools" / "dump_city.mjs")],
                         capture_output=True, text=True, check=True).stdout
    city = json.loads(raw)
    places = city["places"]

    # 1 — cover: the title screen over the Neon Mile at dusk.
    sc = Scene(city, 4300, 2100, night=0.55)
    sc.base()
    sc.car(4150, 2130, 0.2, "#c23b4e")
    sc.car(4520, 2240, math.pi, "#3b6dc2")
    sc.person(4350, 2200, -0.6, "#f2f2f2")
    sc.night_pass()
    d = sc.d
    d.rectangle([0, 0, W, H], fill=(10, 6, 24, 108))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.text((W / 2, H * 0.30), "NEON TIDE", font=f(88, True), fill=(255, 79, 163, 255), anchor="ms")
    glow = glow.filter(ImageFilter.GaussianBlur(16))
    sc.img = Image.alpha_composite(sc.img.convert("RGBA"), glow).convert("RGB")
    sc.d = ImageDraw.Draw(sc.img, "RGBA")
    d = sc.d
    d.text((W / 2, H * 0.30), "NEON TIDE", font=f(88, True), fill="#ff4fa3", anchor="ms")
    d.text((W / 2, H * 0.30 + 62), "C O R A L   B A Y", font=f(38, True), fill="#a5f3fc", anchor="ms")
    d.text((W / 2, H * 0.30 + 108),
           "An open-world crime story in a city of palms, neon and other people’s cars.",
           font=f(15), fill=(255, 255, 255, 215), anchor="ms")
    d.text((W / 2, H * 0.55), "ENTER — New game", font=f(19, True), fill="#facc15", anchor="ms")
    d.text((W / 2, H * 0.55 + 34), "H — How to play", font=f(19, True), fill=(255, 255, 255, 205), anchor="ms")
    sc.save("1-cover.jpg")

    # 2 — daytime driving downtown, traffic around, mission marker ahead.
    sc = Scene(city, 2880, 1500, night=0.0)
    sc.base()
    sc.car(2880, 1620, math.pi / 2, "#3fae6a")
    sc.car(2796, 1150, math.pi / 2, "#d8d3c8")
    sc.car(2964, 1900, -math.pi / 2, "#3b6dc2")
    sc.car(2060, 1252, 0, "#e0a32e")
    sc.person(2760, 1330, 1.2, "#d95b7a", skin="#8a5a33")
    sc.person(3010, 1420, -2.1, "#5b8dd9", skin="#f2c79b")
    sc.marker(2880, 2130)
    sc.car(2880, 1560, math.pi / 2, "#c23b4e")
    sc.hud(money=420, objective="Pick up the package behind Club Sirena",
           mission="First Night in Coral Bay", clock="11:48", district="Downtown",
           car_health=92, speed=41)
    sc.minimap(2880, 1560, math.pi / 2, obj=(4520, 2130))
    sc.save("2-drive.jpg")

    # 3 — a three-star chase at dusk.
    sc = Scene(city, 3700, 2350, night=0.35)
    sc.base()
    sc.car(3580, 2050, math.pi / 2, "#2e2e33")
    sc.car(3830, 2700, -math.pi / 2, "#8f9aa6")
    sc.car(3700, 2400, math.pi / 2, "#e0a32e")
    sc.car(3620, 2150, math.pi / 2 + 0.16, "#e8ecf2", cop=True)
    sc.car(3790, 2180, math.pi / 2 - 0.12, "#e8ecf2", cop=True)
    sc.car(3706, 1985, math.pi / 2, "#e8ecf2", cop=True)
    d = sc.d
    for i in range(9):  # sparks where a cop clipped the player's wing
        x, y = sc.s(3745 + (i % 3) * 7, 2330 + (i // 3) * 6)
        d.line([x, y, x + 12 - i, y - 9], fill="#ffd34d", width=2)
    sc.night_pass()
    sc.hud(money=1240, stars=3, health=76, armour=30, car_health=58,
           objective="Get back to the safehouse — lose the heat first (or respray)",
           mission="Dockyard Dogs", clock="19:36", district="Neon Mile", speed=63)
    sc.minimap(3700, 2400, math.pi / 2, obj=(1240, 520),
               cops=[(3620, 2150), (3790, 2180), (3706, 1985)])
    sc.save("3-chase.jpg")

    # 4 — on foot at night outside Club Sirena, rivals closing in.
    sc = Scene(city, 4400, 2260, night=0.9)
    sc.base()
    club = places["club"]
    sc.marker(club["x"], club["y"], colour="#ff4fa3")
    sc.car(4460, 2380, 0.1, "#7a4fc2")
    sc.person(4330, 2290, 0.4, "#f2f2f2", gun=True)
    sc.person(4520, 2190, -2.4, "#7a1f2b", gun=True, marker="#ee3333")
    sc.person(4610, 2330, -2.9, "#7a1f2b", gun=True, marker="#ee3333")
    sc.person(4250, 2180, 0.9, "#5bd97e", skin="#8a5a33")
    d = sc.d
    x1, y1 = sc.s(4347, 2294)
    x2, y2 = sc.s(4503, 2197)
    d.line([x1, y1, x2, y2], fill=(255, 230, 150, 230), width=2)
    sc.night_pass()
    sc.hud(money=3050, stars=1, health=88, armour=50,
           objective="Take the ledger from its guards (0/5)", mission="Neon Requiem",
           clock="23:12", district="Neon Mile")
    sc.minimap(4330, 2290, 0.4, obj=(6100, 520))
    sc.dialogue("Selene", "The ledger is at the airstrip, guarded by what is left of them. Take it to the boat at Pier 9.")
    sc.save("4-foot.jpg")


if __name__ == "__main__":
    sys.exit(main())
