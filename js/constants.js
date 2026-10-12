export const NOTES_ANGLO = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTES_LATIN = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

export const BLACK_KEY_INDICES = [1, 3, 6, 8, 10];

export const VOCAL_RANGES = {
  soprano: { name: 'Soprano (C4 - C6)', startMidi: 60, endMidi: 84 },
  alto: { name: 'Mezzo / Contralto (G3 - F5)', startMidi: 55, endMidi: 77 },
  tenor: { name: 'Tenor (C3 - A4)', startMidi: 48, endMidi: 69 },
  bass: { name: 'Barítono / Bajo (E2 - E4)', startMidi: 40, endMidi: 64 },
  vocalStandard: { name: 'Vocal Estándar (C3 - B5)', startMidi: 48, endMidi: 83 },
  fullRange: { name: 'Rango Amplio (C2 - C6)', startMidi: 36, endMidi: 84 }
};

export const DEFAULT_SETTINGS = {
  theme: 'system',
  notation: 'latin',
  showOctave: true,
  direction: 'keys-to-out',
  vocalFilter: false,
  noiseGate: 0.003,
  yinThreshold: 0.20,
  a4Frequency: 440,
  pianoRange: 'vocalStandard',
  pianoOrientation: 'bottom'
};

export function midiToFreq(midi, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq, a4 = 440) {
  if (freq <= 0) return 0;
  return 69 + 12 * Math.log2(freq / a4);
}

export function getNoteDetails(freq, notation = 'latin', showOctave = true, a4 = 440) {
  if (!freq || freq <= 0 || !isFinite(freq)) {
    return null;
  }

  const continuousMidi = freqToMidi(freq, a4);
  const nearestMidi = Math.round(continuousMidi);
  const cents = Math.round((continuousMidi - nearestMidi) * 100);

  const noteIndex = ((nearestMidi % 12) + 12) % 12;
  const octave = Math.floor(nearestMidi / 12) - 1;

  const nameArray = notation === 'latin' ? NOTES_LATIN : NOTES_ANGLO;
  const altNameArray = notation === 'latin' ? NOTES_ANGLO : NOTES_LATIN;

  const baseName = nameArray[noteIndex];
  const altBaseName = altNameArray[noteIndex];

  const displayName = showOctave ? `${baseName}${octave}` : baseName;
  const altDisplayName = showOctave ? `${altBaseName}${octave}` : altBaseName;
  const targetFreq = midiToFreq(nearestMidi, a4);

  const isSharp = baseName.includes('#');

  const isPerfect = Math.abs(cents) <= 5;
  const isClose = Math.abs(cents) <= 15;

  return {
    pitch: freq,
    frequency: freq,
    continuousMidi,
    midi: nearestMidi,
    noteIndex,
    octave,
    cents,
    isPerfect,
    isClose,
    isSharp,
    name: displayName,
    baseName,
    altName: altDisplayName,
    targetFreq
  };
}

