NOTE_TO_PC = {
    "C": 0,
    "B#": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "Fb": 4,
    "E#": 5,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
    "Cb": 11,
}

PC_TO_NOTE = {
    0: "C",
    1: "C#",
    2: "D",
    3: "Eb",
    4: "E",
    5: "F",
    6: "F#",
    7: "G",
    8: "Ab",
    9: "A",
    10: "Bb",
    11: "B",
}

CHORD_QUALITIES = {
    "": [0, 4, 7],
    "M": [0, 4, 7],
    "maj": [0, 4, 7],
    "m": [0, 3, 7],
    "min": [0, 3, 7],
    "dim": [0, 3, 6],
    "aug": [0, 4, 8],
    "sus2": [0, 2, 7],
    "sus4": [0, 5, 7],
    "7": [0, 4, 7, 10],
    "maj7": [0, 4, 7, 11],
    "m7": [0, 3, 7, 10],
}


def normalize_note_name(note: str) -> str:
    note = note.strip()
    if not note:
        raise ValueError("Empty note name")
    if len(note) == 1:
        return note.upper()
    head = note[0].upper()
    tail = note[1:]
    if tail in ("#", "b"):
        return f"{head}{tail}"
    return f"{head}{tail.lower()}"


def parse_chord(chord: str):
    chord = chord.strip()
    if not chord:
        raise ValueError("Empty chord")

    root = chord[0].upper()
    accidental = ""
    rest = chord[1:]
    if rest.startswith("#") or rest.startswith("b"):
        accidental = rest[0]
        rest = rest[1:]
    root_name = normalize_note_name(f"{root}{accidental}")

    quality = rest or ""
    if quality not in CHORD_QUALITIES:
        raise ValueError(f"Unsupported chord quality '{quality}'. Supported: {', '.join(sorted(CHORD_QUALITIES))}")

    root_pc = NOTE_TO_PC[root_name]
    intervals = CHORD_QUALITIES[quality]
    return root_name, root_pc, intervals


def chord_pitches(root_pc: int, intervals):
    return {(root_pc + interval) % 12 for interval in intervals}
