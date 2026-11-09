#!/usr/bin/env python3
"""Sovittaa renkaan poikkileikkauksen muodon virallisen tuotekuvan ääriviivaan.

Menetelmä (analysis-by-synthesis):
  1. Rengas on pyörähdyskappale, joten sen ääriviiva kuvassa määräytyy suoraan
     poikkileikkauksesta ja kamerasta. Ääriviiva ei riipu valaistuksesta eikä materiaalista.
  2. Poikkileikkaus parametrisoidaan:
       • ulkoreuna: kaksi tangentiaalista kaarta (iso R1 kulman phi verran, sitten pieni R2
         sivupintaan) – tavallinen CAD-pyöristys;
       • sisäreuna: sisäkuoren tasainen reunus (upotus sivupinnasta) ja 45° viiste.
     Viralliset leveys 6,09 mm ja paksuus 2,28 mm pidetään kiinteinä.
  3. Ääriviiva rasteroidaan tarkasti (poikkileikkaus jokaisessa 0,25° kulmassa + niiden
     väliset pinnat) ja verrataan kuvan alfa-kanavaan (IoU). Nelder–Mead-optimointi useasta
     lähtöpisteestä: ensin muoto kameran ollessa kiinteä, sitten muoto ja kamera yhdessä.
  4. Tuloksena parametrit ja ääriviivavirhe millimetreinä (keskiarvo, 95 %, maksimi).

Käyttö:
  python3 tools/fit_camera.py  kuva.png --out cam.json      # ensin kameran alkuarvaus
  python3 tools/fit_profile.py kuva.png cam.json --out profile.json [--res 2000]

Tulos Ouran 8000 px Silver-tuotekuvalle: R1 ≈ 2,7 mm, R2 ≈ 0,05 mm, phi ≈ 24,5°
(ulkoreunan kaarevuus ulottuu ~1,15 mm sivusta, säteittäinen pudotus ~0,29 mm),
sisäpinta päättyy ~0,2 mm sivupinnan tasosta; IoU 0,997, ääriviivavirhe keskimäärin
0,009 mm ja 95 % < 0,015 mm. Aiempi ympyräpyöristys r 0,55 mm: virhe 95 % < 0,08 mm.
Vaatii: numpy, scipy, opencv-python-headless, pillow.
"""
import argparse, json
import numpy as np, cv2
from PIL import Image
from scipy.optimize import minimize

Image.MAX_IMAGE_PIXELS = None
ap = argparse.ArgumentParser()
ap.add_argument('image')
ap.add_argument('cam')
ap.add_argument('--res', type=int, default=2000)
ap.add_argument('--out', default='profile.json')
args = ap.parse_args()

N = args.res
target = np.array(Image.open(args.image).convert('RGBA').resize((N, N), Image.LANCZOS))[..., 3] > 127
W, T = 6.09, 2.28
A = W / 2
TH = np.linspace(-np.pi, np.pi, 1441)


def corner_pts(R1, R2, phi, k1=14, k2=14):
    pts = [(0.0, 0.0)]
    for al in np.linspace(0, phi, k1)[1:]:
        pts.append((R1 * np.sin(al), -R1 * (1 - np.cos(al))))
    z0, r0 = pts[-1]
    for al in np.linspace(phi, np.pi / 2, k2)[1:]:
        pts.append((z0 + R2 * (np.sin(al) - np.sin(phi)), r0 - R2 * (np.cos(phi) - np.cos(al))))
    return np.array(pts)


def envelope(Ri, P):
    R1, R2, phi, lipRec, chamfer = P
    Ro = Ri + T
    c = corner_pts(R1, R2, phi)
    zf = A - c[-1, 0]
    lipH = 0.51  # reunuksen korkeus ei vaikuta ääriviivaan (upotettu)
    pts = [(z, Ro) for z in np.linspace(-zf, zf, 9)[::-1]]
    pts += [(zf + dz, Ro + dr) for dz, dr in c[1:]]
    pts += [(A, Ri + 1.35), (A - lipRec, Ri + lipH), (A - lipRec, Ri + chamfer), (A - lipRec - chamfer, Ri)]
    pts += [(-(A - lipRec - chamfer), Ri), (-(A - lipRec), Ri + chamfer), (-(A - lipRec), Ri + lipH), (-A, Ri + 1.35)]
    pts += [(-(zf + dz), Ro + dr) for dz, dr in c[::-1][:-1]]
    return np.array(pts)


def rot(ax, ay):
    c, s = np.cos(ax), np.sin(ax)
    Rx = np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    c, s = np.cos(ay), np.sin(ay)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]) @ Rx


def render(cam, Ri, P):
    ax, ay, D, f, cx, cy = cam
    prof = envelope(Ri, P)
    z = prof[:, 0][None, :]
    r = prof[:, 1][None, :]
    V = np.stack([r * np.sin(TH)[:, None], -r * np.cos(TH)[:, None], np.repeat(z, len(TH), 0)], -1)
    Q = V @ rot(ax, ay).T
    zc = D - Q[..., 2]
    s = N / 1000
    q = (np.stack([cx * s + f * s * Q[..., 0] / zc, cy * s - f * s * Q[..., 1] / zc], -1) * 16).astype(np.int32)
    img = np.zeros((N, N), np.uint8)
    for k in range(q.shape[0] - 1):
        cv2.fillPoly(img, [q[k]], 1, shift=4)
        for qq in np.stack([q[k], np.roll(q[k], -1, 0), np.roll(q[k + 1], -1, 0), q[k + 1]], 1):
            cv2.fillConvexPoly(img, qq, 1, shift=4)
    return img.astype(bool)


def iou(m):
    return np.logical_and(m, target).sum() / np.logical_or(m, target).sum()


LO = np.array([0.3, 0.01, np.radians(3), 0.0, 0.02])
HI = np.array([12.0, 0.8, np.radians(85), 0.8, 1.2])


def loss(x, cam_free, cam0):
    cam = x[:6] if cam_free else cam0
    Ri = x[6] if cam_free else x[0]
    P = np.asarray(x[7:] if cam_free else x[1:])
    if np.any(P < LO) or np.any(P > HI):
        return 1.0
    return 1 - iou(render(cam, Ri, P))


def contour_error(m, cam):
    pxmm = cam[3] / cam[2] * (N / 1000)
    out = []
    for a, b in ((target, m), (m, target)):
        edge = cv2.Canny(b.astype(np.uint8) * 255, 50, 150)
        dist = cv2.distanceTransform(255 - edge, cv2.DIST_L2, 5)
        cs, _ = cv2.findContours(a.astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
        out += [dist[c[:, 0, 1], c[:, 0, 0]] / pxmm for c in cs if len(c) > 200]
    e = np.concatenate(out)
    return {'mean_mm': float(e.mean()), 'p95_mm': float(np.percentile(e, 95)), 'max_mm': float(e.max())}


c0 = json.load(open(args.cam))
cam0 = np.array([c0['tiltX'], c0['tiltY'], c0['distance'], c0['focalPx'], c0['cx'], c0['cy']])
Ri0 = c0['innerRadius']
best = None
for P0 in ([3.0, 0.05, np.radians(22), 0.12, 0.08], [1.5, 0.2, np.radians(35), 0.2, 0.2], [6.0, 0.05, np.radians(15), 0.05, 0.15]):
    r = minimize(loss, np.array([Ri0] + P0), args=(False, cam0), method='Nelder-Mead',
                 options={'maxiter': 1500, 'xatol': 1e-5, 'fatol': 1e-8, 'adaptive': True})
    print('vaihe A: IoU %.5f' % (1 - r.fun), np.round(r.x, 4).tolist(), flush=True)
    if best is None or r.fun < best.fun:
        best = r
r = minimize(loss, np.concatenate([cam0, best.x]), args=(True, cam0), method='Nelder-Mead',
             options={'maxiter': 4000, 'xatol': 1e-6, 'fatol': 1e-9, 'adaptive': True})
cam, Ri, P = r.x[:6], r.x[6], r.x[7:]
c = corner_pts(*P[:3])
m = render(cam, Ri, P)
res = {
    'iou': float(iou(m)),
    'contourError': contour_error(m, cam),
    'innerRadius': float(Ri),
    'outerCorner': {'R1': float(P[0]), 'R2': float(P[1]), 'phiDeg': float(np.degrees(P[2])),
                    'axialExtent': float(c[-1, 0]), 'radialDrop': float(-c[-1, 1])},
    'innerEdge': {'lipRecess': float(P[3]), 'chamfer': float(P[4])},
    'camera': dict(zip(['tiltX', 'tiltY', 'distance', 'focalPx', 'cx', 'cy'], map(float, cam))),
}
json.dump(res, open(args.out, 'w'), indent=2)
print(json.dumps(res, indent=2))
ov = np.zeros((N, N, 3), np.uint8)
ov[..., 0] = target * 255
ov[..., 1] = m * 255
ov[..., 2] = (target & m) * 255
Image.fromarray(ov).save('profile_overlay.png')
