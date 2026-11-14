Steel Meridian sound files
==========================

The game plays these recordings for its weapons and explosions. To change a sound, replace the file
with your own WAV of the same name. If a file is missing, the game uses its built-in synthesised sound.

bullet_1..3   machine-gun bursts        flak_1..2    autocannon rounds
shell_1..3    tank gun                  arty_1..2    artillery
boom_1..3     vehicle explosion         bigboom_1..2 structure explosion
laser_1       laser beam
Not supplied (synthesised unless you add them): missile_1.wav, jet_1.wav, thunder_1.wav

Sources, all released under CC0 1.0 (public domain; no credit required):

* The Free Firearm Sound Library - Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney
  https://opengameart.org/content/the-free-firearm-sound-library
  Used for: bullet (AK-47, Carl Gustav M45, PPSh bursts), flak (AK-47, SKS),
  and the gun layer of shell and arty (Tikka T3, Mossberg, Mosin Nagant, Winchester Model 12, slowed down).

* 150 Combat Sound Effects - compiled by untamedpixels
  https://opengameart.org/node/195932
  Files used come from Kenney "Sci-fi Sounds" (explosions, low-frequency layer under shell and arty)
  and lentikula "Sci-Fi Weapon Shots SFX" (laser beam).

The tank and artillery sounds are not recordings of real tank guns: they are rifle and shotgun recordings
slowed to about half speed and mixed with a low explosion.

Announcer voice (sounds/voice)
------------------------------
One WAV per line, generated on this PC with VoxCPM2. The voice is not a copy of any real person: it was
created from a written description ("a mature adult woman in her forties with a low, rich, natural voice, speaking calmly
and confidently, warm and expressive") and that one designed voice was then used for every line. To use a different voice, replace a file with your own recording of the same name:
start, captured, lost, enemy_capture, upgraded, core_up, research, built, turret, core_attack, base_attack,
promoted, strike, strike_in, sortie, laser, enemy_laser, repair, nocredits, victory, defeat

Kurdish and Arabic announcer (sounds/voice/ckb and sounds/voice/ar)
--------------------------------------------------------------
The same 21 lines, spoken by the same designed voice. Arabic was generated with VoxCPM2 and Kurdish (Sorani)
with OmniVoice, both on this PC. The OmniVoice model is licensed CC-BY-NC (non-commercial use only).
A line that is missing in a language folder plays in English instead. The on-screen text for both languages is in lang.js.

Update: ElevenLabs announcer
----------------------------
All three languages (English in sounds/voice, Kurdish in sounds/voice/ckb, Arabic in sounds/voice/ar) are now recorded with
ElevenLabs, model Eleven v4, stock voice "Sarah", so the announcer is the same voice in every language. The lines are in
tools/voice-lines.json and tools/elevenlabs-voice.js records them again (it reads the API key from the ELEVENLABS_API_KEY
environment variable). The previous locally generated voices (VoxCPM2 / OmniVoice) are kept in backups/voice-local.
