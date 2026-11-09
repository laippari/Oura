#!/usr/bin/env python3
"""Sovittaa renkaan poikkileikkauksen virallisiin tuotekuviin (kaksi näkymää).

Rakenne (Ouran purkukuva, aksiaaliset tuotekuvat): värillinen kuori – rako – ohut värillinen
lukitusrengas – sauma – pyöreäreunainen titaaninen sisäosa – reiän pinta.

Menetelmä:
  1. Säteittäiset rajat mitataan akselin suuntaisesta kuvasta (tools/axial_features.py):
     kuoren värillinen kaari päättyy 0.515 mm syvyydelle, lukitusrengas 0.61–1.11 mm
     (tasainen osa 0.695–1.065), titaanisen sisäosan korkeus reiän pinnasta 1.09 mm.
     Nämä pidetään kiinteinä.
  2. Muoto sovitetaan 43°-tuotekuvan ääriviivaan (rengas on pyörähdyskappale, joten ääriviiva
     riippuu vain poikkileikkauksesta ja kamerasta, ei valaistuksesta):
       • kuoren reuna: normaalin kääntymiskulma theta(u) = Phi · u^(ramp+1) kaarenpituuden
         suhteen – kaarevuus kasvaa tasaisesti (G2-liitos ulkopintaan); Phi > 90° tarkoittaa,
         että reuna kaartuu levein kohdan ohi takaisin (täysin pyöreä reuna);
       • titaaninen sisäosa: superellipsin neljännes sivupinnan tasosta reiän pintaan
         (syvyys d, eksponentti n).
     Kamera (6), sisäsäde, ramp, Phi, d ja n sovitetaan Nelder–Mead-menetelmällä (IoU).
  3. Raportoidaan IoU, ääriviivavirhe millimetreinä ja tarkistuksena lukitusrenkaan tasaisen
     vyön reunojen paikat 43°-kuvan ylä- ja alaosassa (havaittu vs. ennustettu, px).

Käyttö:
  python3 tools/fit_camera.py  kuva.png --out cam.json
  python3 tools/fit_profile.py kuva.png cam.json --out profile.json [--phi 100,130,160]
Vaatii: numpy, scipy, opencv-python-headless, pillow.
"""
import argparse, json
import numpy as np, cv2
from PIL import Image
from scipy.optimize import minimize
from scipy.integrate import cumulative_trapezoid

Image.MAX_IMAGE_PIXELS = None
ap = argparse.ArgumentParser()
ap.add_argument('image')
ap.add_argument('cam')
ap.add_argument('--out', default='profile.json')
ap.add_argument('--phi', default='100,130,160', help='kuoren reunan kääntymiskulman alkuarvot (astetta)')
args = ap.parse_args()

W, T = 6.09, 2.28
A = W / 2
HR = 0.515                                     # kuoren kaaren säteittäinen syvyys (aksiaalikuva)
LR_OUT, LR_FLAT_O, LR_FLAT_I = 0.61, 0.695, 1.065
HF = 1.09                                      # titaanisen sisäosan korkeus reiän pinnasta
# lukitusrenkaan tasaisen vyön reunat 43°-kuvassa (Ouran 8000 px Silver, sarake x = 500, 1000 px asteikko)
OBS = {('bot', LR_FLAT_O): 899.6, ('bot', LR_FLAT_I): 890.9, ('top', LR_FLAT_O): 307.2, ('top', LR_FLAT_I): 316.6}

_src = Image.open(args.image).convert('RGBA')
_tg = {}


def set_res(n):
    global N, target, TH
    N = n
    if n not in _tg:
        _tg[n] = np.array(_src.resize((n, n), Image.LANCZOS))[..., 3] > 127
    target = _tg[n]
    TH = np.linspace(-np.pi, np.pi, 1441 if n >= 1500 else 541)


def edge_curve(ramp, Phi, k=34):
    u = np.linspace(0, 1, 3000)
    th = Phi * u ** (ramp + 1)
    z = cumulative_trapezoid(np.cos(th), u, initial=0)
    d = cumulative_trapezoid(np.sin(th), u, initial=0)
    S = HR / d[-1]
    idx = np.linspace(0, len(u) - 1, k).astype(int)
    return np.stack([z[idx] * S, -d[idx] * S], 1), S


def envelope(Ri, P):
    ramp, Phi, d, n = P
    Ro = Ri + T
    c, _ = edge_curve(ramp, Phi)
    zf = A - c[:, 0].max()
    pts = [(z, Ro) for z in np.linspace(-zf, zf, 7)[::-1]]
    pts += [(zf + dz, Ro + dr) for dz, dr in c[1:]]
    pts += [(A - 0.085, Ro - LR_OUT), (A - 0.025, Ro - LR_OUT - 0.025), (A, Ro - LR_FLAT_O), (A, Ro - LR_FLAT_I), (A - 0.02, Ri + HF)]
    t = np.linspace(0, np.pi / 2, 16)
    fl = np.stack([(A - d) + (d - 0.02) * np.cos(t) ** (2 / n), HF - HF * np.sin(t) ** (2 / n)], 1)
    pts += [(z, Ri + r) for z, r in fl]
    right = np.array(pts)
    left = right[::-1].copy()
    left[:, 0] *= -1
    return np.concatenate([right, left[1:-1]])


def rot(ax, ay):
    c, s = np.cos(ax), np.sin(ax)
    Rx = np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    c, s = np.cos(ay), np.sin(ay)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]) @ Rx


def project(cam, P3):
    ax, ay, D, f, cx, cy = cam
    Q = P3 @ rot(ax, ay).T
    zc = D - Q[..., 2]
    return cx + f * Q[..., 0] / zc, cy - f * Q[..., 1] / zc


def render(cam, prof):
    z = prof[:, 0][None, :]
    r = prof[:, 1][None, :]
    V = np.stack([r * np.sin(TH)[:, None], -r * np.cos(TH)[:, None], np.repeat(z, len(TH), 0)], -1)
    u, v = project(cam, V)
    s = N / 1000
    q = (np.stack([u * s, v * s], -1) * 16).astype(np.int32)
    img = np.zeros((N, N), np.uint8)
    for k in range(q.shape[0] - 1):
        cv2.fillPoly(img, [q[k]], 1, shift=4)
        for qq in np.stack([q[k], np.roll(q[k], -1, 0), np.roll(q[k + 1], -1, 0), q[k + 1]], 1):
            cv2.fillConvexPoly(img, qq, 1, shift=4)
    return img.astype(bool)


def iou(m):
    return np.logical_and(m, target).sum() / np.logical_or(m, target).sum()


LO = np.array([0.0, np.radians(90), 0.05, 1.0])
HI = np.array([6.0, np.radians(175), 0.8, 6.0])


def loss(x):
    if np.any(x[7:] < LO) or np.any(x[7:] > HI):
        return 1.0
    return 1 - iou(render(x[:6], envelope(x[6], x[7:])))


def contour_error(m, cam):
    pxmm = cam[3] / cam[2] * (N / 1000)
    out = []
    for a_, b_ in ((target, m), (m, target)):
        edge = cv2.Canny(b_.astype(np.uint8) * 255, 50, 150)
        dist = cv2.distanceTransform(255 - edge, cv2.DIST_L2, 5)
        cs, _ = cv2.findContours(a_.astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
        out += [dist[c[:, 0, 1], c[:, 0, 0]] / pxmm for c in cs if len(c) > 200]
    e = np.concatenate(out)
    return {'mean_mm': float(e.mean()), 'p95_mm': float(np.percentile(e, 95)), 'max_mm': float(e.max())}


c0 = json.load(open(args.cam))
cam0 = [c0['tiltX'], c0['tiltY'], c0['distance'], c0['focalPx'], c0['cx'], c0['cy']] if 'tiltX' in c0 else c0['cam']
Ri0 = c0.get('innerRadius', c0.get('Ri', 10.9))
set_res(1000)
best = None
for phi0 in [float(v) for v in args.phi.split(',')]:
    x0 = np.array(list(cam0) + [Ri0, 1.5, np.radians(phi0), 0.2, 2.0])
    r = minimize(loss, x0, method='Nelder-Mead', options={'maxiter': 1600, 'xatol': 1e-6, 'fatol': 1e-9, 'adaptive': True})
    print('alku %.0f°: IoU %.5f' % (phi0, 1 - r.fun), flush=True)
    if best is None or r.fun < best.fun:
        best = r
set_res(2000)
r = minimize(loss, best.x, method='Nelder-Mead', options={'maxiter': 500, 'xatol': 1e-7, 'fatol': 1e-10, 'adaptive': True})
x = r.x
cam, Ri, P = x[:6], x[6], x[7:]
m = render(cam, envelope(Ri, P))
c, S = edge_curve(P[0], P[1])
imax = int(np.argmax(c[:, 0]))
Ro = Ri + T
res = []
for (side, depth), yobs in OBS.items():
    P3 = np.array([0, -(Ro - depth), A]) if side == 'bot' else np.array([0, Ro - depth, A])
    res.append(float(project(cam, P3)[1] - yobs))
out = {
    'iou': float(iou(m)),
    'contourError': contour_error(m, cam),
    'innerRadius': float(Ri),
    'shellEdge': {'ramp': float(P[0]), 'endAngleDeg': float(np.degrees(P[1])), 'drop': HR,
                  'depthAtMaxWidth': float(-c[imax, 1]), 'axialExtentToMaxWidth': float(c[imax, 0]),
                  'endRadius': float(S / ((P[0] + 1) * P[1]))},
    'innerEdge': {'depth': float(P[2]), 'exponent': float(P[3]), 'height': HF},
    'lockingRingBandResidualPx': res,
    'camera': dict(zip(['tiltX', 'tiltY', 'distance', 'focalPx', 'cx', 'cy'], map(float, cam))),
}
json.dump(out, open(args.out, 'w'), indent=2)
print(json.dumps(out, indent=2))
