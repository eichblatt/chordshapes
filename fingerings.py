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
    if string_pc in chord_pcs:
        frets.append(0)
    for fret in range(1, max_fret + 1):
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
        if fingers_used is None or fingers_used > 4:
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
        played_indices = [i for i, fret in enumerate(frets) if fret is not None]
        lowest_played = min(played_indices) if played_indices else None
        drop = False
        for i, fret in enumerate(frets):
            if fret is None:
                candidate = list(frets)
                candidate[i] = 0
                if tuple(candidate) in frets_set and (lowest_played is None or i > lowest_played):
                    drop = True
                    break
        if not drop:
            filtered.append(f)

    fingerings = filtered

    # Drop muted strings when a fretted chord tone is available within the diagram window.
    filtered = []
    for f in fingerings:
        frets = f["frets"]
        base_fret = f["base_fret"]
        max_allowed = base_fret + max_span - 1
        drop = False
        leading_muted = 0
        for fret in frets:
            if fret is None:
                leading_muted += 1
            else:
                break
        trailing_muted = 0
        for fret in reversed(frets):
            if fret is None:
                trailing_muted += 1
            else:
                break

        for idx, fret in enumerate(frets):
            if fret is None and not (idx < leading_muted or idx >= len(frets) - trailing_muted):
                string_pc = tuning_pcs[idx]
                for candidate in range(base_fret, max_allowed + 1):
                    if (string_pc + candidate) % 12 in chord_pcs:
                        drop = True
                        break
            if drop:
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
        fretted_indices = [i for i, fret in enumerate(frets) if fret not in (None, 0)]
        if fretted:
            min_fret = min(fretted)
            max_fret_used = max(fretted)
            fingers = estimate_fingers(frets, min_fret, max_fret_used)
        else:
            max_fret_used = 0
            fingers = 0

        root_lowest = False
        if played:
            lowest_string = min(played)
            lowest_fret = frets[lowest_string]
            if lowest_fret is not None:
                lowest_pc = (tuning_pcs[lowest_string] + lowest_fret) % 12
                root_lowest = lowest_pc == root_pc

            root_lowest_effective = root_lowest
            if not root_lowest and played:
                lowest_string = min(played)
                if frets[lowest_string] == 0:
                    low = min(played)
                    high = max(played)
                    if lowest_string in (low, high):
                        alt_played = [i for i in played if i != lowest_string]
                        if alt_played:
                            alt_used = {(tuning_pcs[i] + frets[i]) % 12 for i in alt_played if frets[i] is not None}
                            if root_pc in alt_used and set(chord_pcs).issubset(alt_used):
                                alt_lowest = min(alt_played)
                                alt_lowest_pc = (tuning_pcs[alt_lowest] + frets[alt_lowest]) % 12
                                if alt_lowest_pc == root_pc:
                                    root_lowest_effective = True

        inversion_score = 0
        if played:
            chord_order = {pc: idx for idx, pc in enumerate(sorted(chord_pcs, key=lambda pc: (pc - root_pc) % 12))}
            last_idx = None
            for idx in sorted(played):
                fret = frets[idx]
                if fret is None:
                    continue
                pc = (tuning_pcs[idx] + fret) % 12
                order_idx = chord_order.get(pc)
                if order_idx is None:
                    continue
                if last_idx is not None and order_idx < last_idx:
                    inversion_score += 1
                last_idx = order_idx

        min_fret = min(fretted) if fretted else 0
        fret_span = (max_fret_used - min_fret) if fretted else 0
        string_span = (max(fretted_indices) - min(fretted_indices)) if fretted_indices else 0
        span_score = fret_span + string_span

        leading_muted = 0
        for fret in frets:
            if fret is None:
                leading_muted += 1
            else:
                break
        trailing_muted = 0
        for fret in reversed(frets):
            if fret is None:
                trailing_muted += 1
            else:
                break

        end_mute_discount = 0.0
        if leading_muted > 0:
            end_mute_discount += 1.0
        if trailing_muted > 0:
            end_mute_discount += 0.5
        both_ends_muted_penalty = 1 if frets[0] is None and frets[-1] is None else 0
        effective_mutes = mutes - end_mute_discount
        mute_count_penalty = 1 if mutes >= 3 else 0
        effective_fingers = fingers

        tail_score = (
            effective_fingers * 10
            + (0 if root_lowest_effective else 12)
            + inversion_score
            + base_fret * 10
            + effective_mutes * 41
            + span_score
            + min_fret
        )

        return (
            mute_count_penalty,
            both_ends_muted_penalty,
            internal_mutes * 1000,
            tail_score,
        )

    # Deduplicate by fingering, preferring the best-scoring variant.
    best_by_key = {}
    for f in fingerings:
        key = tuple(0 if fret is None else fret for fret in f["frets"])
        score = score_fingering(f)
        if key not in best_by_key or score < best_by_key[key][0]:
            best_by_key[key] = (score, f)

    fingerings = [item[1] for item in best_by_key.values()]

    fingerings.sort(key=score_fingering)

    return fingerings[:max_results]


def estimate_fingers(frets, min_fret_used, max_fret_used):
    if min_fret_used is None:
        return 0

    fretted_indices = [i for i, f in enumerate(frets) if f not in (None, 0)]
    if not fretted_indices:
        return 0
    base_fingers = len(fretted_indices)
    best = base_fingers

    # Barre on minimum fret (can cover multiple strings)
    min_group = [i for i in fretted_indices if frets[i] == min_fret_used]
    if len(min_group) > 1:
        if not any(fret in (None, 0) or (fret is not None and fret < min_fret_used) for fret in frets):
            best = min(best, 1 + (base_fingers - len(min_group)))

    # Barre on highest fret if on "bottom" (highest index) contiguous strings
    if max_fret_used is not None and max_fret_used != min_fret_used:
        max_group = sorted(i for i in fretted_indices if frets[i] == max_fret_used)
        if len(max_group) > 1:
            is_contiguous = all(b == a + 1 for a, b in zip(max_group, max_group[1:]))
            includes_highest = max_group[-1] == (len(frets) - 1)
            if is_contiguous and includes_highest:
                if not any(fret in (None, 0) or (fret is not None and fret < max_fret_used) for fret in frets):
                    best = min(best, 1 + (base_fingers - len(max_group)))

    return best
