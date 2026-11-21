#!/usr/bin/env python3
"""The pictures in ../README.md that are rebuilt from the packed sheets (the way the game draws a walker).
usage: doc_images.py <sheets dir> <images dir>
Writes walk-cycle.jpg (Kodiak, direction 2, every walk frame), check-directions.jpg (five walkers, eight directions, one team
colour per row) and check-states.jpg (five walkers: intact, damaged, burning, wreck)."""
import sys, os, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compose as C
SHEETS, OUT = sys.argv[1], sys.argv[2]
pack = C.Pack(SHEETS); man = json.load(open(os.path.join(SHEETS, 'walkers.json')))
KINDS = man['kinds']; WALK = man['walk']['frames']; TEAMS = ['green', 'blue', 'red', 'orange', 'purple']

def grid(res, cols, rows, cell):
    """cell(canvas, col, row, pos) draws one walker; returns the whole picture."""
    r = man['resolutions'][res]; F = r['frame']; ax, ay = r['anchor']
    canvas = C.ground(cols * F, rows * F)
    for j in range(rows):
        for i in range(cols): cell(canvas, i, j, (i * F + ax, j * F + ay))
    return canvas

half = (WALK + 1) // 2
C.save(grid('4x', half, 2, lambda cv, i, j, p: pack.walker(cv, '4x', 'kodiak', p, 2, pose=str(j * half + i), team='green')
            if j * half + i < WALK else None), os.path.join(OUT, 'walk-cycle.jpg'), 88)
C.save(grid('2x', 8, len(KINDS), lambda cv, i, j, p: pack.walker(cv, '2x', KINDS[j], p, i * 4 + 2, team=TEAMS[j % len(TEAMS)])),
       os.path.join(OUT, 'check-directions.jpg'), 90)
def state(cv, i, j, p):
    if i < 3: pack.walker(cv, '4x', KINDS[j], p, 4, state=i, team=TEAMS[j % len(TEAMS)])
    else: pack.draw(cv, '4x', 'wreck/%s/d04' % KINDS[j], p)
C.save(grid('4x', 4, len(KINDS), state), os.path.join(OUT, 'check-states.jpg'), 86)
print('wrote walk-cycle.jpg, check-directions.jpg, check-states.jpg ->', OUT)
