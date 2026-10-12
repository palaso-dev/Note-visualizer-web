export class YINDetector {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 44100;
    this.threshold = options.threshold !== undefined ? options.threshold : 0.20;
    this.minFreq = options.minFreq || 65;
    this.maxFreq = options.maxFreq || 1200;
    this.noiseGate = options.noiseGate !== undefined ? options.noiseGate : 0.003;

    this.bufferSize = 2048;
    this.halfBufferSize = Math.floor(this.bufferSize / 2);
    this.yinBuffer = new Float32Array(this.halfBufferSize);
  }

  setSampleRate(rate) {
    this.sampleRate = rate;
  }

  setThreshold(val) {
    this.threshold = Math.max(0.05, Math.min(0.5, val));
  }

  setNoiseGate(val) {
    this.noiseGate = Math.max(0.001, Math.min(0.1, val));
  }

  calculateRMS(inputBuffer) {
    let sum = 0;
    const len = inputBuffer.length;
    for (let i = 0; i < len; i++) {
      sum += inputBuffer[i] * inputBuffer[i];
    }
    return Math.sqrt(sum / len);
  }

  detect(inputBuffer) {
    const rms = this.calculateRMS(inputBuffer);

    if (rms < this.noiseGate) {
      return {
        pitch: null,
        confidence: 0,
        rms,
        isSilent: true
      };
    }

    const sampleRate = this.sampleRate;
    const minLag = Math.max(2, Math.floor(sampleRate / this.maxFreq));
    const maxLag = Math.min(this.halfBufferSize - 1, Math.floor(sampleRate / this.minFreq));
    const halfLen = this.halfBufferSize;
    const yinBuf = this.yinBuffer;

    yinBuf[0] = 1.0;
    for (let tau = 1; tau <= maxLag; tau++) {
      let diffSum = 0;
      for (let i = 0; i < halfLen; i++) {
        const delta = inputBuffer[i] - inputBuffer[i + tau];
        diffSum += delta * delta;
      }
      yinBuf[tau] = diffSum;
    }

    let runningSum = 0;
    for (let tau = 1; tau <= maxLag; tau++) {
      runningSum += yinBuf[tau];
      if (runningSum === 0) {
        yinBuf[tau] = 1;
      } else {
        yinBuf[tau] = (yinBuf[tau] * tau) / runningSum;
      }
    }

    let tauEstimate = -1;
    let minVal = 1000;
    let globalMinTau = -1;

    for (let tau = minLag; tau <= maxLag; tau++) {
      const val = yinBuf[tau];
      if (val < minVal) {
        minVal = val;
        globalMinTau = tau;
      }

      if (val < this.threshold) {

        while (tau + 1 <= maxLag && yinBuf[tau + 1] < yinBuf[tau]) {
          tau++;
        }
        tauEstimate = tau;
        break;
      }
    }

    if (tauEstimate === -1) {
      if (minVal < this.threshold * 1.5) {
        tauEstimate = globalMinTau;
      } else {

        return {
          pitch: null,
          confidence: Math.max(0, 1 - minVal),
          rms,
          isSilent: false
        };
      }
    }

    const rawMinVal = yinBuf[tauEstimate];
    const confidence = Math.max(0, Math.min(1, 1 - rawMinVal));

    const requiredConfidence = 1 - this.threshold;
    if (confidence < requiredConfidence) {
      return {
        pitch: null,
        confidence,
        rms,
        isSilent: false
      };
    }

    let betterTau = tauEstimate;
    if (tauEstimate > 0 && tauEstimate < maxLag) {
      const s0 = yinBuf[tauEstimate - 1];
      const s1 = yinBuf[tauEstimate];
      const s2 = yinBuf[tauEstimate + 1];

      const denom = 2 * (2 * s1 - s2 - s0);
      if (Math.abs(denom) > 1e-6) {
        const delta = (s2 - s0) / denom;
        if (Math.abs(delta) <= 1) {
          betterTau = tauEstimate + delta;
        }
      }
    }

    const fundamentalFreq = sampleRate / betterTau;

    if (fundamentalFreq < this.minFreq || fundamentalFreq > this.maxFreq) {
      return {
        pitch: null,
        confidence: 0,
        rms,
        isSilent: false
      };
    }

    return {
      pitch: fundamentalFreq,
      confidence,
      rms,
      period: betterTau,
      isSilent: false
    };
  }
}

