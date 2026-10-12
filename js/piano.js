import { NOTES_LATIN, NOTES_ANGLO, BLACK_KEY_INDICES, midiToFreq } from './constants.js';

export const BOARD_START_MIDI = 24;
export const BOARD_END_MIDI = 108;

const SEMITONE_CENTERS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5];

export class PianoKeyboard {
  constructor(containerElement, audioEngine, options = {}) {
    this.container = containerElement;
    this.audioEngine = audioEngine;

    this.orientation = options.orientation || 'bottom';
    this.notation = options.notation || 'latin';
    this.showOctave = options.showOctave !== undefined ? options.showOctave : true;
    this.a4 = options.a4 || 440;

    this.visibleWhiteKeys = 21;

    this.whiteKeyMidiList = [];
    this.blackKeyMidiList = [];
    this.midiToWhiteIndex = new Map();

    for (let m = BOARD_START_MIDI; m <= BOARD_END_MIDI; m++) {
      const semitone = ((m % 12) + 12) % 12;
      if (!BLACK_KEY_INDICES.includes(semitone)) {
        this.midiToWhiteIndex.set(m, this.whiteKeyMidiList.length);
        this.whiteKeyMidiList.push(m);
      } else {
        this.blackKeyMidiList.push(m);
      }
    }

    this.totalWhiteKeys = this.whiteKeyMidiList.length;
    this.maxWhiteOffset = Math.max(0, this.totalWhiteKeys - this.visibleWhiteKeys);

    const initialStartMidi = options.startMidi || 48;
    const initialCenter = this.getCenterUnitForMidi(initialStartMidi);
    this.targetWhiteOffset = Math.max(0, Math.min(this.maxWhiteOffset, initialCenter - 0.5));
    this.currentWhiteOffset = this.targetWhiteOffset;
    this.keySize = 0;

    this.boardEl = null;
    this.keyElements = new Map();
    this.activeSungMidi = null;
    this.activePointerKeys = new Map();
    this.onKeyPlay = null;

    this.render();
    this.setupInteraction();
    this.setupResizeObserver();
  }

  getCenterUnitForMidi(continuousMidi) {
    if (continuousMidi === null || continuousMidi === undefined || isNaN(continuousMidi)) {
      return 0;
    }

    const baseMidi = Math.floor(continuousMidi);
    const frac = continuousMidi - baseMidi;

    const getUnitForInt = (m) => {
      const rel = m - BOARD_START_MIDI;
      const octRel = Math.floor(rel / 12);
      const semi = ((rel % 12) + 12) % 12;
      return octRel * 7 + SEMITONE_CENTERS[semi];
    };

    const cBase = getUnitForInt(baseMidi);
    if (frac === 0) return cBase;
    const cNext = getUnitForInt(baseMidi + 1);
    return cBase + frac * (cNext - cBase);
  }

  getNormalizedPositionForMidi(continuousMidi) {
    const center = this.getCenterUnitForMidi(continuousMidi);
    return (center - this.currentWhiteOffset) / this.visibleWhiteKeys;
  }

  ensureMidiInRange(continuousMidi) {
    if (!continuousMidi || isNaN(continuousMidi)) return false;

    const center = this.getCenterUnitForMidi(continuousMidi);
    const viewFrac = (center - this.currentWhiteOffset) / this.visibleWhiteKeys;

    if (viewFrac < 0.22) {

      const desired = center - (0.35 * this.visibleWhiteKeys);
      this.targetWhiteOffset = Math.max(0, Math.min(this.maxWhiteOffset, desired));
      return true;
    } else if (viewFrac > 0.78) {

      const desired = center - (0.65 * this.visibleWhiteKeys);
      this.targetWhiteOffset = Math.max(0, Math.min(this.maxWhiteOffset, desired));
      return true;
    }

    return false;
  }

  setPresetRange(startMidi, endMidi) {
    const startCenter = this.getCenterUnitForMidi(startMidi);
    const endCenter = this.getCenterUnitForMidi(endMidi);
    const mid = (startCenter + endCenter) / 2;
    this.targetWhiteOffset = Math.max(0, Math.min(this.maxWhiteOffset, mid - this.visibleWhiteKeys / 2));
  }

  setRange(startMidi, endMidi) {
    this.setPresetRange(startMidi, endMidi);
  }

  update(dt) {
    const diff = this.targetWhiteOffset - this.currentWhiteOffset;
    if (Math.abs(diff) > 0.0001) {

      const lerpSpeed = 5.5;
      const factor = 1 - Math.exp(-lerpSpeed * Math.min(0.1, dt));
      this.currentWhiteOffset += diff * factor;
      this.applyTransform();
    }
  }

  applyTransform() {
    if (!this.boardEl || !this.keySize) return;

    if (this.orientation === 'bottom') {
      const tx = -this.currentWhiteOffset * this.keySize;
      this.boardEl.style.transform = `translate3d(${tx.toFixed(2)}px, 0, 0)`;
    } else {
      const ty = this.currentWhiteOffset * this.keySize;
      this.boardEl.style.transform = `translate3d(0, ${ty.toFixed(2)}px, 0)`;
    }
  }

  setOrientation(orientation) {
    if (this.orientation !== orientation) {
      this.orientation = orientation;
      const isBottom = this.orientation === 'bottom';
      this.container.className = `piano-container ${isBottom ? 'piano-bottom' : 'piano-left'}`;
      this.layoutKeys();
    }
  }

  setNotation(notation, showOctave) {
    this.notation = notation;
    if (showOctave !== undefined) this.showOctave = showOctave;
    this.updateKeyLabels();
  }

  setupResizeObserver() {
    const handleResize = () => {
      this.layoutKeys();
    };

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(handleResize);
      ro.observe(this.container);
    }
    window.addEventListener('resize', handleResize);
  }

  render() {
    this.container.innerHTML = '';
    this.keyElements.clear();

    const isBottom = this.orientation === 'bottom';
    this.container.className = `piano-container ${isBottom ? 'piano-bottom' : 'piano-left'}`;

    this.boardEl = document.createElement('div');
    this.boardEl.className = 'piano-board';

    const whiteKeysGroup = document.createElement('div');
    whiteKeysGroup.className = 'white-keys-layer';

    const blackKeysGroup = document.createElement('div');
    blackKeysGroup.className = 'black-keys-layer';

    this.boardEl.appendChild(whiteKeysGroup);
    this.boardEl.appendChild(blackKeysGroup);

    for (let i = 0; i < this.whiteKeyMidiList.length; i++) {
      const midi = this.whiteKeyMidiList[i];
      const semitone = ((midi % 12) + 12) % 12;
      const octave = Math.floor(midi / 12) - 1;

      const keyEl = document.createElement('div');
      keyEl.className = 'piano-key white-key';
      keyEl.dataset.midi = midi;
      keyEl.dataset.isBlack = 'false';

      if (semitone === 0) {
        keyEl.classList.add('is-c-key');
      }

      const label = document.createElement('span');
      label.className = 'key-label';
      label.textContent = this.formatKeyLabel(semitone, octave);
      keyEl.appendChild(label);

      const led = document.createElement('div');
      led.className = 'key-glow-indicator';
      keyEl.appendChild(led);

      whiteKeysGroup.appendChild(keyEl);
      this.keyElements.set(midi, keyEl);
    }

    for (let b = 0; b < this.blackKeyMidiList.length; b++) {
      const midi = this.blackKeyMidiList[b];

      const keyEl = document.createElement('div');
      keyEl.className = 'piano-key black-key';
      keyEl.dataset.midi = midi;
      keyEl.dataset.isBlack = 'true';

      const led = document.createElement('div');
      led.className = 'key-glow-indicator';
      keyEl.appendChild(led);

      blackKeysGroup.appendChild(keyEl);
      this.keyElements.set(midi, keyEl);
    }

    this.container.appendChild(this.boardEl);
    this.layoutKeys();
  }

  layoutKeys() {
    if (!this.boardEl) return;
    const isBottom = this.orientation === 'bottom';
    const rect = this.container.getBoundingClientRect();
    const w = rect.width || this.container.clientWidth || window.innerWidth;
    const h = rect.height || this.container.clientHeight || 150;

    if (isBottom) {
      this.keySize = w / this.visibleWhiteKeys;
      const totalW = this.totalWhiteKeys * this.keySize;
      this.boardEl.style.width = `${totalW}px`;
      this.boardEl.style.height = '100%';

      for (let i = 0; i < this.whiteKeyMidiList.length; i++) {
        const midi = this.whiteKeyMidiList[i];
        const keyEl = this.keyElements.get(midi);
        if (keyEl) {
          keyEl.style.left = `${(i * this.keySize).toFixed(1)}px`;
          keyEl.style.width = `${this.keySize.toFixed(1)}px`;
          keyEl.style.bottom = '0';
          keyEl.style.height = '100%';
          keyEl.style.top = '';
          keyEl.style.right = '';
        }
      }

      for (let b = 0; b < this.blackKeyMidiList.length; b++) {
        const midi = this.blackKeyMidiList[b];
        const keyEl = this.keyElements.get(midi);
        if (keyEl) {
          const center = this.getCenterUnitForMidi(midi);
          const bw = this.keySize * 0.65;
          keyEl.style.left = `${(center * this.keySize - bw / 2).toFixed(1)}px`;
          keyEl.style.width = `${bw.toFixed(1)}px`;
          keyEl.style.top = '0';
          keyEl.style.height = '60%';
          keyEl.style.bottom = '';
          keyEl.style.right = '';
        }
      }
    } else {

      this.keySize = h / this.visibleWhiteKeys;
      const totalH = this.totalWhiteKeys * this.keySize;
      this.boardEl.style.width = '100%';
      this.boardEl.style.height = `${totalH}px`;

      for (let i = 0; i < this.whiteKeyMidiList.length; i++) {
        const midi = this.whiteKeyMidiList[i];
        const keyEl = this.keyElements.get(midi);
        if (keyEl) {
          keyEl.style.left = '0';
          keyEl.style.width = '100%';
          keyEl.style.bottom = `${(i * this.keySize).toFixed(1)}px`;
          keyEl.style.height = `${this.keySize.toFixed(1)}px`;
          keyEl.style.top = '';
          keyEl.style.right = '';
        }
      }

      for (let b = 0; b < this.blackKeyMidiList.length; b++) {
        const midi = this.blackKeyMidiList[b];
        const keyEl = this.keyElements.get(midi);
        if (keyEl) {
          const center = this.getCenterUnitForMidi(midi);
          const bh = this.keySize * 0.65;
          keyEl.style.right = '0';
          keyEl.style.left = 'auto';
          keyEl.style.width = '60%';
          keyEl.style.bottom = `${(center * this.keySize - bh / 2).toFixed(1)}px`;
          keyEl.style.height = `${bh.toFixed(1)}px`;
          keyEl.style.top = '';
        }
      }
    }

    this.applyTransform();
  }

  formatKeyLabel(semitone, octave) {
    const noteNames = this.notation === 'latin' ? NOTES_LATIN : NOTES_ANGLO;
    const base = noteNames[semitone];
    return this.showOctave ? `${base}${octave}` : base;
  }

  updateKeyLabels() {
    for (let i = 0; i < this.whiteKeyMidiList.length; i++) {
      const midi = this.whiteKeyMidiList[i];
      const keyEl = this.keyElements.get(midi);
      if (!keyEl) continue;
      const semitone = ((midi % 12) + 12) % 12;
      const octave = Math.floor(midi / 12) - 1;
      const label = keyEl.querySelector('.key-label');
      if (label) {
        label.textContent = this.formatKeyLabel(semitone, octave);
      }
    }
  }

  setupInteraction() {
    const board = this.container;

    const getKeyFromEvent = (e) => {
      if (e.target && e.target.closest) {
        const directKey = e.target.closest('.piano-key');
        if (directKey && directKey.dataset.midi) {
          return parseInt(directKey.dataset.midi, 10);
        }
      }
      if (e.clientX !== undefined && e.clientY !== undefined) {
        const pointEl = document.elementFromPoint(e.clientX, e.clientY);
        if (pointEl && pointEl.closest) {
          const pointKey = pointEl.closest('.piano-key');
          if (pointKey && pointKey.dataset.midi) {
            return parseInt(pointKey.dataset.midi, 10);
          }
        }
      }
      return null;
    };

    const handlePointerDown = (e) => {
      if (e.cancelable) e.preventDefault();
      try {
        board.setPointerCapture(e.pointerId);
      } catch (_) {}
      const midi = getKeyFromEvent(e);
      if (midi !== null && !isNaN(midi)) {
        this.pressKey(midi, e.pointerId);
      }
    };

    const handlePointerMove = (e) => {
      if (!this.activePointerKeys.has(e.pointerId)) return;
      const currentMidi = this.activePointerKeys.get(e.pointerId);
      const newMidi = getKeyFromEvent(e);

      if (newMidi !== currentMidi) {
        if (currentMidi !== null) {
          this.releaseKey(currentMidi, e.pointerId);
        }
        if (newMidi !== null && !isNaN(newMidi)) {
          this.pressKey(newMidi, e.pointerId);
        }
      }
    };

    const handlePointerUp = (e) => {
      try {
        board.releasePointerCapture(e.pointerId);
      } catch (_) {}
      const midi = this.activePointerKeys.get(e.pointerId);
      if (midi !== undefined) {
        this.releaseKey(midi, e.pointerId);
      }
    };

    board.addEventListener('pointerdown', handlePointerDown);
    board.addEventListener('pointermove', handlePointerMove);
    board.addEventListener('pointerup', handlePointerUp);
    board.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }

  pressKey(midi, pointerId) {
    this.activePointerKeys.set(pointerId, midi);
    const keyEl = this.keyElements.get(midi);
    if (keyEl) {
      keyEl.classList.add('is-pressed');
    }

    const freq = midiToFreq(midi, this.a4);
    this.audioEngine.startTone(freq, `pointer_${pointerId}`);

    if (this.onKeyPlay) {
      this.onKeyPlay(midi, freq);
    }
  }

  releaseKey(midi, pointerId) {
    this.activePointerKeys.delete(pointerId);
    const keyEl = this.keyElements.get(midi);
    if (keyEl) {
      keyEl.classList.remove('is-pressed');
    }

    this.audioEngine.stopTone(`pointer_${pointerId}`, 0.28);
  }

  setSungNote(midi) {
    if (this.activeSungMidi === midi) return;

    if (this.activeSungMidi !== null) {
      const prevEl = this.keyElements.get(this.activeSungMidi);
      if (prevEl) {
        prevEl.classList.remove('is-sung');
      }
    }

    this.activeSungMidi = midi;

    if (midi !== null) {
      const nextEl = this.keyElements.get(midi);
      if (nextEl) {
        nextEl.classList.add('is-sung');
      }
    }
  }
}

