from itertools import product

from music_theory import NOTE_TO_PC


def parse_tuning(tuning: str):
    tuning = tuning.strip().replace(" ", "")
    if not tuning:
        raise ValueError("Empty tuning")

    notes = []
    idx = 0
    while idx < len(tuning):
        head = tuning[idx].upper()
        if head < "A" or head > "G":
            raise ValueError(f"Invalid tuning note at position {idx + 1}")
        idx += 1
        accidental = ""
        if idx < len(tuning) and tuning[idx] in ("#", "b"):
            accidental = tuning[idx]
            idx += 1
        notes.append(f"{head}{accidental}")

    if len(notes) not in (4, 6):
        raise ValueError("Tuning must specify 4 or 6 strings (low to high)")

    try:
        pcs = [NOTE_TO_PC[note] for note in notes]
    except KeyError as exc:
        raise ValueError(f"Unknown tuning note: {exc}") from exc

    return notes, pcs


def frets_for_pitch(string_pc: int, chord_pcs, max_fret: int):
    frets = []
    for fret in range(0, max_fret + 1):
        if (string_pc + fret) % 12 in chord_pcs:
            frets.append(fret)
    return frets


def generate_fingerings(
    tuning_pcs,
    chord_pcs,
    root_pc,
    required_pcs,
    max_fret=12,
    max_span=4,
    max_results=20,
):
    string_candidates = []
    for string_pc in tuning_pcs:
        frets = frets_for_pitch(string_pc, chord_pcs, max_fret)
        candidates = [None] + frets
        string_candidates.append(candidates)

    fingerings = []
    for combo in product(*string_candidates):
        if all(fret is None for fret in combo):
            continue

        used_pcs = {(tuning_pcs[i] + fret) % 12 for i, fret in enumerate(combo) if fret is not None}
        if root_pc not in used_pcs:
            continue
        if not required_pcs.issubset(used_pcs):
            continue
        if not set(chord_pcs).issubset(used_pcs):
            continue

        fretted = [fret for fret in combo if fret not in (None, 0)]
        if fretted:
            min_fret = min(fretted)
            max_fret_used = max(fretted)
            if max_fret_used - min_fret > (max_span - 1):
                continue
        else:
            min_fret = 0
            max_fret_used = 0

        if min_fret == 0:
            base_fret = 1
        else:
            base_fret = max(1, max_fret_used - max_span + 1)
        max_allowed = base_fret + max_span - 1
        if any(fret is not None and fret > 0 and (fret < base_fret or fret > max_allowed) for fret in combo):
            continue

        fingers_used = estimate_fingers(combo, min_fret if fretted else None, max_fret_used if fretted else None)
        if fingers_used > 4:
            continue

        fingerings.append(
            {
                "frets": list(combo),
                "base_fret": base_fret,
            }
        )

    # Drop fingerings that only differ by a single string being muted vs open.
    frets_set = {tuple(f["frets"]) for f in fingerings}
    filtered = []
    for f in fingerings:
        frets = f["frets"]
        drop = False
        for i, fret in enumerate(frets):
            if fret is None:
                candidate = list(frets)
                candidate[i] = 0
                if tuple(candidate) in frets_set:
                    drop = True
                    break
        if not drop:
            filtered.append(f)

    fingerings = filtered

    def score_fingering(f):
        frets = f["frets"]
        played = [i for i, fret in enumerate(frets) if fret is not None]
        mutes = sum(1 for fret in frets if fret is None)
        base_fret = f["base_fret"]

        internal_mutes = 0
        if played:
            low = min(played)
            high = max(played)
            for i in range(low, high + 1):
                if frets[i] is None:
                    internal_mutes += 1

        fretted = [fret for fret in frets if fret not in (None, 0)]
        if fretted:
            min_fret = min(fretted)
            max_fret_used = max(fretted)
            fingers = estimate_fingers(frets, min_fret, max_fret_used)
        else:
            fingers = 0

        root_lowest = False
        if played:
            lowest_string = min(played)
            lowest_fret = frets[lowest_string]
            if lowest_fret is not None:
                lowest_pc = (tuning_pcs[lowest_string] + lowest_fret) % 12
                root_lowest = lowest_pc == root_pc

        fret_sum = sum(0 if fret is None else fret for fret in frets)

        return (
            internal_mutes * 1000,
            base_fret,
            mutes,
            fingers,
            0 if root_lowest else 1,
            fret_sum,
        )

    fingerings.sort(key=score_fingering)

    return fingerings[:max_results]


def estimate_fingers(frets, min_fret_used, max_fret_used):
    if min_fret_used is None:
        return 0

    fretted_indices = [i for i, f in enumerate(frets) if f not in (None, 0)]
    if not fretted_indices:
        return 0

    assigned = set()
    fingers = 0

    # Barre on minimum fret (can cover multiple strings)
    min_group = [i for i in fretted_indices if frets[i] == min_fret_used]
    if min_group:
        fingers += 1
        assigned.update(min_group)

    # Barre on highest fret if on "bottom" (highest index) contiguous strings
    if max_fret_used is not None and max_fret_used != min_fret_used:
        max_group = sorted(i for i in fretted_indices if frets[i] == max_fret_used and i not in assigned)
        if max_group:
            # Must be contiguous and include the highest string index
            is_contiguous = all(b == a + 1 for a, b in zip(max_group, max_group[1:]))
            includes_highest = max_group[-1] == (len(frets) - 1)
            if is_contiguous and includes_highest:
                fingers += 1
                assigned.update(max_group)

    # Remaining fretted strings require one finger each
    for i in fretted_indices:
        if i not in assigned:
            fingers += 1

    return fingers
