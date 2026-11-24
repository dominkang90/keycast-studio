# Extensions

An extension adds backgrounds, key themes, cursor packs, click effects and subtitle styles to KeyCast Studio. It is a folder with an `extension.json` file and, optionally, pictures. **Extensions contain data only: KeyCast never runs code from them.**

When you pick an item from an extension in the editor, its values are copied into the project. A project therefore looks the same on a computer that does not have the extension (except picture backgrounds, which point at the picture file).

## Installing

1. On the home screen choose **🧩 Extensions → 📁 Open extensions folder**. This is `Videos\KeyCast Studio\_extensions`.
2. Put the extension's folder there, so that you have `_extensions\<folder>\extension.json`.
3. Choose **↻ Reload**. Each extension can be turned on or off.

The same window lists the **official extensions** that come with the app (Starter pack, Nature, Neon night, Office, Pastel, Retro terminal). **Add** copies one into the folder; **Reinstall** puts back the original.

## Making one with the extension maker

Choose **🧩 Extensions → ✏ Make a new extension**. The maker has a form on the left and a live preview on the right that is drawn by the same code that draws your videos: a made-up screen with a key bubble, a moving pointer with clicks and a subtitle, using the item picked in each section.

- Fill in the name, author, version and description, then add items of each kind with **+ Add** and set their colours and sliders.
- **Start from official…** copies an official pack so you can change it. A copy is saved in its own folder (`<name>-custom`), so reinstalling the official pack does not overwrite it.
- **⤒ Open JSON** loads an existing `extension.json` to edit.
- **Add to app** saves it to `_extensions/<folder>/extension.json` (the folder name comes from the pack's name).
- **⤓ Download JSON** saves the file to share it. This also works in the browser version.

Picture backgrounds are not made in the maker: add an `image` item by hand and put the picture next to `extension.json`.

## Format

```json
{
  "name": "My pack",
  "version": "1.0",
  "author": "Your name",
  "backgrounds": [
    { "name": "Deep sea", "gradient": ["#0ea5e9", "#1e3a8a", "#0b1020"], "angle": 160 },
    { "name": "Northern lights", "base": "#04121a", "blobs": [[0.2, 0.15, 0.7, "#22d3ee"], [0.85, 0.3, 0.6, "#a855f7"]] },
    { "name": "Beach", "image": "beach.jpg" }
  ],
  "keyThemes": [
    { "name": "Mint", "face": "#d1fae5", "text": "#064e3b", "modFace": "#10b981", "modText": "#ffffff",
      "border": true, "borderColor": "#065f46", "borderWidth": 2, "radius": 10, "capStyle": "raised",
      "gradient": false, "panel": true, "panelColor": "#022c22", "panelOpacity": 0.5 }
  ],
  "cursorPacks": [
    { "name": "Lime", "fill": "#a3e635", "edge": "#1a2e05", "width": 1.4, "glow": "#84cc16" }
  ],
  "clickEffects": [
    { "name": "Soft blue echo", "effect": "echo", "color": "#3b82f6", "size": 1.2, "duration": 0.8, "opacity": 0.9 }
  ],
  "subtitleStyles": [
    { "name": "Big pop", "style": "pop", "textColor": "#ffffff", "highlight": "#facc15", "bgOpacity": 0.6,
      "anim": "pop", "size": 1.25, "position": "bottom" }
  ]
}
```

| Field | Values |
|---|---|
| colours | `#rrggbb` only |
| `backgrounds[].gradient` | 2 to 6 colours; `angle` 0–360 degrees |
| `backgrounds[].blobs` | up to 8 of `[x, y, radius, colour]`, positions 0–1 of the frame; `base` is the colour underneath |
| `backgrounds[].image` | a `.png`, `.jpg` or `.webp` file in the extension's own folder |
| `keyThemes[].capStyle` | `raised`, `flat` or `outline`; `borderWidth` 0–6, `radius` 0–24, `panelOpacity` 0–1 |
| `cursorPacks[]` | `fill`, `edge`, `width` 0.5–3 and an optional `glow`; drawn with KeyCast's 13 pointer shapes |
| `clickEffects[].effect` | `ripple`, `echo`, `spotlight` or `burst`; `size` 0.5–2.5, `duration` 0.3–1.5 s, `opacity` 0.1–1 |
| `subtitleStyles[].style` | `box`, `outline`, `yellow`, `karaoke`, `pop`, `paper` or `minimal`; `anim` `none`, `fade`, `rise` or `pop`; `position` `bottom`, `middle` or `top`; `size` 0.6–1.8 |

Invalid entries are skipped, numbers outside their range are clamped, and at most 50 items of each kind are read. `extension.json` may be up to 256 KB. The checks live in `src/lib/extensions.js` and are covered by `npm test`.

## Sharing

Extensions are plain folders, so a zip of the folder is enough. To suggest one for the official list, open a pull request that adds `extensions/<folder>/extension.json` to this repository. The folder name may use lowercase letters, digits and dashes. `npm test` checks that every entry in every official pack is valid, so nothing is dropped silently.
