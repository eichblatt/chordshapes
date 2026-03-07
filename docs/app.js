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
  return { root, rootPc: NOTE_TO_PC[root], intervals: CHORD_QUALITIES[quality], quality };
}

function chordPitches(rootPc, intervals) {
  return intervals.map(i => (rootPc + i) % 12);
}

function intervalLabels(intervals) {
  const map = {
    0: "1",
    1: "b2",
    2: "2",
    3: "b3",
    4: "3",
    5: "4",
    6: "b5",
    7: "5",
    8: "#5",
    9: "6",
    10: "b7",
    11: "7",
  };
  return intervals.map(i => map[i % 12] || String(i));
}

function suggestQualities(quality) {
  const fallbackMap = {
    13: ["9", "7", ""],
    m13: ["m9", "m7", "m"],
    maj9: ["maj7", ""],
    9: ["7", ""],
    m9: ["m7", "m"],
    maj7: [""],
    7: [""],
    m7: ["m"],
    mMaj7: ["m"],
    dim: ["m"],
    aug: [""],
    sus2: [""],
    sus4: [""],
  };
  return fallbackMap[quality] || [];
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
  const baseFingers = fretted.length;
  let best = baseFingers;

  const minGroup = fretted.filter(i => frets[i] === minFret);
  if (minGroup.length > 1) {
    if (!frets.some(f => f === null || f === 0 || (f !== null && f < minFret))) {
      best = Math.min(best, 1 + (baseFingers - minGroup.length));
    }
  }

  if (maxFret != null && maxFret !== minFret) {
    const maxGroup = fretted.filter(i => frets[i] === maxFret).sort((a, b) => a - b);
    if (maxGroup.length > 1) {
      const contiguous = maxGroup.every((v, idx) => idx === 0 || v === maxGroup[idx - 1] + 1);
      const includesHighest = maxGroup[maxGroup.length - 1] === frets.length - 1;
      if (contiguous && includesHighest) {
        if (!frets.some(f => f === null || f === 0 || (f !== null && f < maxFret))) {
          best = Math.min(best, 1 + (baseFingers - maxGroup.length));
        }
      }
    }
  }

  return best;
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
      if (fingersUsed == null || fingersUsed > 4) return;

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
    const playedIndices = f.frets.map((fr, i) => (fr == null ? null : i)).filter(i => i != null);
    const lowestPlayed = playedIndices.length ? Math.min(...playedIndices) : null;
    for (let i = 0; i < f.frets.length; i++) {
      if (f.frets[i] === null) {
        const candidate = [...f.frets];
        candidate[i] = 0;
        if (set.has(JSON.stringify(candidate)) && (lowestPlayed == null || i > lowestPlayed)) return false;
      }
    }
    return true;
  });

  const filtered2 = filtered.filter(f => {
    const frets = f.frets;
    const baseFret = f.baseFret;
    const maxAllowed = baseFret + 3;
    let leadingMuted = 0;
    for (let i = 0; i < frets.length; i++) {
      if (frets[i] == null) leadingMuted += 1;
      else break;
    }
    let trailingMuted = 0;
    for (let i = frets.length - 1; i >= 0; i--) {
      if (frets[i] == null) trailingMuted += 1;
      else break;
    }

    for (let i = 0; i < frets.length; i++) {
      if (frets[i] == null && !(i < leadingMuted || i >= frets.length - trailingMuted)) {
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
    if (!rootLowest && played.length) {
      const lowest = Math.min(...played);
      const highest = Math.max(...played);
      if (frets[lowest] === 0 && (lowest === lowest || lowest === highest)) {
        const altPlayed = played.filter(i => i !== lowest);
        if (altPlayed.length) {
          const altUsed = altPlayed.map(idx => (tuningPcs[idx] + frets[idx]) % 12);
          const hasAll = chordPcs.every(pc => altUsed.includes(pc));
          if (hasAll) {
            const altLowest = Math.min(...altPlayed);
            const altLowestPc = (tuningPcs[altLowest] + frets[altLowest]) % 12;
            if (altLowestPc === rootPc) rootLowest = true;
          }
        }
      }
    }

    let inversionScore = 0;
    if (played.length) {
      const chordOrder = new Map(
        chordPcs
          .slice()
          .sort((a, b) => ((a - rootPc + 12) % 12) - ((b - rootPc + 12) % 12))
          .map((pc, idx) => [pc, idx])
      );
      let lastIdx = null;
      const ordered = played.slice().sort((a, b) => a - b);
      for (const idx of ordered) {
        const fr = frets[idx];
        if (fr == null) continue;
        const pc = (tuningPcs[idx] + fr) % 12;
        const orderIdx = chordOrder.get(pc);
        if (orderIdx == null) continue;
        if (lastIdx !== null && orderIdx < lastIdx) inversionScore += 1;
        lastIdx = orderIdx;
      }
    }

    const minFretValue = fretted.length ? Math.min(...fretted) : 0;
    const maxFretValue = fretted.length ? Math.max(...fretted) : 0;
    const fretSpan = fretted.length ? (maxFretValue - minFretValue) : 0;
    const frettedIndices = frets.map((fr, i) => (fr != null && fr !== 0 ? i : null)).filter(i => i != null);
    const stringSpan = frettedIndices.length ? (Math.max(...frettedIndices) - Math.min(...frettedIndices)) : 0;
    const spanScore = fretSpan + stringSpan;

    let leadingMuted = 0;
    for (let i = 0; i < frets.length; i++) {
      if (frets[i] == null) leadingMuted += 1;
      else break;
    }
    let trailingMuted = 0;
    for (let i = frets.length - 1; i >= 0; i--) {
      if (frets[i] == null) trailingMuted += 1;
      else break;
    }
    let endMuteDiscount = 0;
    if (leadingMuted > 0) endMuteDiscount += 1.0;
    if (trailingMuted > 0) endMuteDiscount += 0.5;
    const bothEndsMutedPenalty = (frets[0] == null && frets[frets.length - 1] == null) ? 1 : 0;
    const effectiveMutes = mutes - endMuteDiscount;
    const muteCountPenalty = mutes >= 3 ? 1 : 0;
    const effectiveFingers = fingers;

    const tailScore = (effectiveFingers * 10)
      + (rootLowest ? 0 : 12)
      + inversionScore
      + (baseFret * 10)
      + (effectiveMutes * 41)
      + spanScore
      + minFretValue;

    return [muteCountPenalty, bothEndsMutedPenalty, internalMutes * 100, tailScore];
  }

  const grouped = new Map();
  for (const f of filtered2) {
    const key = f.frets.map(fr => (fr == null ? 0 : fr)).join(",");
    const scoreVal = score(f);
    const existing = grouped.get(key);
    if (!existing || scoreVal < existing.scoreVal) {
      grouped.set(key, { scoreVal, best: f, variants: existing ? existing.variants.concat([f]) : [f] });
    } else {
      existing.variants.push(f);
    }
  }

  const deduped = [];
  for (const { best, variants } of grouped.values()) {
    const greyMutes = new Set();
    const greyOpens = new Set();
    for (let i = 0; i < best.frets.length; i++) {
      if (best.frets[i] == null) {
        if (variants.some(v => v.frets[i] === 0)) {
          greyMutes.add(i);
        }
      }
      if (best.frets[i] === 0) {
        const alt = best.frets.slice();
        alt[i] = null;
        const altPlayed = alt.map((fr, idx) => (fr == null ? null : idx)).filter(idx => idx != null);
        if (altPlayed.length) {
          const altLow = Math.min(...altPlayed);
          const altHigh = Math.max(...altPlayed);
          if (i === altLow || i === altHigh) {
            const altUsed = altPlayed.map(idx => (tuningPcs[idx] + alt[idx]) % 12);
            const hasAll = chordPcs.every(pc => altUsed.includes(pc));
            if (hasAll) {
              const altLowest = Math.min(...altPlayed);
              const altLowestPc = (tuningPcs[altLowest] + alt[altLowest]) % 12;
              if (altLowestPc === rootPc) {
                greyOpens.add(i);
              }
            }
          }
        }
      }
    }
    best.greyMutes = Array.from(greyMutes);
    best.greyOpens = Array.from(greyOpens);
    deduped.push(best);
  }

  deduped.sort((a, b) => {
    const sa = score(a), sb = score(b);
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return sa[i] - sb[i];
    }
    return 0;
  });

  return deduped.slice(0, maxResults);
}

function drawPng(title, tuningNotes, fingering, rootPc) {
  const frets = fingering.frets;
  const greyMutes = new Set(fingering.greyMutes || []);
  const greyOpens = new Set(fingering.greyOpens || []);
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
      ctx.strokeStyle = greyMutes.has(i) ? "#999" : "#111";
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
      ctx.strokeStyle = greyOpens.has(i) ? "#999" : (notePc === rootPc ? "#d62828" : "#111");
      ctx.lineWidth = 1.5;
      const y = marginTop + titlePadding - 10;
      const radius = 4;
      const interval = (notePc - rootPc + 12) % 12;
      const centerAngle = -Math.PI / 2 + interval * wedgeAngle;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      const tickLength = radius * 0.5;
      const x1 = x + Math.cos(centerAngle) * (radius - tickLength);
      const y1 = y + Math.sin(centerAngle) * (radius - tickLength);
      const x2 = x + Math.cos(centerAngle) * radius;
      const y2 = y + Math.sin(centerAngle) * radius;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
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
  const chordInfo = document.getElementById("chordInfo");
  const output = document.getElementById("output");
  error.textContent = "";
  chordInfo.textContent = "";
  output.innerHTML = "";

  try {
    const { root, rootPc, intervals, quality } = parseChord(chord);
    const labels = intervalLabels(intervals);
    chordInfo.textContent = `${chord} contains intervals: ${labels.join(", ")}`;
    const chordPcs = chordPitches(rootPc, intervals);
    const { notes, pcs } = parseTuning(tuning);
    const fingerings = generateFingerings(pcs, chordPcs, rootPc, maxFret, maxResults);

    if (!fingerings.length) {
      const fallbacks = suggestQualities(quality);
      for (const altQuality of fallbacks) {
        const altIntervals = CHORD_QUALITIES[altQuality];
        const altPcs = chordPitches(rootPc, altIntervals);
        const altFingerings = generateFingerings(pcs, altPcs, rootPc, maxFret, maxResults);
        if (altFingerings.length) {
          output.textContent = `No fingerings found for ${chord}. Showing nearest alternative ${root}${altQuality} (${intervalLabels(altIntervals).join(", ")}).`;
          return;
        }
      }
      output.textContent = `No fingerings found for ${chord}.`;
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
