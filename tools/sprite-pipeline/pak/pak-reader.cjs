/* SOWPAK reader — opens .pak files, keeps only their index in memory, and reads + decrypts
 * single files on demand. Nothing is extracted to disk. Used by the Electron main process
 * (and by the tests). Format: see pak-format.md.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAGIC = Buffer.from([0x53, 0x4f, 0x57, 0x50, 0x41, 0x4b, 0x00, 0x01]); // "SOWPAK" v1
const HEADER = 44;

const packKey = (packName, secret) => crypto.createHash('sha256').update(`sowpak:v1:${packName}:${secret}`).digest();

function decrypt(key, iv, tag, data) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]); // throws if the bytes were changed
}

class PakLibrary {
  constructor(secret) { this.secret = secret; this.packs = []; this.lookup = new Map(); }

  // open a pack: read the header + index only (a few KB), keep the file handle open
  open(file) {
    const fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(HEADER);
    fs.readSync(fd, head, 0, HEADER, 0);
    if (!head.subarray(0, 8).equals(MAGIC)) throw new Error(`${file}: not a SOWPAK v1 file`);
    const flags = head.readUInt32LE(8), indexLength = head.readUInt32LE(12);
    const packName = path.basename(file, '.pak');
    const key = packKey(packName, this.secret);
    const raw = Buffer.alloc(indexLength);
    fs.readSync(fd, raw, 0, indexLength, HEADER);
    const json = flags & 1 ? decrypt(key, head.subarray(16, 28), head.subarray(28, 44), raw) : raw;
    const index = JSON.parse(json.toString('utf8'));
    const pack = { name: packName, file, fd, key, encrypted: !!(flags & 1), entries: index.entries };
    this.packs.push(pack);
    // later packs win: patch_001.pak opened after units.pak overrides the same names
    for (const name of Object.keys(index.entries)) this.lookup.set(name, pack);
    return pack;
  }

  // open every .pak in a folder: base packs first (alphabetical), then patch_*.pak in order
  openFolder(dir) {
    const all = fs.readdirSync(dir).filter((f) => f.endsWith('.pak')).sort();
    const base = all.filter((f) => !f.startsWith('patch_')), patches = all.filter((f) => f.startsWith('patch_'));
    for (const f of [...base, ...patches]) this.open(path.join(dir, f));
    return this;
  }

  has(name) { return this.lookup.has(name); }

  // read one file: seek to its bytes, read only those, decrypt in memory
  read(name) {
    const pack = this.lookup.get(name);
    if (!pack) return null;
    const e = pack.entries[name], buf = Buffer.alloc(e.size);
    fs.readSync(pack.fd, buf, 0, e.size, e.offset);
    const data = pack.encrypted ? decrypt(pack.key, Buffer.from(e.iv, 'base64'), Buffer.from(e.tag, 'base64'), buf) : buf;
    return { data, type: e.type, pack: pack.name };
  }

  list() { return [...this.lookup.keys()].sort(); }
  close() { for (const p of this.packs) fs.closeSync(p.fd); this.packs = []; this.lookup.clear(); }
}

module.exports = { PakLibrary, packKey, MAGIC, HEADER };
