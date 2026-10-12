import { DEFAULT_SETTINGS, VOCAL_RANGES, getNoteDetails } from './constants.js';
import { YINDetector } from './yin.js';
import { AudioEngine } from './audio.js';
import { PianoKeyboard } from './piano.js';
import { WaterfallRenderer } from './waterfall.js';
import { TunerRenderer } from './tuner.js';

class NoteVisualizerApp {
  constructor() {
    this.settings = this.loadSettings();

    this.audioEngine = new AudioEngine();
    this.yinDetector = new YINDetector({
      threshold: this.settings.yinThreshold,
      noiseGate: this.settings.noiseGate
    });

    this.currentView = 'cascada';
    this.lastPitchDetails = null;

    this.initDOM();
    this.initComponents();
    this.bindEvents();
    this.startMainLoop();
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('note_visualizer_settings');
      if (saved) {
        return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(saved));
      }
    } catch (_) {}
    return Object.assign({}, DEFAULT_SETTINGS);
  }

  saveSettings() {
    try {
      localStorage.setItem('note_visualizer_settings', JSON.stringify(this.settings));
    } catch (_) {}
  }

  initDOM() {

    this.views = {
      cascada: document.getElementById('view-cascada'),
      afinador: document.getElementById('view-afinador'),
      config: document.getElementById('view-config')
    };

    this.navButtons = document.querySelectorAll('.mode-tab, .nav-button, .nav-tab-btn');

    this.btnMicToggle = document.getElementById('btn-mic-toggle');
    this.micStatusBadge = document.getElementById('mic-status-badge');

    this.tunerNoteName = document.getElementById('tuner-note-name');
    this.tunerAltNote = document.getElementById('tuner-alt-note');
    this.tunerFreq = document.getElementById('tuner-freq');
    this.tunerTargetFreq = document.getElementById('tuner-target-freq');
    this.tunerCents = document.getElementById('tuner-cents');
    this.tunerBadge = document.getElementById('tuner-badge');

    this.settingThemeDark = document.getElementById('setting-theme-dark');
    this.settingThemeLight = document.getElementById('setting-theme-light');
    this.settingThemeSystem = document.getElementById('setting-theme-system');
    this.settingShowOctave = document.getElementById('setting-show-octave');
    this.settingNotationLatin = document.getElementById('setting-notation-latin');
    this.settingNotationAnglo = document.getElementById('setting-notation-anglo');
    this.settingDirectionOut = document.getElementById('setting-direction-out');
    this.settingDirectionIn = document.getElementById('setting-direction-in');
    this.settingVocalFilter = document.getElementById('setting-vocal-filter');
    this.settingNoiseGate = document.getElementById('setting-noise-gate');
    this.settingGateVal = document.getElementById('gate-val-display');
    this.settingPianoRange = document.getElementById('setting-piano-range');
    this.settingPianoOrientation = document.getElementById('setting-piano-orientation');
    this.labelDirectionOut = document.getElementById('label-direction-out');
    this.labelDirectionIn = document.getElementById('label-direction-in');
    this.gateMeterFill = document.getElementById('gate-meter-fill');
    this.gateThresholdLine = document.getElementById('gate-threshold-line');

    this.headerNoteBadge = document.getElementById('header-note-badge');

    this.btnToggleDirection = document.getElementById('btn-toggle-direction');
    this.dirIcon = document.getElementById('dir-icon');
    this.dirLabel = document.getElementById('dir-label');
  }

  initComponents() {
    const range = VOCAL_RANGES[this.settings.pianoRange] || VOCAL_RANGES.vocalStandard;

    const cascadaView = document.getElementById('view-cascada');
    if (cascadaView) {
      cascadaView.classList.remove('layout-bottom', 'layout-left');
      cascadaView.classList.add(`layout-${this.settings.pianoOrientation}`);
    }

    const pianoContainer = document.getElementById('piano-container');
    this.piano = new PianoKeyboard(pianoContainer, this.audioEngine, {
      startMidi: range.startMidi,
      endMidi: range.endMidi,
      orientation: this.settings.pianoOrientation,
      notation: this.settings.notation,
      showOctave: this.settings.showOctave,
      a4: this.settings.a4Frequency
    });

    const waterfallCanvas = document.getElementById('waterfall-canvas');
    this.waterfall = new WaterfallRenderer(waterfallCanvas, this.piano, {
      direction: this.settings.direction,
      notation: this.settings.notation,
      showOctave: this.settings.showOctave
    });
    this.waterfall.start();

    const tunerCanvas = document.getElementById('tuner-canvas');
    const scopeCanvas = document.getElementById('scope-canvas');
    this.tuner = new TunerRenderer(tunerCanvas, scopeCanvas, {
      notation: this.settings.notation,
      showOctave: this.settings.showOctave
    });

    this.audioEngine.setVocalFilter(this.settings.vocalFilter);
    this.yinDetector.setNoiseGate(this.settings.noiseGate);

    this.applyTheme();
    this.syncSettingsUI();
  }

  applyTheme() {
    const mode = this.settings.theme || 'system';
    let resolved = mode;
    if (mode === 'system') {
      const isSystemDark = this.mediaQueryDark 
        ? this.mediaQueryDark.matches 
        : (window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true);
      resolved = isSystemDark ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    const isLight = resolved === 'light';
    if (this.waterfall && this.waterfall.setLightMode) {
      this.waterfall.setLightMode(isLight);
    }
    if (this.tuner && this.tuner.setLightMode) {
      this.tuner.setLightMode(isLight);
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', isLight ? '#f1f3f8' : '#08090d');
    }
  }

  syncSettingsUI() {
    if (this.settingThemeDark && this.settingThemeLight && this.settingThemeSystem) {
      const currentTheme = this.settings.theme || 'system';
      this.settingThemeDark.checked = currentTheme === 'dark';
      this.settingThemeLight.checked = currentTheme === 'light';
      this.settingThemeSystem.checked = currentTheme === 'system';
    }

    if (this.settingShowOctave) this.settingShowOctave.checked = this.settings.showOctave;
    if (this.settingVocalFilter) this.settingVocalFilter.checked = this.settings.vocalFilter;

    if (this.settingNotationLatin && this.settingNotationAnglo) {
      this.settingNotationLatin.checked = this.settings.notation === 'latin';
      this.settingNotationAnglo.checked = this.settings.notation === 'anglo';
    }

    if (this.settingDirectionOut && this.settingDirectionIn) {
      this.settingDirectionOut.checked = this.settings.direction === 'keys-to-out';
      this.settingDirectionIn.checked = this.settings.direction === 'out-to-keys';
    }

    if (this.settingNoiseGate) {
      this.settingNoiseGate.value = this.settings.noiseGate;
      if (this.settingGateVal) this.settingGateVal.textContent = `${Math.round(this.settings.noiseGate * 1000)} mV`;
      this.updateGateThresholdMarker();
    }

    if (this.settingPianoRange) {
      this.settingPianoRange.value = this.settings.pianoRange;
    }

    if (this.settingPianoOrientation) {
      this.settingPianoOrientation.value = this.settings.pianoOrientation;
    }

    this.updateDirectionButtonUI();
    this.updateDirectionSettingsLabels();
  }

  updateDirectionSettingsLabels() {
    const isBottom = this.settings.pianoOrientation === 'bottom';
    if (this.labelDirectionOut) {
      this.labelDirectionOut.textContent = isBottom
        ? 'Salir del piano (Abajo a Arriba)'
        : 'Salir del piano (Izquierda a Derecha)';
    }
    if (this.labelDirectionIn) {
      this.labelDirectionIn.textContent = isBottom
        ? 'Hacia el piano (Arriba a Abajo)'
        : 'Hacia el piano (Derecha a Izquierda)';
    }
  }

  updateDirectionButtonUI() {
    if (!this.dirIcon || !this.dirLabel) return;
    const isOut = this.settings.direction === 'keys-to-out';
    const isBottom = this.settings.pianoOrientation === 'bottom';

    if (isBottom) {
      this.dirIcon.textContent = isOut ? '↑' : '↓';
      this.dirLabel.textContent = isOut ? 'DE ABAJO A ARRIBA' : 'DE ARRIBA A ABAJO';
    } else {
      this.dirIcon.textContent = isOut ? '→' : '←';
      this.dirLabel.textContent = isOut ? 'DESDE EL PIANO' : 'HACIA EL PIANO';
    }
  }

  bindEvents() {

    this.navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetView = btn.dataset.view;
        this.switchView(targetView);
      });
    });

    if (this.btnMicToggle) {
      this.btnMicToggle.addEventListener('click', () => this.toggleMicrophone());
    }

    const stageClick = document.getElementById('waterfall-stage-click');
    if (stageClick) {
      stageClick.addEventListener('click', () => {
        if (!this.audioEngine.isMicActive) {
          this.toggleMicrophone();
        }
      });
    }

    const tunerCanvas = document.getElementById('tuner-canvas');
    if (tunerCanvas) {
      tunerCanvas.addEventListener('click', () => {
        if (!this.audioEngine.isMicActive) {
          this.toggleMicrophone();
        }
      });
    }

    this.audioEngine.onStateChange = (state) => {
      this.updateMicUI(state.isMicActive);
    };

    this.audioEngine.onError = (err) => {
      alert(`No se pudo acceder al micrófono: ${err.message || 'Permiso denegado'}`);
      this.updateMicUI(false);
    };

    const onThemeChange = (val) => {
      this.settings.theme = val;
      this.saveSettings();
      this.applyTheme();
    };

    if (this.settingThemeDark) {
      this.settingThemeDark.addEventListener('change', () => onThemeChange('dark'));
    }
    if (this.settingThemeLight) {
      this.settingThemeLight.addEventListener('change', () => onThemeChange('light'));
    }
    if (this.settingThemeSystem) {
      this.settingThemeSystem.addEventListener('change', () => onThemeChange('system'));
    }

    if (window.matchMedia) {
      this.mediaQueryDark = window.matchMedia('(prefers-color-scheme: dark)');
      if (this.mediaQueryDark.addEventListener) {
        this.mediaQueryDark.addEventListener('change', () => {
          if ((this.settings.theme || 'system') === 'system') {
            this.applyTheme();
          }
        });
      }
    }

    if (this.settingShowOctave) {
      this.settingShowOctave.addEventListener('change', (e) => {
        this.settings.showOctave = e.target.checked;
        this.saveSettings();
        this.piano.setNotation(this.settings.notation, this.settings.showOctave);
        this.waterfall.setNotation(this.settings.notation, this.settings.showOctave);
        this.tuner.setNotation(this.settings.notation, this.settings.showOctave);
        this.updateHeaderNoteBadge(this.lastPitchDetails);
      });
    }

    const onNotationChange = (val) => {
      this.settings.notation = val;
      this.saveSettings();
      this.piano.setNotation(this.settings.notation, this.settings.showOctave);
      this.waterfall.setNotation(this.settings.notation, this.settings.showOctave);
      this.tuner.setNotation(this.settings.notation, this.settings.showOctave);
      this.updateHeaderNoteBadge(this.lastPitchDetails);
    };

    if (this.settingNotationLatin) {
      this.settingNotationLatin.addEventListener('change', () => onNotationChange('latin'));
    }
    if (this.settingNotationAnglo) {
      this.settingNotationAnglo.addEventListener('change', () => onNotationChange('anglo'));
    }

    const onDirectionChange = (val) => {
      this.settings.direction = val;
      this.saveSettings();
      this.waterfall.setDirection(val);
      this.updateDirectionButtonUI();
    };

    if (this.settingDirectionOut) {
      this.settingDirectionOut.addEventListener('change', () => onDirectionChange('keys-to-out'));
    }
    if (this.settingDirectionIn) {
      this.settingDirectionIn.addEventListener('change', () => onDirectionChange('out-to-keys'));
    }

    if (this.btnToggleDirection) {
      this.btnToggleDirection.addEventListener('click', (e) => {
        e.stopPropagation();
        const nextVal = this.settings.direction === 'keys-to-out' ? 'out-to-keys' : 'keys-to-out';
        onDirectionChange(nextVal);
        if (this.settingDirectionOut && this.settingDirectionIn) {
          this.settingDirectionOut.checked = nextVal === 'keys-to-out';
          this.settingDirectionIn.checked = nextVal === 'out-to-keys';
        }
      });
    }

    if (this.settingVocalFilter) {
      this.settingVocalFilter.addEventListener('change', (e) => {
        this.settings.vocalFilter = e.target.checked;
        this.saveSettings();
        this.audioEngine.setVocalFilter(this.settings.vocalFilter);
      });
    }

    if (this.settingNoiseGate) {
      this.settingNoiseGate.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.settings.noiseGate = val;
        this.saveSettings();
        this.yinDetector.setNoiseGate(val);
        if (this.settingGateVal) {
          this.settingGateVal.textContent = `${Math.round(val * 1000)} mV`;
        }
        this.updateGateThresholdMarker();
      });
    }

    if (this.settingPianoRange) {
      this.settingPianoRange.addEventListener('change', (e) => {
        const rangeKey = e.target.value;
        this.settings.pianoRange = rangeKey;
        this.saveSettings();
        const r = VOCAL_RANGES[rangeKey] || VOCAL_RANGES.vocalStandard;
        this.piano.setPresetRange(r.startMidi, r.endMidi);
      });
    }

    if (this.settingPianoOrientation) {
      this.settingPianoOrientation.addEventListener('change', (e) => {
        const ori = e.target.value;
        this.settings.pianoOrientation = ori;
        this.saveSettings();
        this.piano.setOrientation(ori);
        const container = document.getElementById('view-cascada');
        if (container) {
          container.className = `view-screen active layout-${ori}`;
        }
        if (this.waterfall.resize) this.waterfall.resize();
        this.updateDirectionButtonUI();
        this.updateDirectionSettingsLabels();
      });
    }
  }

  updateGateThresholdMarker() {
    if (this.gateThresholdLine) {

      const pct = Math.min(100, Math.max(0, (this.settings.noiseGate / 0.06) * 100));
      this.gateThresholdLine.style.left = `${pct}%`;
    }
  }

  switchView(viewName) {
    if (!this.views[viewName]) return;
    this.currentView = viewName;

    this.navButtons.forEach(btn => {
      if (btn.dataset.view === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    Object.keys(this.views).forEach(k => {
      if (k === viewName) {
        this.views[k].classList.add('active');
      } else {
        this.views[k].classList.remove('active');
      }
    });

    if (viewName === 'cascada') {
      const cascadaView = document.getElementById('view-cascada');
      if (cascadaView) {
        cascadaView.classList.remove('layout-bottom', 'layout-left');
        cascadaView.classList.add(`layout-${this.settings.pianoOrientation}`);
      }
      if (this.piano && this.piano.layoutKeys) {
        this.piano.layoutKeys();
      }
      if (this.waterfall && this.waterfall.resize) {
        this.waterfall.resize();
        setTimeout(() => {
          if (this.piano && this.piano.layoutKeys) this.piano.layoutKeys();
          this.waterfall.resize();
        }, 30);
      }
    } else if (viewName === 'afinador' && this.tuner.resize) {
      setTimeout(() => this.tuner.resize(), 30);
    }
  }

  async toggleMicrophone() {
    if (this.audioEngine.isMicActive) {
      this.audioEngine.stopMic();
    } else {
      try {
        await this.audioEngine.startMic();

        if (this.audioEngine.audioContext) {
          this.yinDetector.setSampleRate(this.audioEngine.audioContext.sampleRate);
        }
      } catch (err) {
        console.error(err);
      }
    }
  }

  updateMicUI(isActive) {
    if (this.btnMicToggle) {
      if (isActive) {
        this.btnMicToggle.classList.add('is-active');
        this.btnMicToggle.innerHTML = `
          <span id="mic-status-badge" class="hardware-led live"></span>
          <span class="btn-text">MIC: LIVE</span>
        `;
      } else {
        this.btnMicToggle.classList.remove('is-active');
        this.btnMicToggle.innerHTML = `
          <span id="mic-status-badge" class="hardware-led"></span>
          <span class="btn-text">ACTIVAR MIC</span>
        `;
      }
      this.micStatusBadge = document.getElementById('mic-status-badge');
    }
  }

  startMainLoop() {
    let lastTime = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (this.piano && this.piano.update) {
        this.piano.update(dt);
      }

      this.processAudioFrame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  processAudioFrame() {
    const isMicOn = this.audioEngine.isMicActive;
    let timeDomain = null;
    let detectedNote = null;

    if (isMicOn) {
      timeDomain = this.audioEngine.getTimeDomainData();
      if (timeDomain) {
        const yinResult = this.yinDetector.detect(timeDomain);

        if (this.gateMeterFill) {
          const rmsPct = Math.min(100, (yinResult.rms / 0.03) * 100);
          this.gateMeterFill.style.width = `${rmsPct}%`;
          if (yinResult.rms < this.settings.noiseGate) {
            this.gateMeterFill.classList.add('gated');
          } else {
            this.gateMeterFill.classList.remove('gated');
          }
        }

        if (yinResult.pitch && yinResult.confidence >= (1 - this.settings.yinThreshold)) {
          detectedNote = getNoteDetails(
            yinResult.pitch,
            this.settings.notation,
            this.settings.showOctave,
            this.settings.a4Frequency
          );
          detectedNote.confidence = yinResult.confidence;
        }
      }
    }

    this.lastPitchDetails = detectedNote;

    if (detectedNote) {

      this.piano.ensureMidiInRange(detectedNote.continuousMidi);
    }

    this.piano.setSungNote(detectedNote ? detectedNote.midi : null);

    this.waterfall.addPitchSample(detectedNote);

    this.tuner.updatePitch(detectedNote);
    if (this.currentView === 'afinador') {
      this.tuner.render(timeDomain);
    }

    this.updateReadouts(detectedNote);
    this.updateHeaderNoteBadge(detectedNote);
  }

  updateReadouts(note) {
    if (note) {
      if (this.tunerNoteName) this.tunerNoteName.textContent = note.name;
      if (this.tunerAltNote) this.tunerAltNote.textContent = `(${note.altName})`;
      if (this.tunerFreq) this.tunerFreq.textContent = `${note.frequency.toFixed(1)} Hz`;
      if (this.tunerTargetFreq) this.tunerTargetFreq.textContent = `${note.targetFreq.toFixed(1)} Hz`;

      const sign = note.cents > 0 ? '+' : '';
      if (this.tunerCents) this.tunerCents.textContent = `${sign}${note.cents}¢`;

      if (this.tunerBadge) {
        this.tunerBadge.className = 'accuracy-status';
        if (note.isPerfect) {
          this.tunerBadge.classList.add('status-perfect');
          this.tunerBadge.textContent = 'AFINACIÓN EXACTA (±5¢)';
        } else if (note.isClose) {
          this.tunerBadge.classList.add('status-close');
          this.tunerBadge.textContent = note.cents > 0 ? 'LIGERAMENTE ALTO' : 'LIGERAMENTE BAJO';
        } else {
          this.tunerBadge.classList.add('status-off');
          this.tunerBadge.textContent = note.cents > 0 ? 'SOSTENIDO (+)' : 'BEMOL (-)';
        }
      }
    } else {
      if (this.tunerNoteName) this.tunerNoteName.textContent = '--';
      if (this.tunerAltNote) this.tunerAltNote.textContent = '';
      if (this.tunerFreq) this.tunerFreq.textContent = '--.- Hz';
      if (this.tunerTargetFreq) this.tunerTargetFreq.textContent = '--.- Hz';
      if (this.tunerCents) this.tunerCents.textContent = '0¢';
      if (this.tunerBadge) {
        this.tunerBadge.className = 'accuracy-status status-idle';
        this.tunerBadge.textContent = this.audioEngine.isMicActive ? 'ESCUCHANDO SEÑAL...' : 'ESPERANDO SEÑAL VOCAL';
      }
    }
  }

  updateHeaderNoteBadge(note) {
    if (!this.headerNoteBadge) return;
    if (note) {
      this.headerNoteBadge.classList.add('active');
      const sign = note.cents > 0 ? '+' : '';
      this.headerNoteBadge.innerHTML = `
        <span class="badge-note">${note.name}</span>
        <span class="badge-cents ${note.isPerfect ? 'cents-perfect' : ''}">${sign}${note.cents}¢</span>
      `;
    } else {
      this.headerNoteBadge.classList.remove('active');
      this.headerNoteBadge.innerHTML = ``;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new NoteVisualizerApp();
});

