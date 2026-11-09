#!/usr/bin/env python3
"""Mittaa sivupinnan rakenteen akselin suuntaisesta virallisesta tuotekuvasta.

Ouran "side view" -kuvissa (or5-*-side-view, 3840 px) sormus on kuvattu akselin suunnasta
perspektiivikameralla. Sivupinnan osat näkyvät samankeskisinä renkaina:

    värillinen kuori (kaarevuus → kirkkaus vaihtuu tasaisesti)
    tumma rako
    värillinen lukitusrengas (tasainen → kirkkaus vakio)
    sauma
    titaaninen sisäosa (pyöreä reuna → pehmeä liukuma)
    reiän pinta perspektiivissä
    reikä

Työkalu
  1. mittaa rajojen kuvasäteet (px) usealta kulmalta (sensorit vältetään) ja ottaa mediaanin;
     värillisen ja titaanisen osan raja tunnistetaan värikylläisyydestä (Deep Rose -kuva),
  2. ratkaisee perspektiivikameran kolmesta havainnosta: reiän reuna (reiän kaukainen pää),
     lähireunan peittoraja (reiän pinnan lähin pää) ja ulkoreuna:
        rho_reikä / rho_lähireuna = (D - w) / (D + w),   w = A - d   (d = reiän pinnan pään upotus)
        rho_reikä = f * Ri / (D + w)
  3. muuntaa rajojen kuvasäteet millimetreiksi sivupinnan tasossa: r = rho * (D - A) / f.

Tulos (Ri = 10.945 mm, d = 0.2 mm → D ≈ 120 mm, 112 px/mm sivupinnalla), syvyys ulkopinnasta:
    kuoren värillinen kaari päättyy 0.515 · rako 0.52–0.61 · lukitusrenkaan pyöristetty ulkoreuna
    0.61–0.70 · tasainen lukitusrengas 0.70–1.065 · sisäreuna 1.07–1.11 · sauma 1.11–1.155 ·
    titaani 1.16 → reikä.
Riippumaton tarkistus: 43°-tuotekuvan ylä- ja alaosassa sama tasainen vyö näkyy syvyyksillä
0.99–1.32 ja 0.36–0.74; niiden keskiarvo 0.675–1.03 vastaa tätä mittausta 0.03 mm:n tarkkuudella.

Käyttö: python3 tools/axial_features.py rose.png black.png silver.png [--ri 10.945] [--d 0.2]
Vaatii: numpy, pillow.
"""
import argparse, math
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ap = argparse.ArgumentParser()
ap.add_argument('images', nargs='+', help='ensimmäinen kuva värillinen (esim. Deep Rose)')
ap.add_argument('--ri', type=float, default=10.945)
ap.add_argument('--d', type=float, default=0.2)
args = ap.parse_args()
A, T = 6.09 / 2, 2.28
ANGLES = list(range(90, 271, 5))  # 0 = alaosa; sensorit (±34°, ±60°) jäävät pois

def load(path):
    im = np.array(Image.open(path).convert('RGBA')).astype(float)
    ys, xs = np.nonzero(im[..., 3] > 128)
    return im, (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2

def radial(im, cx, cy, rs, deg):
    t = math.radians(deg)
    x = cx + rs * math.sin(t); y = cy + rs * math.cos(t)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); fx = x - x0; fy = y - y0
    out = np.zeros((len(rs), 4))
    for ch in range(4):
        out[:, ch] = (im[y0, x0, ch] * (1 - fx) * (1 - fy) + im[y0, x0 + 1, ch] * fx * (1 - fy)
                      + im[y0 + 1, x0, ch] * (1 - fx) * fy + im[y0 + 1, x0 + 1, ch] * fx * fy)
    return out

rs = np.arange(1100, 1490, 0.25)
meas = []
for path in args.images:
    im, cx, cy = load(path)
    hole, near, outer = [], [], []
    for deg in ANGLES:
        p = radial(im, cx, cy, rs, deg)
        a = p[:, 3] / 255; L = p[:, :3].mean(1)
        op = np.nonzero(a > 0.5)[0]
        hole.append(rs[op[0]]); outer.append(rs[op[-1]])
        m = (rs >= 1215) & (rs <= 1240)
        near.append(rs[m][:-1][np.argmin(np.diff(L[m]))])
    meas.append((np.median(hole), np.median(near), np.median(outer)))
    print('%s: reikä %.2f px, lähireuna %.2f px, ulkoreuna %.2f px' % (path.split('/')[-1], *meas[-1]))

hole, near, outer = np.mean(meas, 0)
w = A - args.d
D = w * (near + hole) / (near - hole)
f = hole * (D + w) / args.ri
s = f / (D - A)
print('\nkamera: D = %.1f mm, f = %.0f px, mittakaava sivupinnalla %.2f px/mm' % (D, f, s))

# värillisen alueen rajat ensimmäisestä (värillisestä) kuvasta
im, cx, cy = load(args.images[0])
rs2 = np.arange(1340, 1475, 0.5)
sat = np.median([radial(im, cx, cy, rs2, d)[:, 0] - radial(im, cx, cy, rs2, d)[:, 2] for d in ANGLES], 0)
lum = np.median([radial(im, cx, cy, rs2, d)[:, :3].mean(1) for d in ANGLES], 0)
Ro = args.ri + T
print('\nsäde px   syvyys mm   kylläisyys  kirkkaus')
for r, sa, l in zip(rs2[::2], sat[::2], lum[::2]):
    print('%7.1f   %7.3f   %8.1f   %7.1f' % (r, Ro - r / s, sa, l))
