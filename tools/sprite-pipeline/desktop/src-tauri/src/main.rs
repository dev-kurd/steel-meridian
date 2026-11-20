// State of War — desktop app (Tauri). The window uses the system's own web engine (WebView2 on Windows),
// so the app is small. The game page asks for its sprite sheets at pak://localhost/<name>
// (http://pak.localhost/<name> on Windows); this file answers those requests from the encrypted .pak files:
// read straight from the pack, decrypted in memory, never extracted to disk.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod pak;

use std::path::PathBuf;
use std::time::Duration;
use tauri::{http, Manager};

// shared with the packer (pak/secret.txt) and compiled into the app
const SECRET: &str = include_str!("../../../pak/secret.txt");

/// Where the packs are. Release builds look only in the game's own folders:
///   1. the installer's resource folder + /data (Windows: next to the .exe · macOS: inside the .app · Linux .deb: /usr/lib/State of War/data)
///   2. a `data` folder next to the program (a portable / zip copy of the game)
/// Debug builds (`npm run desktop:start`) may also fall back to the project's dist/pak, so you can test
/// without bundling. That fallback is compiled out of release builds.
fn data_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut places = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        places.push(dir.join("data"));
    }
    if let Some(dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf())) {
        places.push(dir.join("data"));
    }
    if let Some(d) = places.into_iter().find(|d| has_packs(d)) {
        return Some(d);
    }
    #[cfg(debug_assertions)]
    {
        let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../dist/pak");
        if has_packs(&dev) {
            return Some(dev);
        }
    }
    None
}

fn has_packs(dir: &std::path::Path) -> bool {
    std::fs::read_dir(dir)
        .map(|it| it.filter_map(|e| e.ok()).any(|e| e.path().extension().map_or(false, |x| x == "pak")))
        .unwrap_or(false)
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn respond(status: u16, mime: &str, body: Vec<u8>) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .header("Access-Control-Allow-Origin", "*") // the page and the pak protocol are different origins
        .header("Cache-Control", "no-store")
        .body(body)
        .unwrap()
}

fn main() {
    let test = std::env::var("SOW_TEST").map(|v| v == "1").unwrap_or(false);

    tauri::Builder::default()
        .setup(move |app| {
            // no packs → start anyway with an empty library; every asset request then answers 503 and the
            // game page shows "Game data not found" instead of the app closing silently
            let lib = match data_dir(app.handle()) {
                Some(dir) => {
                    let lib = pak::PakLibrary::open_folder(&dir, SECRET.trim()).map_err(|e| e.to_string())?; // reads only each pack's index
                    if test {
                        eprintln!("[sow] opened {} · {} files from {}", lib.pack_names().join(", "), lib.len(), dir.display());
                    }
                    lib
                }
                None => {
                    eprintln!("[sow] game data (.pak files) not found next to the program");
                    pak::PakLibrary::new(SECRET.trim())
                }
            };
            app.manage(lib);
            if test {
                // headless check: wait, zoom in (loads @4x from the packs), report what the page shows, quit
                let w = app.get_webview_window("main").expect("main window");
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(8));
                    let _ = w.eval("for (let i = 0; i < 4; i++) document.querySelector(\"#zoom button[data-z='1']\").click()");
                    std::thread::sleep(Duration::from_secs(6));
                    let _ = w.eval("const b = window.__TAURI_INTERNALS__ && /Windows/.test(navigator.userAgent) ? 'http://pak.localhost/' : 'pak://localhost/'; fetch(b + '__report?' + encodeURIComponent(document.getElementById('resInfo').textContent + ' | ' + document.getElementById('collInfo').textContent + ' | FPS ' + document.getElementById('fps').textContent + ' | message: ' + document.getElementById('hint').textContent.slice(0, 80)))");
                    std::thread::sleep(Duration::from_secs(3));
                    handle.exit(0);
                });
            }
            Ok(())
        })
        .register_uri_scheme_protocol("pak", move |ctx, req| {
            let path = percent_decode(req.uri().path().trim_start_matches('/'));
            if test && path == "__report" {
                eprintln!("[sow] page: {}", percent_decode(req.uri().query().unwrap_or("")));
                return respond(204, "text/plain", Vec::new());
            }
            let lib = ctx.app_handle().state::<pak::PakLibrary>();
            if lib.len() == 0 {
                return respond(503, "text/plain", b"game data (.pak files) not found".to_vec());
            }
            match lib.read(&path) {
                Ok(Some((data, mime, pack))) => {
                    if test {
                        eprintln!("  {path} <- {pack}.pak");
                    }
                    respond(200, &mime, data)
                }
                Ok(None) => respond(404, "text/plain", b"not found".to_vec()),
                Err(e) => respond(500, "text/plain", e.to_string().into_bytes()),
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running State of War");
}
