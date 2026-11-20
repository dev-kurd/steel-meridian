# SOWPAK v1 — packed asset file

One `.pak` holds many files (sprite sheets, their JSON, maps, audio). The game reads single files
from it on demand; nothing is ever extracted to disk.

```
offset  size  field
0       8     magic        "SOWPAK" 0x00 0x01
8       4     flags        u32 LE (bit 0 = encrypted)
12      4     indexLength  u32 LE, length of the (encrypted) index
16      12    indexIV      AES-GCM nonce for the index
28      16    indexTag     AES-GCM auth tag for the index
44      n     index        AES-256-GCM(JSON) — see below
44+n    …     data         each file encrypted on its own, one after another
```

Index (JSON, encrypted so file names are hidden too):

```json
{ "pack": "units", "created": "2026-11-17T20:45:00Z",
  "entries": { "tank-green@2x.webp": { "offset": 51234, "size": 253952, "iv": "<base64 12 B>", "tag": "<base64 16 B>", "type": "image/webp" } } }
```

- Key per pack = SHA-256("sowpak:v1:" + packName + ":" + secret). The secret lives in the app (obfuscate it in release builds).
- AES-GCM also detects tampering: a changed byte makes the read fail instead of returning bad data.
- Each file is encrypted separately, so the game decrypts only the file it reads.
- Patch packs (`patch_001.pak`, `patch_002.pak` …) are opened after the base packs; a name found in a newer pack wins.
