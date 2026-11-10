#!/usr/bin/env python3
"""Rekonstruoi Ouran tuotekuvausstudion valaistuksen virallisista kuvista (inverse rendering).

Tuottaa src/studioEnv.js-tiedoston (48 × 24 lat-long-ruudukko, lineaarinen säteily).

1. Renderöi mallista virallisen 43°-kuvan kameralla kolme debug-kuvaa (2000 × 2000 px):
     index.html?match&nohq&webgl  ja selainkonsolissa  await __captureDebug('refl' | 'id' | 'inward')
   Kukin palauttaa {w, h, data: base64-RGBA}; tallenna data raakatavuina (refl.raw, id.raw, inward.raw).
     refl   = heijastussuunta maailman koordinaateissa (0.5 + 0.5·R)
     id     = pinnan tunniste: punainen = värillinen ulkokuori, vihreä = titaaninen sisäosa
     inward = kuinka paljon normaali osoittaa kohti akselia (0 = kupera ulkopinta)
2. python3 tools/recover_studio.py <debug-hakemisto> <silver.png> [<väri>=<kuva.png> ...] --out src/studioEnv.js

Jokaiselle kuperan pinnan pikselille: säteily L(R) = TM⁻¹(pikseli) / F(cos θ), missä TM⁻¹ on
three.js:n Neutral-sävykartoituksen käänteisfunktio ja F Schlickin Fresnel tunnetulla F0:lla
(Silver-ulkopinta ja kaikkien värien titaaniset sivut). Näytteet ryhmitellään 7.5°:n soluihin
(mediaani), peilataan vasen–oikea-symmetrisiksi (geometrinen keskiarvo) ja tasoitetaan
log-säteilynä (toisen kertaluvun tasoitus, lam = 0.45). Toteutetussa mallissa dataa oli
1050 / 1152 solussa ja sovitteen jäännös 0.16 log-asteikolla (rms, ≈ 17 %).
"""
import argparse, base64, json, os
import numpy as np
import scipy.sparse as sp
from scipy.ndimage import binary_erosion
from scipy.sparse.linalg import spsolve
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ap = argparse.ArgumentParser()
ap.add_argument('debug_dir')
ap.add_argument('silver')
ap.add_argument('others', nargs='*', help='titaanisivujen lisäkuvat muodossa nimi=kuva.png')
ap.add_argument('--n', type=int, default=2000)
ap.add_argument('--cam', default='6543.19,499.6772,540.3558', help='f, cx, cy (1000 px asteikossa)')
ap.add_argument('--f0-silver', type=float, default=0.64)
ap.add_argument('--f0-titanium', type=float, default=0.6)
ap.add_argument('--lam', type=float, default=0.45)
ap.add_argument('--out', default='src/studioEnv.js')
a = ap.parse_args()
N = a.n


def raw(name):
    return np.frombuffer(open(os.path.join(a.debug_dir, name + '.raw'), 'rb').read(), np.uint8).reshape(N, N, 4)


refl, idm, inw = raw('refl'), raw('id'), raw('inward')[..., 0] / 255.0
R = refl[..., :3].astype(float) / 255 * 2 - 1
R /= np.linalg.norm(R, axis=2, keepdims=True) + 1e-9
convex = inw < 0.62
er = lambda m: binary_erosion(m, iterations=4)
m_outer = er((idm[..., 0] > 200) & (idm[..., 1] < 60) & (idm[..., 2] < 60) & convex)
m_tita = er((idm[..., 1] > 200) & (idm[..., 0] < 60) & (idm[..., 2] < 60) & convex)

f, cx, cy = map(float, a.cam.split(','))
ys, xs = np.mgrid[0:N, 0:N]
X = (xs + 0.5) * 1000 / N
Y = (ys + 0.5) * 1000 / N
ray = np.stack([(X - cx) / f, -(Y - cy) / f, -np.ones_like(X)], -1)
ray /= np.linalg.norm(ray, axis=2, keepdims=True)
cosT = np.sqrt(np.clip((1 + (R * -ray).sum(2)) / 2, 0, 1))  # puolikulma: cos θ = n·v


def neutral(v):  # Khronos PBR Neutral (three.js NeutralToneMapping), harmaasävy
    off = np.where(v < 0.08, v - 6.25 * v * v, 0.04)
    c = v - off
    return np.where(c < 0.76, c, 1 - 0.24 * 0.24 / (c + 0.24 - 0.76))


grid = np.linspace(0, 60, 200001)
tm = neutral(grid)
tm_inv = lambda y: np.interp(y, tm, grid)
lin = lambda c: np.where(c / 255 <= 0.04045, c / 255 / 12.92, ((c / 255 + 0.055) / 1.055) ** 2.4)


def load(p):
    im = Image.open(p).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    return np.array(bg.convert('RGB').resize((N, N), Image.LANCZOS)).astype(float)


samples = []


def add(mask, img, F0, w):
    px = img[mask]
    ok = (px.max(1) < 250) & (px.min(1) > 3)  # ei leikkautuneita pikseleitä
    F = F0 + (1 - F0) * (1 - cosT[mask]) ** 5
    L = tm_inv(lin(px).mean(1)) / F
    samples.append((R[mask][ok], L[ok], np.full(ok.sum(), w)))


silver = load(a.silver)
add(m_outer, silver, a.f0_silver, 1.0)
add(m_tita, silver, a.f0_titanium, 0.5)
for spec in a.others:
    add(m_tita, load(spec.split('=', 1)[1]), a.f0_titanium, 0.5)
Rs = np.concatenate([s[0] for s in samples])
Ls = np.concatenate([s[1] for s in samples])

# 1) ryhmittely lat-long-soluihin (atsimuutti = atan2(x, z), korkeus = asin(y))
NA, NE = 48, 24
el = np.arcsin(np.clip(Rs[:, 1], -1, 1))
az = np.arctan2(Rs[:, 0], Rs[:, 2])
ie = np.clip(((el + np.pi / 2) / np.pi * NE).astype(int), 0, NE - 1)
ia = np.clip(((az + np.pi) / (2 * np.pi) * NA).astype(int), 0, NA - 1)
cell = ie * NA + ia
med = np.full(NA * NE, np.nan)
cnt = np.bincount(cell, minlength=NA * NE)
for c in np.unique(cell):
    sel = cell == c
    if sel.sum() >= 30:
        med[c] = np.median(Ls[sel])
med = med.reshape(NE, NA)
cnt = cnt.reshape(NE, NA)

# 2) vasen–oikea-symmetria (geometrinen keskiarvo, puuttuva puoli täydennetään peilistä)
g = np.sqrt(med * med[:, ::-1])
med = np.where(np.isfinite(g), g, np.where(np.isfinite(med), med, med[:, ::-1]))

# 3) tasoitus log-säteilynä: data + toisen kertaluvun tasoitus atsimuutissa (jaksollinen) ja korkeudessa
n = NE * NA
idx = lambda e, k: e * NA + (k % NA)
rows, cols, vals, rhs = [], [], [], []


def row(cs, vs, b, w):
    r = len(rhs)
    for c, v in zip(cs, vs):
        rows.append(r)
        cols.append(c)
        vals.append(v * w)
    rhs.append(b * w)


obs = np.isfinite(med)
for e in range(NE):
    for k in range(NA):
        if obs[e, k]:
            row([idx(e, k)], [1.0], np.log(max(med[e, k], 1e-3)), min(1.0, np.sqrt(cnt[e, k] / 200.0)) + 0.2)
for e in range(NE):
    ce = np.cos((e + 0.5) / NE * np.pi - np.pi / 2)
    for k in range(NA):
        row([idx(e, k - 1), idx(e, k), idx(e, k + 1)], [1, -2, 1], 0, a.lam * max(ce, 0.15))
for e in range(1, NE - 1):
    for k in range(NA):
        row([idx(e - 1, k), idx(e, k), idx(e + 1, k)], [1, -2, 1], 0, a.lam)
for e in range(NE):  # heikko oletus havaitsemattomille soluille: korkeusrivin mediaani
    v = med[e][np.isfinite(med[e])]
    prior = np.log(np.median(v)) if len(v) else np.log(0.4)
    for k in range(NA):
        row([idx(e, k)], [1.0], prior, 0.05)
A = sp.csr_matrix((vals, (rows, cols)), shape=(len(rhs), n))
x = spsolve((A.T @ A).tocsc(), A.T @ np.array(rhs))
L = np.exp(x).reshape(NE, NA)
res = np.log(L[obs]) - np.log(med[obs])
print('soluja datalla %d / %d, jäännös rms %.3f log (%.0f %%)' % (obs.sum(), n, np.sqrt((res ** 2).mean()), (np.exp(np.sqrt((res ** 2).mean())) - 1) * 100))

with open(a.out, 'w') as fo:
    fo.write('''// Ouran studiovalaistus, rekonstruoitu virallisista tuotekuvista (tools/recover_studio.py).
//
// Jokaiselle virallisen 43°-tuotekuvan kuperan pinnan pikselille laskettiin heijastussuunta
// (mallin geometria ja sovitettu kamera), Fresnel-kerroin ja Neutral-sävykartoituksen
// käänteisfunktio: L(suunta) = TM⁻¹(pikseli) / F. Lähteinä Silver-ulkopinta ja kaikkien kuuden
// värin titaaniset sivupinnat (F0 tunnettu). Tulos peilattiin vasen–oikea-symmetriseksi ja
// tasoitettiin (log-säteily, 2. kertaluvun tasoitus) 48 × 24 ruudukkoon (7.5°).
// Rivit: korkeus −90° → +90°, sarakkeet: atsimuutti atan2(x, z) −180° → +180°
// (maailman koordinaatit match-näkymässä: y ylös, z kohti kameraa).
export const STUDIO_ENV = {
  width: %d,
  height: %d,
  data: [%s],
};
''' % (NA, NE, ','.join('%.3f' % v for v in L.ravel())))
print('kirjoitettu', a.out)
