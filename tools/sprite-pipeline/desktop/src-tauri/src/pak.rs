//! SOWPAK v1 reader (format: pak/pak-format.md). Opens .pak files, keeps only their index in memory,
//! and reads + decrypts single files on demand. Nothing is ever extracted to disk.

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::Mutex;

const MAGIC: &[u8; 8] = b"SOWPAK\x00\x01";
const HEADER: usize = 44;

type Error = Box<dyn std::error::Error + Send + Sync>;

#[derive(Deserialize)]
struct Entry {
    offset: u64,
    size: usize,
    iv: String,
    tag: String,
    #[serde(rename = "type")]
    mime: String,
}

#[derive(Deserialize)]
struct Index {
    entries: HashMap<String, Entry>,
}

struct Pack {
    name: String,
    file: Mutex<File>,
    cipher: Aes256Gcm,
    encrypted: bool,
    entries: HashMap<String, Entry>,
}

pub struct PakLibrary {
    secret: String,
    packs: Vec<Pack>,
    lookup: HashMap<String, usize>, // file name → pack; later packs (patches) win
}

/// key per pack = SHA-256("sowpak:v1:" + pack name + ":" + secret)
fn pack_key(pack: &str, secret: &str) -> [u8; 32] {
    Sha256::digest(format!("sowpak:v1:{pack}:{secret}").as_bytes()).into()
}

/// AES-256-GCM: fails if the key is wrong or a single byte was changed
fn decrypt(cipher: &Aes256Gcm, iv: &[u8], tag: &[u8], data: &[u8]) -> Result<Vec<u8>, Error> {
    let mut sealed = Vec::with_capacity(data.len() + tag.len());
    sealed.extend_from_slice(data);
    sealed.extend_from_slice(tag); // the aes-gcm crate expects ciphertext followed by the tag
    cipher
        .decrypt(Nonce::from_slice(iv), sealed.as_ref())
        .map_err(|_| "decryption failed: wrong key or a changed file".into())
}

impl PakLibrary {
    pub fn new(secret: &str) -> Self {
        Self { secret: secret.to_string(), packs: Vec::new(), lookup: HashMap::new() }
    }

    /// open every .pak in a folder: base packs first (alphabetical), then patch_*.pak in order
    pub fn open_folder(dir: &Path, secret: &str) -> Result<Self, Error> {
        let mut lib = Self::new(secret);
        let mut files: Vec<_> = std::fs::read_dir(dir)
            .map_err(|e| format!("cannot open asset folder {}: {e}", dir.display()))?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().map_or(false, |x| x == "pak"))
            .collect();
        files.sort_by_key(|p| {
            let n = p.file_name().unwrap_or_default().to_string_lossy().to_string();
            (n.starts_with("patch_"), n)
        });
        for f in files {
            lib.open(&f)?;
        }
        Ok(lib)
    }

    /// read the header + index only (a few KB); keep the file handle open for later reads
    pub fn open(&mut self, path: &Path) -> Result<(), Error> {
        let mut file = File::open(path)?;
        let mut head = [0u8; HEADER];
        file.read_exact(&mut head)?;
        if &head[..8] != MAGIC {
            return Err(format!("{}: not a SOWPAK v1 file", path.display()).into());
        }
        let flags = u32::from_le_bytes(head[8..12].try_into()?);
        let index_len = u32::from_le_bytes(head[12..16].try_into()?) as usize;
        let name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let cipher = Aes256Gcm::new_from_slice(&pack_key(&name, &self.secret)).map_err(|_| "bad key length")?;
        let mut raw = vec![0u8; index_len];
        file.read_exact(&mut raw)?; // the index follows the header directly
        let encrypted = flags & 1 == 1;
        let json = if encrypted { decrypt(&cipher, &head[16..28], &head[28..44], &raw)? } else { raw };
        let index: Index = serde_json::from_slice(&json)?;
        let slot = self.packs.len();
        for k in index.entries.keys() {
            self.lookup.insert(k.clone(), slot);
        }
        self.packs.push(Pack { name, file: Mutex::new(file), cipher, encrypted, entries: index.entries });
        Ok(())
    }

    /// read one file: seek to its bytes, read only those, decrypt in memory → (bytes, mime type, pack name)
    pub fn read(&self, name: &str) -> Result<Option<(Vec<u8>, String, String)>, Error> {
        let Some(&slot) = self.lookup.get(name) else { return Ok(None) };
        let pack = &self.packs[slot];
        let e = &pack.entries[name];
        let mut buf = vec![0u8; e.size];
        {
            let mut f = pack.file.lock().map_err(|_| "pack file lock poisoned")?;
            f.seek(SeekFrom::Start(e.offset))?;
            f.read_exact(&mut buf)?;
        }
        let data = if pack.encrypted { decrypt(&pack.cipher, &B64.decode(&e.iv)?, &B64.decode(&e.tag)?, &buf)? } else { buf };
        Ok(Some((data, e.mime.clone(), pack.name.clone())))
    }

    pub fn pack_names(&self) -> Vec<String> {
        self.packs.iter().map(|p| format!("{}.pak", p.name)).collect()
    }

    pub fn len(&self) -> usize {
        self.lookup.len()
    }

    #[allow(dead_code)] // used by the tests
    pub fn names(&self) -> Vec<String> {
        let mut v: Vec<_> = self.lookup.keys().cloned().collect();
        v.sort();
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    const SECRET: &str = include_str!("../../../pak/secret.txt");
    fn root() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..") }

    #[test]
    fn every_file_matches_the_original() {
        let lib = PakLibrary::open_folder(&root().join("dist/pak"), SECRET.trim()).unwrap();
        assert!(lib.len() > 0);
        for name in lib.names() {
            let (data, _, _) = lib.read(&name).unwrap().unwrap();
            let orig = std::fs::read(root().join("dist/atlas").join(&name)).unwrap();
            assert!(data == orig, "{name} differs from the original");
        }
    }

    #[test]
    fn wrong_key_is_refused() {
        let mut lib = PakLibrary::new("wrong secret");
        assert!(lib.open(&root().join("dist/pak/units.pak")).is_err());
    }
}
