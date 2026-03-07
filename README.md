# Chord Shapes

Generate guitar (and 4‑string) chord diagrams from chord names and tunings. Includes a browser-based viewer served via GitHub Pages.

## Web App (recommended)

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

1. mute_count_penalty (1 if ≥3 mutes else 0)
2. both_ends_muted_penalty (1 if both outer strings muted)
3. internal_mutes * 1000
4. effective_fingers * 10
5. root_lowest penalty (0 if root is lowest, else 12)
6. inversion_score
7. base_fret * 10
8. effective_mutes * 41 
9. span_score = fret_span + string_span
10. min_fret (minimum non‑zero fret)
