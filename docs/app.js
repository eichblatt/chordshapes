const NOTE_TO_PC = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4,
  F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8,
  A: 9, "A#": 10, Bb: 10, B: 11
};

const CHORD_QUALITIES = {
  "": [0, 4, 7],
  "m": [0, 3, 7],
  "dim": [0, 3, 6],
  "aug": [0, 4, 8],
  "7": [0, 4, 7, 10],
  "maj7": [0, 4, 7, 11],
  "m7": [0, 3, 7, 10],
  "mMaj7": [0, 3, 7, 11],
  "sus2": [0, 2, 7],
  "sus4": [0, 5, 7]
};

function parseChord(chord) {
  const match = chord.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) throw new Error("Invalid chord name");
  const root = (match[1].toUpperCase() + (match[2] || ""));
  const quality = match[3] || "";
  if (!(root in NOTE_TO_PC)) throw new Error("Invalid root note");
  if (!(quality in CHORD_QUALITIES)) throw new Error(`Unsupported quality: ${quality}`);
  return { root, rootPc: NOTE_TO_PC[root], intervals: CHORD_QUALITIES[quality] };
}

function chordPitches(rootPc, intervals) {
  return intervals.map(i => (rootPc + i) % 12);
}

function parseTuning(tuning) {
  const t = tuning.replace(/\s+/g, "");
  if (!t) throw new Error("Tuning is required");
  const notes = [];
  for (let i = 0; i < t.length; i++) {
    let ch = t[i].toUpperCase();
    let note = ch;
    if (i + 1 < t.length && (t[i + 1] === "#" || t[i + 1] === "b")) {
      note += t[i + 1];
      i++;
    }
    notes.push(note);
  }
  if (![4, 6].includes(notes.length)) throw new Error("Only 4 or 6 strings are supported");
  const pcs = notes.map(n => {
    if (!(n in NOTE_TO_PC)) throw new Error(`Invalid note in tuning: ${n}`);
    return NOTE_TO_PC[n];
  });
  return { notes, pcs };
}

function fretsForPitch(stringPc, chordPcs, maxFret) {
  const frets = [0];
  for (let fret = 1; fret <= maxFret; fret++) {
    const pc = (stringPc + fret) % 12;
    if (chordPcs.includes(pc)) frets.push(fret);
  }
  frets.push(null);
  return frets;
}

function estimateFingers(frets, minFret, maxFret) {
  if (minFret == null) return 0;
  const fretted = frets.map((f, i) => (f !== null && f !== 0 ? i : null)).filter(i => i != null);
  if (!fretted.length) return 0;

  const assigned = new Set();
  let fingers = 0;

  const minGroup = fretted.filter(i => frets[i] === minFret);
  if (minGroup.length) {
    fingers++;
    minGroup.forEach(i => assigned.add(i));
  }

  if (maxFret != null && maxFret !== minFret) {
    const maxGroup = fretted.filter(i => frets[i] === maxFret && !assigned.has(i)).sort((a, b) => a - b);
    if (maxGroup.length) {
      const contiguous = maxGroup.every((v, idx) => idx === 0 || v === maxGroup[idx - 1] + 1);
      const includesHighest = maxGroup[maxGroup.length - 1] === frets.length - 1;
      if (contiguous && includesHighest) {
        fingers++;
        maxGroup.forEach(i => assigned.add(i));
      }
    }
  }

  fretted.forEach(i => { if (!assigned.has(i)) fingers++; });
  return fingers;
}

function generateFingerings(tuningPcs, chordPcs, rootPc, maxFret, maxResults) {
  const stringCandidates = tuningPcs.map(pc => fretsForPitch(pc, chordPcs, maxFret));
  const fingerings = [];

  function product(arrays, idx = 0, current = []) {
    if (idx === arrays.length) {
      const combo = [...current];
      if (combo.every(f => f === null)) return;
      const usedPcs = combo
        .map((f, i) => (f == null ? null : (tuningPcs[i] + f) % 12))
        .filter(v => v != null);
      if (!usedPcs.includes(rootPc)) return;
      if (!chordPcs.every(pc => usedPcs.includes(pc))) return;

      const fretted = combo.filter(f => f !== null && f !== 0);
      const minFret = fretted.length ? Math.min(...fretted) : 0;
      const maxFretUsed = fretted.length ? Math.max(...fretted) : 0;

      const baseFret = Math.max(1, maxFretUsed - 3);
      const maxAllowed = baseFret + 3;
      if (combo.some(f => f !== null && f > 0 && (f < baseFret || f > maxAllowed))) return;

      const fingersUsed = estimateFingers(combo, fretted.length ? minFret : null, fretted.length ? maxFretUsed : null);
      if (fingersUsed > 4) return;

      fingerings.push({ frets: combo, baseFret });
      return;
    }
    for (const v of arrays[idx]) {
      current.push(v);
      product(arrays, idx + 1, current);
      current.pop();
    }
  }
  product(stringCandidates);

  const set = new Set(fingerings.map(f => JSON.stringify(f.frets)));
  const filtered = fingerings.filter(f => {
    for (let i = 0; i < f.frets.length; i++) {
      if (f.frets[i] === null) {
        const candidate = [...f.frets];
        candidate[i] = 0;
        if (set.has(JSON.stringify(candidate))) return false;
      }
    }
    return true;
  });

  function score(f) {
    const frets = f.frets;
    const played = frets.map((fr, i) => (fr == null ? null : i)).filter(i => i != null);
    const mutes = frets.filter(fr => fr == null).length;
    const baseFret = f.baseFret;

    let internalMutes = 0;
    if (played.length) {
      const low = Math.min(...played);
      const high = Math.max(...played);
      for (let i = low; i <= high; i++) {
        if (frets[i] == null) internalMutes++;
      }
    }

    const fretted = frets.filter(fr => fr !== null && fr !== 0);
    const minFret = fretted.length ? Math.min(...fretted) : null;
    const maxFretUsed = fretted.length ? Math.max(...fretted) : null;
    const fingers = estimateFingers(frets, minFret, maxFretUsed);

    let rootLowest = false;
    if (played.length) {
      const lowest = Math.min(...played);
      const fr = frets[lowest];
      const pc = (tuningPcs[lowest] + fr) % 12;
      rootLowest = pc === rootPc;
    }

    const fretSum = frets.reduce((s, fr) => s + (fr || 0), 0);

    return [baseFret, internalMutes * 100, mutes, fingers, rootLowest ? 0 : 1, fretSum];
  }

  filtered.sort((a, b) => {
    const sa = score(a), sb = score(b);
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return sa[i] - sb[i];
    }
    return 0;
  });

  return filtered.slice(0, maxResults);
}

function drawAscii(title, tuningNotes, fingering, rootPc) {
  const frets = fingering.frets;
  const baseFret = fingering.baseFret;

  const lines = [title];
  const labels = frets.map((f, i) => {
    if (f == null) return "X";
    if (f === 0) return "0";
    return tuningNotes[i];
  });
  let labelLine = "   " + labels.join(" ");
  if (baseFret > 1) labelLine += `  Base fret: ${baseFret}`;
  lines.push(labelLine);

  for (let row = 0; row < 4; row++) {
    const fretNum = baseFret + row;
    const rowCells = frets.map((f, i) => {
      if (f != null && f === fretNum) {
        const notePc = (NOTE_TO_PC[tuningNotes[i]] + f) % 12;
        return notePc === rootPc ? "R" : "●";
      }
      return "-";
    });
    if (baseFret === 1) lines.push("   " + rowCells.join(" "));
    else lines.push(String(fretNum).padStart(2) + " " + rowCells.join(" "));
  }

  return lines.join("\n");
}

document.getElementById("go").addEventListener("click", () => {
  const chord = document.getElementById("chord").value.trim();
  const tuning = document.getElementById("tuning").value.trim();
  const maxFret = parseInt(document.getElementById("maxFret").value, 10);
  const maxResults = parseInt(document.getElementById("maxResults").value, 10);

  const error = document.getElementById("error");
  const output = document.getElementById("output");
  error.textContent = "";
  output.innerHTML = "";

  try {
    const { rootPc, intervals } = parseChord(chord);
    const chordPcs = chordPitches(rootPc, intervals);
    const { notes, pcs } = parseTuning(tuning);
    const fingerings = generateFingerings(pcs, chordPcs, rootPc, maxFret, maxResults);

    if (!fingerings.length) {
      output.textContent = "No chord fingerings found.";
      return;
    }

    fingerings.forEach((f, idx) => {
      const pre = document.createElement("pre");
      pre.textContent = drawAscii(`${chord} (shape ${idx + 1})`, notes, f, rootPc);
      output.appendChild(pre);
    });
  } catch (e) {
    error.textContent = e.message;
  }
});
