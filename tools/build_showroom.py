# The lighting of Oura's official Deep Rose product picture, as an environment map.
#
# Every pixel of a convex polished surface mirrors one direction of the studio. With the model
# rendered from the same camera (debug pass: mirror direction per pixel), each pixel gives
#   light(direction) = inverse tone map(pixel) / Fresnel reflectance
# Samples are gathered on a lat-long grid at three resolutions (fine where there is plenty of
# data, coarser where there is little), gaps are filled from their neighbours, and the map is
# stored like the scenery skies: 8-bit JPEG × 2^(gain × stops).
#   frame: y up, z toward the camera (which is horizontal in the official picture)
#   image: column = azimuth −180…180 (centre = toward the camera), top row = straight up
import numpy as np, glob, json, sys, cv2
from PIL import Image
from scipy.ndimage import binary_erosion, gaussian_filter
Image.MAX_IMAGE_PIXELS = None
# (inputs: the official picture and the model's debug passes from the same camera, kept outside the repository)
SC = '/tmp/claude-0/-home-user-Oura/804fc7b3-8a0c-5bad-a7f1-e1efcf024045/scratchpad/'
OUT = sys.argv[1] if len(sys.argv) > 1 else SC + 's12/'
N = 2000
refl = np.frombuffer(open(SC + 's2/dbg43_refl.raw', 'rb').read(), np.uint8).reshape(N, N, 4)
idm = np.frombuffer(open(SC + 's2/dbg43_id.raw', 'rb').read(), np.uint8).reshape(N, N, 4)
inw = np.frombuffer(open(SC + 's2/dbg43_inward.raw', 'rb').read(), np.uint8).reshape(N, N, 4)[..., 0] / 255.0
R = refl[..., :3].astype(float) / 255 * 2 - 1; R /= np.linalg.norm(R, axis=2, keepdims=True) + 1e-9
convex = inw < 0.62
outer = binary_erosion((idm[..., 0] > 200) & (idm[..., 1] < 60) & (idm[..., 2] < 60) & convex, iterations=3)
tita = binary_erosion((idm[..., 1] > 200) & (idm[..., 0] < 60) & (idm[..., 2] < 60) & convex, iterations=4)
f, cx, cy = 6543.19, 499.6772, 540.3558
ys, xs = np.mgrid[0:N, 0:N]; X = (xs + 0.5) / 2; Y = (ys + 0.5) / 2
ray = np.stack([(X - cx) / f, -(Y - cy) / f, -np.ones_like(X)], -1); ray /= np.linalg.norm(ray, axis=2, keepdims=True)
cosT = np.sqrt(np.clip((1 + (R * -ray).sum(2)) / 2, 0, 1))
def neutral(v):
    v = np.asarray(v, float); off = np.where(v < 0.08, v - 6.25 * v * v, 0.04); c = v - off; sc = 0.76; d = 1 - sc
    return np.where(c < sc, c, 1 - d * d / (c + d - sc))
grid = np.linspace(0, 60, 200001); tmv = neutral(grid)
inv = lambda y: np.interp(y, tmv, grid)
lin = lambda c: np.where(c / 255 <= 0.04045, c / 255 / 12.92, ((c / 255 + 0.055) / 1.055) ** 2.4)
def load(p):
    im = Image.open(p).convert('RGBA'); bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im)
    return np.array(bg.convert('RGB').resize((N, N), Image.LANCZOS)).astype(float)
rose = load(sorted(glob.glob(SC + 'research/img/lineItem__or5-deep-rose__*.img'))[-1])
F = lambda F0: F0 + (1 - F0) * (1 - cosT) ** 5
# Outer surface. The red channel carries the most signal for this finish (F0 0.625, 0.37, 0.27)
# and is used as it is in the dim and middle range. Highlights in the picture are whiter than
# the finish's own colour, so there green and blue read 15–25 % more light than red does; in
# the bright range the map takes the mean of the three, which puts the highlights at the
# brightness they have in the picture.
okO = outer & (rose.max(2) < 251)
F0 = (0.625, 0.37, 0.27)
L3 = np.stack([inv(lin(rose[..., c])) / F(F0[c]) for c in range(3)], -1)
t = np.clip((L3[..., 0] - 0.7) / 0.4, 0, 1); t = t * t * (3 - 2 * t)
LO = L3[..., 0] + t * (L3.mean(-1) - L3[..., 0])
okT = tita & (rose.max(2) < 251)
LT = inv(lin(rose).mean(2)) / F(0.6)
print('samples: outer %d, titanium %d' % (okO.sum(), okT.sum()))
def binned(dirs, L, NA, NE, need):
    el = np.arcsin(np.clip(dirs[:, 1], -1, 1)); az = np.arctan2(dirs[:, 0], dirs[:, 2])
    ie = np.clip(((np.pi / 2 - el) / np.pi * NE).astype(int), 0, NE - 1)       # row 0 = up
    ia = np.clip(((az + np.pi) / (2 * np.pi) * NA).astype(int), 0, NA - 1)
    cell = ie * NA + ia; order = np.argsort(cell); cs = cell[order]; Ls = L[order]
    out = np.full(NA * NE, np.nan); starts = np.searchsorted(cs, np.arange(NA * NE)); ends = np.searchsorted(cs, np.arange(NA * NE), side='right')
    for c in range(NA * NE):
        if ends[c] - starts[c] >= need: out[c] = np.median(Ls[starts[c]:ends[c]])
    return out.reshape(NE, NA)
up = lambda a, k: np.repeat(np.repeat(a, k, axis=0), k, axis=1)
# the coloured outer surface is what the map has to reproduce: it decides wherever it has data;
# titanium only fills directions the outer surface never mirrors
env = binned(R[okO], LO[okO], 96, 48, 50)
for layer in (up(binned(R[okO], LO[okO], 48, 24, 40), 2), up(binned(R[okO], LO[okO], 24, 12, 40), 4), binned(R[okT], LT[okT], 96, 48, 50), up(binned(R[okT], LT[okT], 48, 24, 40), 2)):
    m = ~np.isfinite(env); env[m] = layer[m]
known = np.isfinite(env)
print('cells with data: %.0f%%' % (100 * known.mean()))
# gaps: spread from the neighbours (azimuth wraps)
fill = np.where(known, env, 0.0); w = known.astype(float)
for it in range(400):
    pf = np.pad(fill, ((1, 1), (0, 0)), mode='edge'); pw = np.pad(w, ((1, 1), (0, 0)), mode='edge')
    s = np.roll(pf, 1, 1) + np.roll(pf, -1, 1); sw = np.roll(pw, 1, 1) + np.roll(pw, -1, 1)
    num = s[1:-1] + pf[:-2] + pf[2:]; den = sw[1:-1] + pw[:-2] + pw[2:]
    new = np.where(den > 0, num / np.maximum(den, 1e-9), 0)
    upd = ~known & (den > 0)
    fill = np.where(known, env, np.where(upd, new, fill)); w = np.where(known, 1.0, np.where(upd, 1.0, w))
env = fill
# poles: one value around the pole; then a light blur (the picture cannot resolve finer than this anyway)
env[0] = env[0].mean(); env[-1] = env[-1].mean()
env = gaussian_filter(np.concatenate([env[:, -8:], env, env[:, :8]], axis=1), sigma=(0.7, 0.9), mode='nearest')[:, 8:-8]
np.save(OUT + 'showroom_96x48.npy', env)
print('rows: elevation (top first), cols: azimuth -180..165 step 15; x100')
for j in range(0, 48, 4):
    print('%+5.0f | ' % (90 - (j + 2) * 3.75) + ' '.join('%3d' % round(100 * env[j:j + 4, i:i + 4].mean()) for i in range(0, 96, 4)))
# to 512 x 256, cubic, wrapping in azimuth
big = cv2.resize(np.concatenate([env[:, -6:], env, env[:, :6]], axis=1).astype(np.float32), ((96 + 12) * 512 // 96, 256), interpolation=cv2.INTER_CUBIC)
pad = 6 * 512 // 96; big = np.clip(big[:, pad:pad + 512], 0.004, None)
# The very brightest strip (the softbox behind, seen in the rim of the band) is eased down: in
# the picture it is a clean white line, but at full strength the viewer's bloom turns it into a
# halo around the ring.
big = np.where(big > 1.6, 1.6 + (big - 1.6) * 0.4, big)
print('map: min %.3f max %.3f mean %.3f' % (big.min(), big.max(), big.mean()))
# JPEG × 2^(gain × stops), as for the skies
h, w_ = big.shape; gh, gw = 64, 128
cell = big.reshape(gh, h // gh, gw, w_ // gw).max(axis=(1, 3))
cell = cv2.dilate(np.concatenate([cell[:, -4:], cell, cell[:, :4]], axis=1), np.ones((3, 3), np.uint8)); cell = cv2.GaussianBlur(cell, (0, 0), 1.2); cell = cv2.dilate(cell, np.ones((3, 3), np.uint8))[:, 4:-4]
M = np.maximum(1.0, cell); stops = 2.0  # fixed: src/scenery.js decodes with the same number
g8 = np.clip(np.ceil(np.log2(M) / stops * 255), 0, 255).astype(np.uint8)
Mup = cv2.resize(np.power(2.0, g8.astype(np.float32) / 255 * stops), (w_, h), interpolation=cv2.INTER_LINEAR)
srgb = lambda x: np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.maximum(x, 1e-9), 1 / 2.4) - 0.055)
base = np.clip(big / Mup, 0, 1)
Image.fromarray((srgb(base) * 255 + 0.5).astype(np.uint8)).convert('RGB').save(OUT + 'showroom.jpg', quality=92, subsampling=0, optimize=True)
Image.fromarray(g8).save(OUT + 'showroom_gain.png', optimize=True)
b = np.asarray(Image.open(OUT + 'showroom.jpg').convert('L')).astype(np.float32) / 255
rec = np.where(b <= 0.04045, b / 12.92, np.power((b + 0.055) / 1.055, 2.4)) * Mup
print('stops %.1f; stored map error %.1f%% (mean abs / mean)' % (stops, 100 * np.abs(rec - big).mean() / big.mean()))
v = big / (1 + big); Image.fromarray((np.clip(v, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).resize((768, 384)).save(OUT + 'showroom_preview.png')
