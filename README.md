# Rogue Trader Dialogue Vote

Let Twitch viewers vote on the Lord Captain's dialogue choices in **Warhammer 40,000: Rogue Trader**. Broadcasters install the FoxForge Dialogue Vote PC mod and connect it to a voting backend. Viewers vote in the Twitch extension with their existing Twitch account.

**[Download the Windows mod (v0.1.0)](https://raw.githubusercontent.com/ArchmagosKitsu/rogue-trader-dialogue-vote/main/downloads/FoxForgeVote-0.1.0.zip)**

Extract the included FoxForgeVote folder into the game's UnityModManager directory. Copy settings.example.json to settings.json in that folder and follow the configuration steps below. This prototype needs a configured Twitch extension and a running backend for your channel. Each server instance supports one channel and one running game.

The DLL compiled against the Steam edition. Simulated voting passed the backend smoke test. Live Twitch voting and in-game answer selection still need verification on a test save.

## Run the backend

Use Node.js 20+ on one long-running host. No npm install is needed. From the package root, run `node server/smoke.mjs` to exercise a simulated game and two viewers with temporary credentials. It uses loopback and terminates automatically.

For Twitch, deploy `server/server.mjs` behind a public HTTPS reverse proxy. Set the following server environment variables and run `node server/server.mjs`.

| Variable | Value |
| --- | --- |
| GAME_KEY | Private random game pairing key. Generate locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` |
| EXT_SECRET | Base64 extension shared secret from the Twitch developer console |
| CHANNEL_ID | Broadcaster's numeric Twitch channel ID |
| EXT_ORIGIN | Exact extension iframe origin, usually https://CLIENT_ID.ext-twitch.tv for Twitch-hosted testing. Use the actual frontend origin for local testing. |
| HOST / PORT | Defaults to 127.0.0.1 and 8080. Set HOST to 0.0.0.0 if required by the host. |
| VOTE_SECONDS | Default 30, accepted range 5–300 |

The service keeps one poll in memory. Use one process/replica. A restart discards ballots and the next game heartbeat can open a fresh poll. Keep secrets outside the extension bundle. Only the game pairing key goes in the mod configuration.

## Set up the Twitch viewer

1. Register a Twitch Extension, enable Video Overlay, and set the viewer path to `viewer.html`. For mobile testing enable the mobile view and set the same viewer path.
2. Change `extension/config.js` to the public HTTPS origin of your backend, without a trailing slash. Add the backend origin to the extension's allowed fetch domains.
3. Zip the **contents** of `extension` with viewer.html at the root. Upload those assets for Hosted Test. Enable the test extension on the broadcaster's channel and grant tester access as needed. General distribution requires Twitch's release process.
4. A signed-in viewer can click to vote and change their vote until closing. The opaque Twitch user ID identifies a ballot without requiring identity sharing. The viewer UI fetches current state every 1.5 seconds, including on joining mid-round. Votes go directly to the HTTPS backend. There is no Twitch chat command or native Twitch poll in this prototype.

## Install and test the game mod

1. Close the game. In `%USERPROFILE%\AppData\LocalLow\Owlcat Games\Warhammer 40000 Rogue Trader\UnityModManager\` create a folder named `FoxForgeVote`. Copy Info.json and FoxForgeVote.dll from `mod` into it.
2. Copy settings.example.json there as settings.json. Set url to the full HTTPS backend endpoint ending in /game, key to GAME_KEY, enabled to true and leave autoSelect false. Restart the game after config changes. Enable FoxForge Dialogue Vote in Unity Mod Manager.
3. Load a single-player save with two or more enabled dialogue answers. Verify the extension shows the same labels and excludes locked answers. A single Continue should leave the overlay hidden. Vote and check the Unity Mod Manager log for the winning text. Test an illustrated book event separately. Secondary skill-check or character-selection prompts may still need your input.
4. On a separate test save, switch autoSelect to true, restart, then vote. Check that the exact winning answer advances play once. Pick an answer manually during another vote and check the old winner is ignored. Disable the mod in UMM to take over. Ties and empty votes leave the decision to you.
5. If the UI stays blank, verify the game settings file, UMM enable state, developer test access, extension iframe origin and allowed fetch domain. Check the UMM log and browser network responses from /state and /game. Keyboard/controller-layout switching, game menus, reloads and cutscenes need hands-on testing before streaming.

## Implementation

The game checks active desktop answer views twice per second on Unity's main thread. It uses the displayed text and the answer view model's Enable, IsSystem and Index fields. A fresh group of view models receives a random round ID. The game sends snapshots over outbound HTTP(S) and rechecks the current group before applying a result through OnChooseAnswer. The backend closes voting when the game heartbeat goes stale. A unique plurality wins. All votes have equal weight. Polling eliminates a separate local bridge and Twitch message fan-out for this first version. OBS is not required.

To rebuild on Windows, run `mod/build.ps1 -GameDir 'FULL GAME INSTALL PATH'` in PowerShell. The script uses the Windows .NET Framework compiler, the game's own managed DLLs, and the game's initialized Unity Mod Manager DLL. If the UMM DLL lives elsewhere, pass -UmmDll. The package contains no game assemblies.

