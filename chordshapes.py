import argparse
import os
import sys

from fingerings import generate_fingerings, parse_tuning
from music_theory import chord_pitches, parse_chord


def describe_fingering(fingering, tuning_notes, root_pc):
    frets = fingering["frets"]
    notes = []
    for string_idx, fret in enumerate(frets):
        if fret is None:
            notes.append("X")
            continue
        if fret == 0:
            notes.append("O")
            continue
        notes.append(str(fret))
    root_strings = []
    for string_idx, fret in enumerate(frets):
        if fret is None:
            continue
        string_pc = tuning_notes[string_idx]["pc"]
        if (string_pc + fret) % 12 == root_pc:
            root_strings.append(string_idx)
    return notes, root_strings


def draw_ascii_diagram(title, tuning_notes, fingering, chord_pcs, root_pc):
    frets = fingering["frets"]
    base_fret = fingering["base_fret"]

    header = [title]
    if base_fret > 1:
        header.append(f"Base fret: {base_fret}")
    print("\n".join(header))

    labels = []
    for string_idx, note in enumerate(tuning_notes):
        fret = frets[string_idx]
        if fret is None:
            labels.append("X")
        elif fret == 0:
            labels.append("0")
        else:
            labels.append(note["name"])
    label_line = "   " + " ".join(labels)
    if base_fret > 1:
        label_line = f"{label_line}  Base fret: {base_fret}"
    print(label_line)

    for row in range(4):
        fret_num = base_fret + row
        row_cells = []
        for string_idx, fret in enumerate(frets):
            cell = "_"
            if fret is not None and fret == fret_num:
                string_pc = tuning_notes[string_idx]["pc"]
                note_pc = (string_pc + fret) % 12
                cell = "R" if note_pc == root_pc else "●"
            row_cells.append(cell)
        if base_fret == 1:
            print("   " + " ".join(row_cells))
        else:
            print(f"{fret_num:>2} " + " ".join(row_cells))


def draw_matplotlib_diagram(title, tuning_notes, fingering, chord_pcs, root_pc, output_path=None):
    import matplotlib.pyplot as plt

    frets = fingering["frets"]
    base_fret = fingering["base_fret"]
    string_count = len(frets)

    fig, ax = plt.subplots(figsize=(4, 6))
    ax.set_title(title, fontsize=14)

    # Draw strings (vertical)
    for string_idx in range(string_count):
        ax.plot([string_idx, string_idx], [0, 4], color="black", linewidth=1)

    # Draw frets (horizontal)
    for fret_idx in range(5):
        y = fret_idx
        ax.plot([-0.5, string_count - 0.5], [y, y], color="black", linewidth=1)

    # String labels
    for string_idx, note in enumerate(tuning_notes):
        ax.text(string_idx, 4.7, note["name"], ha="center", va="center", fontsize=9)

    # X/O markers
    for string_idx, fret in enumerate(frets):
        if fret is None:
            ax.text(string_idx, 4.4, "X", ha="center", va="center", fontsize=12)
        elif fret == 0:
            string_pc = tuning_notes[string_idx]["pc"]
            note_pc = (string_pc + fret) % 12
            marker = "O"
            color = "red" if note_pc == root_pc else "black"
            ax.text(string_idx, 4.4, marker, ha="center", va="center", fontsize=12, color=color)

    # Dots
    for string_idx, fret in enumerate(frets):
        if fret is None or fret == 0:
            continue
        if fret < base_fret or fret > base_fret + 3:
            continue
        string_pc = tuning_notes[string_idx]["pc"]
        note_pc = (string_pc + fret) % 12
        color = "red" if note_pc == root_pc else "black"
        y = 4 - (fret - base_fret) - 0.5
        circle = plt.Circle((string_idx, y), 0.25, color=color)
        ax.add_patch(circle)

    # Fret labels
    if base_fret > 1:
        ax.text(string_count - 0.1, 3.5, f"{base_fret}", fontsize=10, va="center")

    ax.set_xlim(-0.8, string_count - 0.1)
    ax.set_ylim(-0.2, 4.8)
    ax.axis("off")

    plt.tight_layout()
    if output_path:
        plt.savefig(output_path, dpi=150)
    else:
        plt.show()


def build_tuning_struct(tuning_notes, tuning_pcs):
    return [
        {
            "name": note,
            "pc": pc,
        }
        for note, pc in zip(tuning_notes, tuning_pcs)
    ]


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Guitar chord diagram generator")
    parser.add_argument("chord", help="Chord name (e.g., Cm, C, G7, F#maj7)")
    parser.add_argument("--tuning", default="EADGBE", help="Tuning from low to high (default: EADGBE)")
    parser.add_argument("--max_fret", type=int, default=12)
    parser.add_argument("--max_results", type=int, default=12)
    parser.add_argument("--image", help="Save diagram to image file (requires matplotlib)")
    return parser.parse_args(argv)


def main(args):

    root_name, root_pc, intervals = parse_chord(args.chord)
    chord_pcs = chord_pitches(root_pc, intervals)

    tuning_notes, tuning_pcs = parse_tuning(args.tuning)
    tuning_struct = build_tuning_struct(tuning_notes, tuning_pcs)

    required_pcs = {root_pc}
    if len(intervals) > 1:
        required_pcs.add((root_pc + intervals[1]) % 12)

    fingerings = generate_fingerings(
        tuning_pcs,
        chord_pcs,
        root_pc,
        required_pcs,
        max_fret=args.max_fret,
        max_span=4,
        max_results=args.max_results,
    )

    if not fingerings:
        print("No chord fingerings found with the given constraints.")
        return

    for idx, fingering in enumerate(fingerings, start=1):
        title = f"{args.chord} (shape {idx})"
        if args.image:
            draw_matplotlib_diagram(title, tuning_struct, fingering, chord_pcs, root_pc, args.image)
            print(f"Saved diagram to {args.image}")
            break
        else:
            draw_ascii_diagram(title, tuning_struct, fingering, chord_pcs, root_pc)
            print()


if __name__ == "__main__":
    try:
        args = parse_args()
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 2
        os._exit(code)
    for name, value in vars(args).items():
        print(f"{name:<20} {value}")
    main(args)
