#!/usr/bin/env python3
"""Projisoi mallin profiilin reunaviivat viralliseen kuvaan (kameran sovituksen jälkeen).

Käyttö:
  python3 tools/overlay_profile.py <kuva.png> cam.json [--crop x0,y0,x1,y1] [--out overlay_profile.png]

Viivat (sivupinnalla, +Z-puoli): punainen = ulkopinnan reuna, oranssi = pyöristyksen loppu /
PVD-raja, vihreä = reunalinja, sininen = ura, violetti = viisteen yläreuna, magenta = sisäpinnan reuna.
Mitat luetaan src/config.js-tiedostoa vastaavista oletusarvoista.
"""
import argparse, json
import numpy as np, cv2
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ap = argparse.ArgumentParser()
ap.add_argument('image')
ap.add_argument('cam')
ap.add_argument('--crop', default='0,0,1000,1000')
ap.add_argument('--out', default='overlay_profile.png')
a = ap.parse_args()
c = json.load(open(a.cam))
S = 4
im = Image.open(a.image).convert('RGBA')
bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
bg.alpha_composite(im)
img = np.array(bg.convert('RGB').resize((1000 * S, 1000 * S), Image.LANCZOS))

W, T, Rin = 6.09, 2.28, c['innerRadius']
A, Ro = W / 2, Rin + T
fil, land, cove, gap, coveRec, lipRec, lipCh = 0.55, 0.38, 0.68, 0.16, 0.2, 0.24, 0.36
rF = Ro - fil; rC = rF - land; rCB = rC - cove; rLT = rCB - gap
cx_, sx = np.cos(c['tiltX']), np.sin(c['tiltX'])
cy_, sy = np.cos(c['tiltY']), np.sin(c['tiltY'])
M = np.array([[cy_, 0, sy], [0, 1, 0], [-sy, 0, cy_]]) @ np.array([[1, 0, 0], [0, cx_, -sx], [0, sx, cx_]])
th = np.linspace(-np.pi, np.pi, 1440)
for z, r, col in [(A - fil, Ro, (255, 0, 0)), (A, rF, (255, 140, 0)), (A, rC, (0, 180, 0)), (A - coveRec, rCB, (0, 120, 255)),
                  (A - lipRec, rLT, (160, 0, 255)), (A - lipRec - lipCh, Rin, (255, 0, 200))]:
    Q = np.stack([r * np.sin(th), -r * np.cos(th), np.full_like(th, z)], -1) @ M.T
    zc = c['distance'] - Q[:, 2]
    p = np.stack([c['cx'] * S + c['focalPx'] * S * Q[:, 0] / zc, c['cy'] * S - c['focalPx'] * S * Q[:, 1] / zc], -1)
    cv2.polylines(img, [(p * 16).astype(np.int32)], True, col, 2, lineType=cv2.LINE_AA, shift=4)
x0, y0, x1, y1 = [int(v) * S for v in a.crop.split(',')]
Image.fromarray(img[y0:y1, x0:x1]).save(a.out)
print('saved', a.out)
