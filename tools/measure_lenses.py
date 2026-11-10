#!/usr/bin/env python3
"""Mittaa sensorilinssien muodon ja korkeuden akselin suuntaisista kuvista.

Akselin suunnasta kuvattuna linssit näkyvät reiän ääriviivassa kumpuina. Reiän säde
mitataan 0.5°:n välein (läpinäkyvyysmaskista), ja kummun korkeus = reiän mediaanisäde
(yläpuolisko) − säde linssin kohdalla, suhteutettuna ulkoreunan säteeseen.

  python3 tools/measure_lenses.py virallinen1.png [virallinen2.png ...] [--model malli.json]

Viralliset kuvat: Ouran läpinäkyvätaustaiset sivukuvat (or5-*-side-view). Malli:
index.html?match=axial&nohq&webgl ja konsolissa  JSON.stringify(await __captureDebug('id'))
tallennettuna tiedostoon (taustapikselit ovat mustia).

Tulostaa virallisten kuvien keskiarvoprofiilin millimetreinä, linssien sovitetun muodon
h(s) = H − (R − H)(1/cos(s/R) − 1) − s²/(2ρ) (tason jänne + kuvun nuoli), ja mallin
profiilin rinnakkain, jos se annetaan.
"""
import argparse, base64, json, math
import numpy as np
from PIL import Image
from scipy.optimize import least_squares

Image.MAX_IMAGE_PIXELS = None
ap = argparse.ArgumentParser()
ap.add_argument('images', nargs='+')
ap.add_argument('--model')
ap.add_argument('--radius', type=float, default=9.224, help='kuvien sormuksen sisäsäde (mm)')
ap.add_argument('--mm-per-permille', type=float, default=0.01162, help='1 ‰ ulkosäteestä millimetreinä')
a = ap.parse_args()
ANG = np.arange(-90, 90.01, 0.5)  # 0 = kämmenen puolen keskilinja (kuvan alaosa)


def hole_radius(mask, cx, cy, r0, r1, angles):
    rs = np.arange(r0, r1, 0.25)
    out = []
    for deg in angles:
        t = math.radians(deg)
        x = cx + rs * math.sin(t)
        y = cy + rs * math.cos(t)
        x0 = np.floor(x).astype(int)
        y0 = np.floor(y).astype(int)
        fx, fy = x - x0, y - y0
        v = mask[y0, x0] * (1 - fx) * (1 - fy) + mask[y0, x0 + 1] * fx * (1 - fy) + mask[y0 + 1, x0] * (1 - fx) * fy + mask[y0 + 1, x0 + 1] * fx * fy
        i = np.nonzero(v > 0.5)[0]
        out.append(rs[i[0]] if len(i) else np.nan)
    return np.array(out)


def profile(mask):
    ys, xs = np.nonzero(mask > 0.5)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    rout = (xs.max() - xs.min()) / 2
    r = hole_radius(mask, cx, cy, rout * 0.6, rout * 0.99, ANG)
    hole = np.median(hole_radius(mask, cx, cy, rout * 0.6, rout * 0.99, np.arange(100, 260, 2)))
    b = (hole - r) / rout * 1000
    return (b + b[::-1]) / 2  # vasen ja oikea puoli keskiarvoon


def load_mask(p):
    if p.endswith('.json'):
        d = json.load(open(p))
        px = np.frombuffer(base64.b64decode(d['data']), np.uint8).reshape(d['h'], d['w'], 4)
        return (px[..., :3].astype(int).sum(-1) > 0).astype(float)
    return np.array(Image.open(p).convert('RGBA'))[..., 3] / 255.0


off = np.mean([profile(load_mask(p)) for p in a.images], 0) * a.mm_per_permille
mdl = profile(load_mask(a.model)) * a.mm_per_permille if a.model else None
R = a.radius
for name, lo, hi in (('LED', 22, 46), ('fotodiodi', 48, 72)):
    sel = (ANG >= lo) & (ANG <= hi)
    c = ANG[sel][np.argmax(off[sel])]
    s = np.radians(ANG - c) * R
    m = sel & (np.abs(s) < 1.15)
    fit = least_squares(lambda x: x[0] - (R - x[0]) * (1 / np.cos(s[m] / R) - 1) - s[m] ** 2 * x[1] / 2 - off[m], [0.5, 0.1])
    H, k = fit.x
    edge = s[sel][off[sel] > 0.05]
    print('%s: keskikohta %.1f°, huippu %.3f mm, kupu %s, reunat %.2f…%.2f mm, jäännös %.4f mm' % (
        name, c, H, 'säde %.1f mm' % (1 / k) if k > 0.01 else 'tasainen', edge.min(), edge.max(), np.sqrt(np.mean(fit.fun ** 2))))
    print('  kulma ' + ' '.join('%6.1f' % v for v in ANG[sel][::2]))
    print('  virall' + ' '.join('%6.3f' % v for v in off[sel][::2]))
    if mdl is not None:
        print('  malli ' + ' '.join('%6.3f' % v for v in mdl[sel][::2]))
