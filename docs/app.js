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
  "9": [0, 4, 7, 10, 2],
  "maj9": [0, 4, 7, 11, 2],
  "m9": [0, 3, 7, 10, 2],
  "13": [0, 4, 7, 10, 2, 5, 9],
  "maj13": [0, 4, 7, 11, 2, 5, 9],
  "m13": [0, 3, 7, 10, 2, 5, 9],
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
  const frets = [];
  if (chordPcs.includes(stringPc)) frets.push(0);
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

  const filtered2 = filtered.filter(f => {
    const frets = f.frets;
    const baseFret = f.baseFret;
    const maxAllowed = baseFret + 3;
    for (let i = 0; i < frets.length; i++) {
      if (frets[i] == null) {
        const stringPc = tuningPcs[i];
        for (let fret = baseFret; fret <= maxAllowed; fret++) {
          if (chordPcs.includes((stringPc + fret) % 12)) {
            return false;
          }
        }
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

  filtered2.sort((a, b) => {
    const sa = score(a), sb = score(b);
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return sa[i] - sb[i];
    }
    return 0;
  });

  return filtered2.slice(0, maxResults);
}

function drawPng(title, tuningNotes, fingering, rootPc) {
  const frets = fingering.frets;
  const baseFret = fingering.baseFret;
  const strings = frets.length;

  const scale = 0.3;
  const width = Math.round(360 * scale);
  const height = Math.round(560 * scale);
  const marginX = Math.round(40 * scale);
  const marginTop = Math.round(70 * scale);
  const titlePadding = Math.round(height * 0.18);
  const bottomPadding = Math.round(height * 0.08);
  const gridWidth = width - marginX * 2;
  const gridHeight = Math.round(320 * scale);
  const stringGap = gridWidth / (strings - 1);
  const fretGap = gridHeight / 4;

  const renderScale = 3;
  const canvas = document.createElement("canvas");
  canvas.width = width * renderScale;
  canvas.height = height * renderScale;
  const ctx = canvas.getContext("2d");
  ctx.scale(renderScale, renderScale);

  const dotRadius = 8;
  const wedgeAngle = (30 * Math.PI) / 180;

  function drawWedge(x, y, centerAngle) {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, dotRadius + 1, centerAngle - wedgeAngle / 2, centerAngle + wedgeAngle / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#111";
  ctx.font = "bold 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, width / 2, titlePadding);

  // Grid: strings (vertical)
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 1;
  for (let i = 0; i < strings; i++) {
    const x = marginX + i * stringGap;
    ctx.beginPath();
    ctx.moveTo(x, marginTop + titlePadding);
    ctx.lineTo(x, marginTop + titlePadding + gridHeight);
    ctx.stroke();
  }

  // Grid: frets (horizontal)
  for (let i = 0; i <= 4; i++) {
    const y = marginTop + titlePadding + i * fretGap;
    ctx.beginPath();
    ctx.moveTo(marginX, y);
    ctx.lineTo(marginX + gridWidth, y);
    ctx.stroke();
  }

  // Base fret label
  if (baseFret > 1) {
    ctx.save();
    ctx.textAlign = "left";
    ctx.fillText(`${baseFret}`, marginX - 12, marginTop + titlePadding + 8);
    ctx.restore();
  }

  // X/O markers
  frets.forEach((fret, i) => {
    const x = marginX + i * stringGap;
    if (fret == null) {
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 1.5;
      const size = 4;
      const y = marginTop + titlePadding - 10;
      ctx.beginPath();
      ctx.moveTo(x - size, y - size);
      ctx.lineTo(x + size, y + size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - size, y + size);
      ctx.lineTo(x + size, y - size);
      ctx.stroke();
    } else if (fret === 0) {
      const notePc = (NOTE_TO_PC[tuningNotes[i]] + fret) % 12;
      ctx.strokeStyle = notePc === rootPc ? "#d62828" : "#111";
      ctx.lineWidth = 1.5;
      const y = marginTop + titlePadding - 10;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // Dots
  frets.forEach((fret, i) => {
    if (fret == null || fret === 0) return;
    if (fret < baseFret || fret > baseFret + 3) return;
    const x = marginX + i * stringGap;
    const y = marginTop + titlePadding + (fret - baseFret + 0.5) * fretGap;
    const notePc = (NOTE_TO_PC[tuningNotes[i]] + fret) % 12;
    const isRoot = notePc === rootPc;
    ctx.fillStyle = isRoot ? "#d62828" : "#111";
    ctx.beginPath();
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    if (!isRoot) {
      const interval = (notePc - rootPc + 12) % 12;
      const centerAngle = -Math.PI / 2 + interval * wedgeAngle;
      drawWedge(x, y, centerAngle);
    }
  });

  // String labels (bottom)
  ctx.fillStyle = "#111";
  ctx.font = "12px system-ui, sans-serif";
  tuningNotes.forEach((note, i) => {
    const x = marginX + i * stringGap;
    ctx.fillText(note, x, marginTop + titlePadding + gridHeight + bottomPadding);
  });

  return canvas.toDataURL("image/png");
}

document.getElementById("go").addEventListener("click", () => {
  const chord = document.getElementById("chord").value.trim();
  const tuning = document.getElementById("tuning").value.trim();
  const maxFret = parseInt(document.getElementById("maxFret").value, 10);
  const maxResults = 100;

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
      const img = document.createElement("img");
      img.alt = `${chord}`;
      img.src = drawPng(`${chord}`, notes, f, rootPc);
      img.style.display = "block";
      img.style.marginBottom = "12px";
      output.appendChild(img);
    });
  } catch (e) {
    error.textContent = e.message;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.getElementById("go").click();
  }
});
