#!/usr/bin/env python3
"""Vertaa toteutetun 3D-mallin ääriviivaa viralliseen tuotekuvaan.

1. Renderöi malli virallisen kuvan kameralla siluettina:
     index.html?match&mask&nohq&webgl   (valkoinen siluetti mustalla taustalla)
   ja tallenna kuva (esim. 2000 × 2000 px, sama kuvasuhde kuin virallinen kuva).
2. python3 tools/compare_silhouette.py malli.png virallinen.png [overlay.png]

Tulostaa IoU:n ja ääriviivavirheen millimetreinä (molempiin suuntiin mitattu etäisyys
ääriviivojen välillä). Peittokuva: punainen = vain virallinen, vihreä = vain malli.
Toteutettu malli: IoU 0,995, keskimäärin 0,014 mm, 95 % < 0,031 mm, max 0,046 mm.
"""
import numpy as np, cv2, sys
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
model = np.array(Image.open(sys.argv[1]).convert('L'))
N = model.shape[0]
ref = np.array(Image.open(sys.argv[2]).convert('RGBA').resize((N, N), Image.LANCZOS))[..., 3] > 127
m = model > 127
pxmm = 6543.19 / 174.31 * (N / 1000)  # sovitetun kameran mittakaava renkaan keskellä
iou = np.logical_and(m, ref).sum() / np.logical_or(m, ref).sum()
def err(a, b):
    edge = cv2.Canny(b.astype(np.uint8) * 255, 50, 150)
    dist = cv2.distanceTransform(255 - edge, cv2.DIST_L2, 5)
    cs, _ = cv2.findContours(a.astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    return np.concatenate([dist[c[:, 0, 1], c[:, 0, 0]] / pxmm for c in cs if len(c) > 200])
e = np.concatenate([err(ref, m), err(m, ref)])
print('IoU %.5f   contour error: mean %.4f mm, p95 %.4f mm, max %.4f mm' % (iou, e.mean(), np.percentile(e, 95), e.max()))
ov = np.zeros((N, N, 3), np.uint8); ov[..., 0] = ref * 255; ov[..., 1] = m * 255; ov[..., 2] = (ref & m) * 255
Image.fromarray(ov).save(sys.argv[3] if len(sys.argv) > 3 else 'mask_overlay.png')
