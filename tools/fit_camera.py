#!/usr/bin/env python3
"""Sovittaa kameran asennon viralliseen tuotekuvaan siluetin perusteella.

Käyttö:
  python3 tools/fit_camera.py <kuva.png> [--width 6.09] [--thickness 2.28] [--out cam.json]

Kuvan on oltava läpinäkyvätaustainen PNG (Ouran lineItem-tuotekuvat ovat). Rengas
mallinnetaan pyörähdyskappaleena (viralliset leveys ja paksuus, pyöristetyt kulmat),
ja Nelder–Mead-optimointi etsii kallistuksen, kameran etäisyyden, polttovälin,
kuvakeskipisteen ja sisäsäteen, joilla siluettien IoU on suurin.

Tulos: kameraparametrit (1000 px kuvaan skaalattuna) ja peittokuva overlay.png
(punainen = virallinen, vihreä = malli, keltainen = päällekkäin).
Vaatii: numpy, scipy, opencv-python-headless, pillow.
"""
import argparse, json
import numpy as np, cv2
from PIL import Image
from scipy.optimize import minimize

Image.MAX_IMAGE_PIXELS = None
ap = argparse.ArgumentParser()
ap.add_argument('image')
ap.add_argument('--width', type=float, default=6.09)
ap.add_argument('--thickness', type=float, default=2.28)
ap.add_argument('--out', default='cam.json')
args = ap.parse_args()

N = 1000
target = (np.array(Image.open(args.image).convert('RGBA').resize((N, N), Image.LANCZOS))[..., 3] > 128).astype(np.uint8)
W, T = args.width, args.thickness


def ring_vertices(Rin, rc=0.45, n=10):
    a, Ro, pts = W / 2, Rin + T, []
    for cz, cr, st in [(a - rc, Ro - rc, 0), (-a + rc, Ro - rc, 90), (-a + rc, Rin + rc, 180), (a - rc, Rin + rc, 270)]:
        for k in range(n + 1):
            t = np.radians(st + 90 * k / n)
            pts.append((cz + rc * np.cos(t), cr + rc * np.sin(t)))
    P = np.array(pts)
    th = np.linspace(0, 2 * np.pi, 361)
    return np.stack([P[None, :, 1] * np.sin(th)[:, None], -P[None, :, 1] * np.cos(th)[:, None], np.repeat(P[None, :, 0], len(th), 0)], -1)


def rot(ax, ay):
    c, s = np.cos(ax), np.sin(ax)
    Rx = np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    c, s = np.cos(ay), np.sin(ay)
    Ry = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return Ry @ Rx  # sama kuin three.js Euler(ax, ay, 0, 'YXZ')


def render(p):
    ax, ay, D, f, cx, cy, Rin = p
    Q = ring_vertices(Rin) @ rot(ax, ay).T
    zc = D - Q[..., 2]
    uv = np.stack([cx + f * Q[..., 0] / zc, cy - f * Q[..., 1] / zc], -1)
    img = np.zeros((N, N), np.uint8)
    q = (uv * 16).astype(np.int32)
    for k in range(q.shape[0] - 1):
        cv2.fillConvexPoly(img, cv2.convexHull(np.concatenate([q[k], q[k + 1]], 0)), 1, shift=4)
    return img


def loss(p):
    m = render(p)
    return 1 - np.logical_and(m, target).sum() / np.logical_or(m, target).sum()


best = None
for ax0 in (0.75, -0.75):
    for D0 in (150.0, 300.0):
        r = minimize(loss, [ax0, 0.0, D0, 36 * D0, 500.0, 520.0, 10.0], method='Nelder-Mead', options={'maxiter': 3000, 'xatol': 1e-5, 'fatol': 1e-7})
        if best is None or r.fun < best.fun:
            best = r
best = minimize(loss, best.x, method='Nelder-Mead', options={'maxiter': 4000, 'xatol': 1e-6, 'fatol': 1e-8})
ax, ay, D, f, cx, cy, Rin = best.x
res = {'iou': 1 - best.fun, 'tiltX': ax, 'tiltY': ay, 'distance': D, 'focalPx': f, 'cx': cx, 'cy': cy, 'innerRadius': Rin,
       'fovDeg': float(np.degrees(2 * np.arctan(500 / f)))}
json.dump(res, open(args.out, 'w'), indent=2)
print(json.dumps(res, indent=2))
m = render(best.x)
ov = np.zeros((N, N, 3), np.uint8)
ov[..., 0] = target * 255
ov[..., 1] = m * 255
Image.fromarray(ov).save('overlay.png')
