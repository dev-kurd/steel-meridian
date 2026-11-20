# Mockup tools (tanks)

The scripts that made the pictures on the round 1 design canvas ("Tanks in 3D — Mockup Round 1"). Kept for round 2
(Artillery, Anti-Air, Flamer, Special).

| File | What it does |
|---|---|
| `mock.py` | Renders the mockup pictures with the real model (`../tank_lib.py`). One job per board: `family`, `pairs`, `size`, `dirs`, `damage`, `damage2`, `mask`, `tracks`, `close`, `turn`, `maskcheck`, `check`. Usage is at the top of the file. |
| `mock2.py` | Round 2 renders (Artillery, Anti-Air, Flamer, Special): jobs `check`, `family`, `single`, `dirs`, `damage`, `layers`, `teams`, `panzer`; a weapon name after the job limits it. Output in `out2/` (not in git). The board pictures were composed from these in the session, on the canvas "Tanks mockup round 2". |
| `compose.py` | Puts a transparent render on the ground colour; recolours with the team mask in linear light. |
| `prep2.py` | Turns the renders into the board pictures (crops, @2x / @1x copies, team colours). Written for round 1's file names: adapt it. |
| `vector-ref/` | `vec_render.py` renders the approved vector tank at the 3D camera's scale (needs Node.js and `rsvg-convert`); `vu.js` is the vector engine cut from the tanks viewer page. Used for the "vector vs 3D" board. |

Notes:
- `mock.py` renders at mockup quality (24-48 samples). On the cloud workspace's CPU a full set took about 18 minutes; set `SOW_GPU=1` on the PC.
- The `mask` and `maskcheck` jobs use the old mask brightness (1.0). The bake uses 0.2 (`MASK_GAIN` in `../bake_tanks.py`).
- The boards themselves are on the canvas: https://claude.ai/artifact/GpQbtjn6pd3wkKC951E7Xg
