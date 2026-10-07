<p align="center">
  <img src="https://github.com/MartinDawgor/VacNet-Toolkit-Extension/blob/main/public/icon.png?raw=true" alt="VACNET Toolkit" width="96">
</p>

<h1 align="center">VACNET Toolkit Extension</h1>

<p align="center">
  VACNET Toolkit turns the standard CS2 VACNet labeling portal into a faster workspace with a modern player, verdict presets, keyboard shortcuts, and local clip history.<br>
  Spend less time waiting and repeating actions, and more time reviewing the replay.
</p>

<p align="center">
  <a href="https://github.com/MartinDawgor/VacNet-Toolkit-Extension/releases"><img alt="Version 3.0.2" src="https://img.shields.io/badge/version-3.0.2-5d8d22?style=flat-square"></a>
  <a href="https://github.com/MartinDawgor/VacNet-Toolkit-Extension/blob/main/LICENSE"><img alt="GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-356ea8?style=flat-square"></a>
  <img alt="Chromium Manifest V3" src="https://img.shields.io/badge/Chromium-Manifest_V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white">
  <img alt="Firefox 128+" src="https://img.shields.io/badge/Firefox-128%2B-FF7139?style=flat-square&logo=firefoxbrowser&logoColor=white">
</p>

<p align="center">
  <a href="https://github.com/MartinDawgor/VacNet-Toolkit-Extension/releases"><b>Download</b></a> ·
  <a href="https://github.com/MartinDawgor/VacNet-Toolkit-Extension/issues"><b>Report an issue</b></a> ·
  <a href="README.md"><b>Русский</b></a>
</p>

<img src="https://github.com/user-attachments/assets/43595d62-8ef1-4414-9e81-ad395ad4140e" alt="VACNET Toolkit player and verdict panel" width="100%">

<p align="center">
  <img src="https://github.com/user-attachments/assets/b6b80101-0bab-4ce6-ba0d-15a2aab4a8bb" alt="Reviewed clip history" width="45%">
  <img src="https://github.com/user-attachments/assets/d7dd3344-bc31-4e1f-a223-15c98019555c" alt="Detailed clip information" width="45%">
</p>

## 🚀 Quick start

### Updated portal compatibility (3.0.2)

Plyr, the styled verdict panel, all toolbar buttons, presets and player shortcuts work in both modes. Legacy clips retain all four categories; the new type has one cheating question with cheating, uncertain and no-cheating answers. Presets are stored separately for each mode. The interface and history use Russian. New reviews retain the original media, watched-progress restrictions and site confirmation; decision ticks are submitted unchanged.

History records the verdict and `verdict_tick` when a different task opens in the same tab. Until then, the record is pending for 10 minutes; no history entry is created if there is no next task. Legacy four-category clips retain their original interface. Compatibility was checked against a saved page and local scenarios; server submission still needs verification in an authenticated browser session.

> Active access to the official VACNet labeling portal is required.

1. Download the archive for your browser from [Releases](https://github.com/MartinDawgor/VacNet-Toolkit-Extension/releases).
2. Extract it into a dedicated folder.
3. Open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked**.
4. Select the extracted folder and open the VACNet portal.

<details>
<summary><b>Install in Firefox</b></summary>

1. Use Firefox 128 or newer and download the Firefox build.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on** and select `manifest.json` from the extracted build.

Temporary add-ons must be loaded again after restarting Firefox. A signed package is required for permanent installation.
</details>

| Browser | Support |
| --- | --- |
| Chrome | Primary Manifest V3 build |
| Edge, Brave, Opera | Current Chromium-based versions |
| Firefox | Dedicated MV3 build, version 128+ |

## Development

Building from source requires Node.js 22.12 or newer and npm.

```sh
npm ci
npm run check
```

`check` runs TypeScript checks, builds for Chrome and Firefox, and validates the permissions, scripts, assets, and translations in both packages.

After adding or removing keys in `public/_locales`, run `npm run generate:i18n` to update the typed translation key list.

| Command | Result |
| --- | --- |
| `npm run dev` | Chrome development with automatic reloads |
| `npm run dev:firefox` | Firefox development |
| `npm run build:all` | Both builds in `.output/chrome-mv3` and `.output/firefox-mv3` |
| `npm run typecheck` | Type checking without a build |
| `npm run zip` | Chrome archive in `.output` |
| `npm run zip:firefox` | Firefox archive in `.output` |

For manual installation, select the corresponding build directory instead of the repository root. The Firefox build uses a separate local ID, `vacnet-toolkit-local@extensions.invalid`, so its settings and history are separate from the published add-on. Use history export and import to transfer records if needed. The local Firefox archive is unsigned.

## ✨ Highlights

- **Modern player → easier review.** Playback rates from 0.25× to 4×, precise seeking, time stepping, 2× zoom, persistent volume, and an event marker.
- **Presets → four answers in one action.** Create up to nine color-coded presets, choose their verdicts, and optionally enable instant submission per preset.
- **Fast transition → less waiting.** Once Valve accepts a verdict, the next clip normally loads without a full page refresh.
- **Repeat detection → less duplicate work.** The extension recognizes previously seen fragments, displays earlier answers, and can fill them in for confirmation.
- **History → context when you need it.** Up to 1,000 submitted tasks are stored locally, grouped by match, and available for JSON import or export.
- **Light and dark themes → comfortable viewing.** The selected theme applies to both the Valve page and extension UI.
- **English and Russian → familiar controls.** The language follows the browser UI, while known portal labels are translated automatically.

## 🔄 Before and after

| Standard portal | With VACNET Toolkit |
| --- | --- |
| Limited clip navigation | Free navigation through the available replay and speeds up to 4× |
| Four categories filled manually | Up to nine presets with number-key shortcuts |
| Submission triggers normal navigation | The next task loads into the current interface |
| Repeated fragments are easy to miss | Previous verdict and repeat status are shown alongside the clip |
| Fixed legacy layout | Responsive interface with light and dark themes |

## 🎮 Player and verdicts

The suspicious moment is marked on the timeline. A countdown appears before the event, while a precise seek tooltip makes short fragments easier to inspect.

The verdict panel covers four categories: **Aim Assist**, **Wall Hack**, **Auto BHop**, and **Bot**. Each category offers **Yes**, **Uncertain**, and **No**.

You can also:

- keep the player controls visible;
- stretch the video to the available area;
- hide the visible reviewer nickname;
- copy a guest link to the clip;
- inspect metrics for the current task;
- import, export, or clear local history.

## ⌨️ Keyboard shortcuts

| Key | Action |
| --- | --- |
| `1`–`9` | Apply the preset at that position |
| `Space` | Play / pause |
| `R` | Return to the start of the working range |
| `E` | Jump to the moment before the suspicious event |
| `←` / `→` | Step backward / forward |
| `[` / `]` | Decrease / increase playback speed |
| `Z` | Toggle 2× zoom |
| `Enter` | Submit the current verdict |
| `Backspace` | Skip the clip |
| `Esc` | Close an open dashboard or dialog |

Shortcuts use physical key positions and work across keyboard layouts. They are disabled while typing, interacting with controls, viewing a modal, or submitting a verdict.

For new reviews, `Enter` confirms the selected answer after the site's arming delay, and `Backspace` selects uncertain when available. `E` applies only to clips with a marked event.

> If **Instant submit** is enabled for a preset, pressing its number submits the saved answer. New reviews retain the site's watched-progress restrictions and confirmation delay.

## 🔐 Privacy

- The extension contains no analytics, telemetry, or remotely executed code.
- Preferences and history are stored locally through `browser.storage.local`.
- The `storage` permission is used only for settings, presets, and history.
- Host access is limited to the VACNet page on `counter-strike.net` and videos on `replay-video.valve.net`.
- Network requests are used to submit verdicts, load the next task, read metadata, and stream Valve WebM video.
- The extension writes to the clipboard only after you click **Share clip** or **Copy metrics**; it never reads clipboard contents.
- No data is sent to the developer or third-party analytics services.

> A history export may contain direct source WebM URLs with access parameters. Do not publish history JSON files or copied guest links.

Nickname hiding only changes the name displayed in the top bar. It does not anonymize your account, network traffic, links, or exported data.

## ⚠️ Important

VACNET Toolkit helps manage playback and the answers you select; it does not decide verdicts on its own. Automatic submission occurs only for presets where the user explicitly enables that option.

This project is not affiliated with Valve Corporation. Counter-Strike, Counter-Strike 2, and VACNet are trademarks of Valve Corporation. Follow the portal access rules and do not redistribute review materials.

## 👤 Author and contact

The project is distributed under the [GPL-3.0 license](https://github.com/MartinDawgor/VacNet-Toolkit-Extension/blob/main/LICENSE) and maintained on a voluntary basis.

- Author: [MartinDawgor](https://github.com/MartinDawgor)
- Bugs and suggestions: [GitHub Issues](https://github.com/MartinDawgor/VacNet-Toolkit-Extension/issues)
- Telegram: [@GeniusShitPost](https://t.me/GeniusShitPost)
- Steam: [Chumzes](https://steamcommunity.com/id/Chumzes/)

<p align="center"><sub>VACNET Toolkit Extension 3.0.0</sub></p>
