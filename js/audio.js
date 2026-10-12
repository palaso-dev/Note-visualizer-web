export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.inputGain = null;

    this.highpassFilter = null;
    this.lowpassFilter = null;
    this.isFilterActive = false;

    this.analyser = null;
    this.bufferSize = 2048;
    this.timeDomainBuffer = new Float32Array(this.bufferSize);
    this.frequencyBuffer = new Uint8Array(1024);

    this.synthMasterGain = null;
    this.activeVoices = new Map();

    this.isMicActive = false;
    this.onError = null;
    this.onStateChange = null;
  }

  initAudioContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.error('Web Audio API no está soportada en este navegador');
        return null;
      }
      this.audioContext = new AudioCtx({
        latencyHint: 'interactive'
      });

      const limiter = this.audioContext.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-3, this.audioContext.currentTime);
      limiter.knee.setValueAtTime(6, this.audioContext.currentTime);
      limiter.ratio.setValueAtTime(12, this.audioContext.currentTime);
      limiter.attack.setValueAtTime(0.003, this.audioContext.currentTime);
      limiter.release.setValueAtTime(0.1, this.audioContext.currentTime);

      this.synthMasterGain = this.audioContext.createGain();
      this.synthMasterGain.gain.setValueAtTime(0.6, this.audioContext.currentTime);

      this.synthMasterGain.connect(limiter);
      limiter.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }

    return this.audioContext;
  }

  async ensureAudioContext() {
    this.initAudioContext();
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (_) {}
    }
    return this.audioContext;
  }

  async startMic() {
    try {
      await this.ensureAudioContext();

      const constraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: this.audioContext.sampleRate
        }
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (constraintErr) {
        console.warn('Fallo con restricciones específicas, reintentando con audio básico:', constraintErr);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      this.mediaStream = stream;

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      this.inputGain = this.audioContext.createGain();
      this.inputGain.gain.setValueAtTime(2.2, this.audioContext.currentTime);

      this.highpassFilter = this.audioContext.createBiquadFilter();
      this.highpassFilter.type = 'highpass';
      this.highpassFilter.frequency.setValueAtTime(70, this.audioContext.currentTime);
      this.highpassFilter.Q.setValueAtTime(0.707, this.audioContext.currentTime);

      this.lowpassFilter = this.audioContext.createBiquadFilter();
      this.lowpassFilter.type = 'lowpass';
      this.lowpassFilter.frequency.setValueAtTime(1600, this.audioContext.currentTime);
      this.lowpassFilter.Q.setValueAtTime(0.707, this.audioContext.currentTime);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.bufferSize;
      this.analyser.smoothingTimeConstant = 0.0;

      this.connectGraph();

      this.isMicActive = true;
      if (this.onStateChange) this.onStateChange({ isMicActive: true });
      return true;
    } catch (err) {
      console.error('Error al acceder al micrófono:', err);
      this.isMicActive = false;
      if (this.onError) this.onError(err);
      throw err;
    }
  }

  connectGraph() {
    if (!this.sourceNode || !this.inputGain || !this.analyser) return;

    try {
      this.sourceNode.disconnect();
      this.inputGain.disconnect();
      if (this.highpassFilter) this.highpassFilter.disconnect();
      if (this.lowpassFilter) this.lowpassFilter.disconnect();
    } catch (_) {}

    this.sourceNode.connect(this.inputGain);

    if (this.isFilterActive && this.highpassFilter && this.lowpassFilter) {

      this.inputGain.connect(this.highpassFilter);
      this.highpassFilter.connect(this.lowpassFilter);
      this.lowpassFilter.connect(this.analyser);
    } else {

      this.inputGain.connect(this.analyser);
    }

  }

  setVocalFilter(enabled) {
    this.isFilterActive = !!enabled;
    this.connectGraph();
  }

  setInputSensitivity(value) {
    if (this.inputGain && this.audioContext) {
      this.inputGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.02);
    }
  }

  getTimeDomainData() {
    if (this.analyser) {
      this.analyser.getFloatTimeDomainData(this.timeDomainBuffer);
      return this.timeDomainBuffer;
    }
    return null;
  }

  getFrequencyData() {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.frequencyBuffer);
      return this.frequencyBuffer;
    }
    return null;
  }

  stopMic() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.isMicActive = false;
    if (this.onStateChange) this.onStateChange({ isMicActive: false });
  }

  startTone(freq, voiceId = 'default') {
    if (freq <= 0) return;
    this.initAudioContext();
    if (!this.audioContext) return;

    this.stopTone(voiceId, 0.04);

    const ctx = this.audioContext;
    const now = ctx.currentTime;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(1.4, now);

    const hammerCutoff = Math.min(8000, freq * 6.5);
    const bodyCutoff = Math.min(2600, freq * 2.2);
    filter.frequency.setValueAtTime(hammerCutoff, now);
    filter.frequency.exponentialRampToValueAtTime(bodyCutoff, now + 0.09);
    filter.frequency.exponentialRampToValueAtTime(Math.max(160, freq * 1.1), now + 1.4);

    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, now);
    osc2.detune.setValueAtTime(3.8, now);

    const osc2Gain = ctx.createGain();
    osc2Gain.gain.setValueAtTime(0.34, now);
    osc2Gain.gain.exponentialRampToValueAtTime(0.04, now + 0.65);
    osc2.connect(osc2Gain);

    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 3, now);
    osc3.detune.setValueAtTime(6.5, now);

    const osc3Gain = ctx.createGain();
    osc3Gain.gain.setValueAtTime(0.14, now);
    osc3Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
    osc3.connect(osc3Gain);

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(0.0001, now);

    voiceGain.gain.linearRampToValueAtTime(0.72, now + 0.003);

    voiceGain.gain.exponentialRampToValueAtTime(0.36, now + 0.10);

    voiceGain.gain.exponentialRampToValueAtTime(0.03, now + 2.8);

    osc1.connect(filter);
    osc2Gain.connect(filter);
    osc3Gain.connect(filter);

    filter.connect(voiceGain);
    voiceGain.connect(this.synthMasterGain);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);

    this.activeVoices.set(voiceId, {
      osc1,
      osc2,
      osc3,
      osc2Gain,
      osc3Gain,
      filter,
      gain: voiceGain,
      startTime: now
    });
  }

  stopTone(voiceId = 'default', fadeTime = 0.18) {
    const voice = this.activeVoices.get(voiceId);
    if (!voice || !this.audioContext) return;

    this.activeVoices.delete(voiceId);

    const now = this.audioContext.currentTime;
    const elapsed = now - voice.startTime;
    const minHold = 0.08;
    const releaseTime = elapsed < minHold ? voice.startTime + minHold : now;

    try {
      voice.gain.gain.cancelScheduledValues(releaseTime);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), releaseTime);
      voice.gain.gain.exponentialRampToValueAtTime(0.00001, releaseTime + fadeTime);
    } catch (_) {}

    const cleanupDelay = ((releaseTime - now) + fadeTime + 0.05) * 1000;
    setTimeout(() => {
      try {
        voice.osc1.stop();
        voice.osc2.stop();
        voice.osc3.stop();
        voice.osc1.disconnect();
        voice.osc2.disconnect();
        voice.osc3.disconnect();
        if (voice.osc2Gain) voice.osc2Gain.disconnect();
        if (voice.osc3Gain) voice.osc3Gain.disconnect();
        if (voice.filter) voice.filter.disconnect();
        voice.gain.disconnect();
      } catch (_) {}
    }, Math.max(30, cleanupDelay));
  }

  playTone(freq, duration = 0.8) {
    if (freq <= 0) return;
    this.initAudioContext();
    const id = `hit_${Date.now()}_${Math.random()}`;
    this.startTone(freq, id);
    setTimeout(() => {
      this.stopTone(id, 0.22);
    }, duration * 1000);
  }
}

