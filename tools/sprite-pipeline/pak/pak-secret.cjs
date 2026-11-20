// The secret every pack key is derived from (see pak-format.md). It lives in pak/secret.txt, which the
// packer (Node) and the desktop app (Rust, compiled in with include_str!) both read, so they always match.
// Change it for your game, keep it out of public repos. Anyone who extracts it from the app can decrypt
// the packs: this stops casual copying, not a determined attacker.
const fs = require('fs'), path = require('path');
module.exports = { SECRET: fs.readFileSync(path.join(__dirname, 'secret.txt'), 'utf8').trim() };
