#!/usr/bin/env python3
"""Puts Kayama-jima's shore where the photograph has it.

The bake (bake-kayama.py) let the 10 m elevation model and its own clean-up push the land out over the
pale shallows off the beach: ground that shows as turquoise water in the photograph stood above the sea,
so the drone and the residents met land where the eye saw sea. This reads the baked photographs back,
takes as sea everything turquoise that is joined to the open water, and lowers the ground there to a
shallow, gently shelving floor (the beach itself, and the island inside it, are left as they were).
Usage: python3 scripts/fix-coast.py   (after bake-kayama.py)
"""
import numpy as np
from PIL import Image
from scipy import ndimage as nd

OUT = 'public/land'
for SUF, HALF in [('', 300), ('_far', 760)]:
    Hp = np.asarray(Image.open(f'{OUT}/kayama{SUF}_h.png').convert('RGB')).astype(np.int64)
    h = (Hp[..., 0] * 256 + Hp[..., 1] - 32768) / 100.0
    N = h.shape[0]; st = 2 * HALF / N
    ph = Image.open(f'{OUT}/kayama{SUF}.jpg').convert('RGB').resize((N, N), Image.BOX)
    P = nd.gaussian_filter(np.asarray(ph).astype(np.float32) / 255, (1, 1, 0))
    r, g, b = P[..., 0], P[..., 1], P[..., 2]
    rr = np.maximum(r, 0.02)
    lum = 0.3 * r + 0.55 * g + 0.15 * b
    # the beach: bright, almost colourless sand; it is the shore wherever there is one
    sand = (lum > 0.62) & (b / rr < 1.04) & (np.max(P, -1) - np.min(P, -1) < 0.2)
    # the sea, grown out from where it is certainly sea (clear turquoise) across anything low that is not sand
    # and is at least as blue as it is red: the pale shallows off the beach, however green they look
    sure = (b / rr > 1.25) & (g / rr > 1.3)
    # (where it is plainly water-coloured, even over ground the 10 m elevation model raised a metre or two)
    # (and only along the shore: within 20 m of where the bake had it, so bushes behind the beach stay land)
    din0 = nd.distance_transform_edt(h > 0) * st
    # (the palest shallows over white sand look as green as a bush, but far brighter)
    grow = ((b / rr > 1.0) & (h < 0.9) | (b / rr > 1.1) & (h < 2.6) | (b / rr > 0.97) & (lum > 0.62) & (g / rr > 1.3) & (h < 2.6)) & ~nd.binary_dilation(sand, iterations=2) & (din0 < 20)
    sea = nd.binary_propagation(sure & grow, mask=grow)
    wrong = sea & (h > -0.05)
    land = (h > 0) & ~wrong
    dout = nd.distance_transform_edt(~land) * st            # metres out from the (corrected) shore
    floor = -(0.12 + dout * 0.035)
    h2 = np.where(wrong, np.minimum(h, floor), h)
    h2 = np.where(wrong | nd.binary_dilation(wrong, iterations=2), nd.gaussian_filter(h2, 0.8), h2)
    h2 = np.where(land & ~wrong, np.maximum(h2, 0.05), h2)  # (the beach stays above the water)
    hc = np.clip(np.round(h2 * 100) + 32768, 0, 65535).astype(np.int64)
    Hp2 = np.stack([(hc >> 8), (hc & 255), Hp[..., 2]], -1).astype(np.uint8)
    Image.fromarray(Hp2).save(f'{OUT}/kayama{SUF}_h.png', optimize=True)
    C = np.asarray(Image.open(f'{OUT}/kayama{SUF}_c.png').convert('RGB')).copy()
    C[wrong] = 0                                             # no sand, trees or rock under the water
    Image.fromarray(C).save(f'{OUT}/kayama{SUF}_c.png', optimize=True)
    print(SUF or 'near', 'lowered %d cells (%.0f m2)' % (wrong.sum(), wrong.sum() * st * st))
