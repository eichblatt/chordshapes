# Chord Shapes

Generate guitar (and 4‑string) chord diagrams from chord names and tunings. Includes a browser-based viewer served via GitHub Pages.

## Web App (recommended)

If this repo is published with GitHub Pages, open the site here:

- https://eichblatt.github.io/chordshapes/


## Run locally (browser)

From the repo root:

1. Start a static server for the docs folder:
   ```bash
   python -m http.server --directory docs 8000
   ```
2. Open http://localhost:8000

## Run locally (CLI)

```bash
python chordshapes.py Cm
```

Optional image output (requires matplotlib):

```bash
pip install -r requirements.txt
python chordshapes.py Cm --image cm.png
```

## Notes

- Default tuning is standard EADGBE.
- 4‑string tunings are supported (e.g. DGBE).
