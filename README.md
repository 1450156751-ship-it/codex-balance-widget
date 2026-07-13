# Codex Balance Widget

A compact Windows desktop widget for monitoring the balance exposed by a compatible API. It stays in the system tray, can appear when `codex.exe` starts, and keeps its API key protected by Electron's Windows-backed `safeStorage`.

> This is an independent community project. It is not affiliated with, endorsed by, or supported by OpenAI. "Codex" is used only to describe the optional process-detection behavior.

## Features

- Glass-style, draggable Electron widget with optional edge docking and always-on-top mode.
- System tray controls for showing, hiding, refreshing, opening settings, and quitting.
- Polls the configured balance endpoint every five minutes and displays two decimal places.
- Uses `GET` with a configurable authentication header and prefix. The default endpoint is `https://modcon.top/v1/usage` for convenience only; any compatible provider can be configured in Settings.
- Recognizes common balance fields automatically, or accepts a custom dot-separated JSON path.
- Lets each user choose a local right-side companion image. PNG, JPG, and WEBP files up to 10 MB are accepted; portrait images of at least 600 x 900 are recommended.
- Stores the API key encrypted for the current Windows account. Keys, cookies, JWTs, and browser sessions are never committed to this repository.

## Requirements

- Windows 10 or later
- Node.js 20 or later
- npm

## Run Locally

```powershell
npm ci
npm start
```

Open **Settings** from the tray icon, then enter your endpoint, API key, header, authentication prefix, and optional balance field path. Leave the balance path as `auto` for the built-in detection.

## Build

```powershell
npm run pack
```

This creates an unpacked local build in `release/`. To generate an NSIS installer instead, run `npm run dist`.

## Privacy and Security

- The widget writes its encrypted settings to Electron's per-user application-data directory, outside the repository.
- A selected companion image is copied into that same per-user application-data directory. It is never uploaded to GitHub or included in future releases.
- Personal companion artwork, local build output, and environment files are intentionally ignored by Git.
- Review and trust the API endpoint you enter. This project does not endorse or operate any API relay service.

## Contributing

Issues and pull requests are welcome. Please do not include API keys, tokens, cookies, personal images, installers, or generated build artifacts in contributions.

## License

[MIT](LICENSE)
