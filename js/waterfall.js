export class WaterfallRenderer {
  constructor(canvasElement, pianoComponent, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { alpha: false });
    this.piano = pianoComponent;

    this.direction = options.direction || 'keys-to-out';
    this.scrollTimeWindow = 3.8;

    this.notation = options.notation || 'latin';
    this.showOctave = options.showOctave !== undefined ? options.showOctave : true;
    this.isLightMode = options.isLightMode || false;

    this.pitchPoints = [];
    this.maxHistorySeconds = 5.0;

    this.isRunning = false;
    this.lastFrameTime = performance.now();
    this.currentTime = 0;
    this.currentPitchSample = null;

    this.dpr = window.devicePixelRatio || 1;
    this.setupResizeObserver();
  }

  setupResizeObserver() {
    this.resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      const pRect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : rect;
      const w = Math.floor(rect.width || pRect.width);
      const h = Math.floor(rect.height || pRect.height);
      if (!w || !h) return;

      this.width = w;
      this.height = h;
      this.dpr = window.devicePixelRatio || 1;

      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    };

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.resize());
      if (this.canvas.parentElement) ro.observe(this.canvas.parentElement);
      ro.observe(this.canvas);
    }

    window.addEventListener('resize', this.resize);
    this.resize();
    setTimeout(this.resize, 30);
    setTimeout(this.resize, 100);
  }

  setDirection(direction) {
    this.direction = direction;
  }

  setNotation(notation, showOctave) {
    this.notation = notation;
    if (showOctave !== undefined) this.showOctave = showOctave;
  }

  setLightMode(isLight) {
    this.isLightMode = isLight;
  }

  addPitchSample(pitchData) {
    const now = performance.now() / 1000;
    this.currentTime = now;

    if (pitchData && (pitchData.pitch || pitchData.frequency)) {
      this.currentPitchSample = {
        time: now,
        midi: pitchData.midi,
        continuousMidi: pitchData.continuousMidi,
        cents: pitchData.cents,
        frequency: pitchData.frequency,
        confidence: pitchData.confidence,
        isVoiced: true,
        name: pitchData.name,
        targetFreq: pitchData.targetFreq
      };

      this.pitchPoints.push(this.currentPitchSample);
    } else {
      if (this.currentPitchSample && this.currentPitchSample.isVoiced) {
        this.pitchPoints.push({
          time: now,
          isVoiced: false
        });
      }
      this.currentPitchSample = null;
    }

    const cutoffTime = now - this.maxHistorySeconds;
    while (this.pitchPoints.length > 0 && this.pitchPoints[0].time < cutoffTime) {
      this.pitchPoints.shift();
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.renderLoop();
  }

  stop() {
    this.isRunning = false;
  }

  renderLoop() {
    if (!this.isRunning) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    if (this.piano && this.piano.update) {
      this.piano.update(dt);
    }

    this.render();

    requestAnimationFrame(() => this.renderLoop());
  }

  render() {
    if (!this.width || !this.height) {
      this.resize();
    }
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    if (!w || !h) return;

    const isBottom = this.piano.orientation === 'bottom';
    const isKeysToOut = this.direction === 'keys-to-out';

    ctx.fillStyle = this.isLightMode ? '#f8fafc' : '#08090d';
    ctx.fillRect(0, 0, w, h);

    this.renderNoteLanes(ctx, w, h, isBottom);
    this.renderPitchTraces(ctx, w, h, isBottom, isKeysToOut);
    this.renderEmitterLine(ctx, w, h, isBottom);
  }

  renderNoteLanes(ctx, w, h, isBottom) {
    if (!this.piano || !this.piano.whiteKeyMidiList) return;

    const visible = this.piano.visibleWhiteKeys || 21;
    const offset = this.piano.currentWhiteOffset;
    const keySize = (isBottom ? w : h) / visible;

    ctx.strokeStyle = this.isLightMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridDivisions = 8;
    const timeStep = (isBottom ? h : w) / gridDivisions;
    for (let i = 1; i < gridDivisions; i++) {
      const pos = i * timeStep;
      ctx.beginPath();
      if (isBottom) {
        ctx.moveTo(0, pos);
        ctx.lineTo(w, pos);
      } else {
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, h);
      }
      ctx.stroke();
    }

    const minWhite = Math.max(0, Math.floor(offset) - 1);
    const maxWhite = Math.min(this.piano.totalWhiteKeys - 1, Math.ceil(offset + visible) + 1);

    for (let i = minWhite; i <= maxWhite; i++) {
      const midi = this.piano.whiteKeyMidiList[i];
      const semitone = ((midi % 12) + 12) % 12;
      const octave = Math.floor(midi / 12) - 1;

      if (isBottom) {
        const x0 = (i - offset) * keySize;
        const x1 = x0 + keySize;

        ctx.fillStyle = semitone === 0 
          ? (this.isLightMode ? '#e8edf5' : '#181e2e') 
          : (this.isLightMode ? '#f8fafc' : '#121520');
        ctx.fillRect(x0, 0, keySize, h);

        ctx.strokeStyle = semitone === 0 
          ? (this.isLightMode ? 'rgba(2, 132, 199, 0.35)' : 'rgba(56, 189, 248, 0.35)') 
          : (this.isLightMode ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)');
        ctx.lineWidth = semitone === 0 ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, 0);
        ctx.lineTo(x1, h);
        ctx.stroke();

        if (semitone === 0) {
          ctx.fillStyle = this.isLightMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect((x0 + x1) / 2 - 16, 6, 32, 16);
          ctx.strokeStyle = this.isLightMode ? 'rgba(2, 132, 199, 0.4)' : 'rgba(56, 189, 248, 0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect((x0 + x1) / 2 - 16, 6, 32, 16);

          ctx.fillStyle = this.isLightMode ? '#0284c7' : '#38bdf8';
          ctx.font = '700 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          const labelText = this.notation === 'latin' ? `Do${octave}` : `C${octave}`;
          ctx.fillText(labelText, (x0 + x1) / 2, 18);
        }
      } else {
        const yBottom0 = (i - offset) * keySize;
        const yBottom1 = yBottom0 + keySize;
        const y0 = h - yBottom1;
        const y1 = h - yBottom0;

        ctx.fillStyle = semitone === 0 
          ? (this.isLightMode ? '#e8edf5' : '#181e2e') 
          : (this.isLightMode ? '#f8fafc' : '#121520');
        ctx.fillRect(0, y0, w, keySize);

        ctx.strokeStyle = semitone === 0 
          ? (this.isLightMode ? 'rgba(2, 132, 199, 0.35)' : 'rgba(56, 189, 248, 0.35)') 
          : (this.isLightMode ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)');
        ctx.lineWidth = semitone === 0 ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(0, y0);
        ctx.lineTo(w, y0);
        ctx.stroke();

        if (semitone === 0) {
          const labelText = this.notation === 'latin' ? `Do${octave}` : `C${octave}`;
          ctx.fillStyle = this.isLightMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(8, (y0 + y1) / 2 - 8, 32, 16);
          ctx.strokeStyle = this.isLightMode ? 'rgba(2, 132, 199, 0.4)' : 'rgba(56, 189, 248, 0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(8, (y0 + y1) / 2 - 8, 32, 16);

          ctx.fillStyle = this.isLightMode ? '#0284c7' : '#38bdf8';
          ctx.font = '700 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(labelText, 24, (y0 + y1) / 2 + 4);
        }
      }
    }

    for (let b = 0; b < this.piano.blackKeyMidiList.length; b++) {
      const midi = this.piano.blackKeyMidiList[b];
      const center = this.piano.getCenterUnitForMidi(midi);

      if (isBottom) {
        const cx = (center - offset) * keySize;
        const halfW = keySize * 0.32;
        const x0 = cx - halfW;
        const width = halfW * 2;

        if (x0 + width < -5 || x0 > w + 5) continue;

        ctx.fillStyle = this.isLightMode ? '#e2e8f0' : '#08090d';
        ctx.fillRect(x0, 0, width, h);

        ctx.strokeStyle = this.isLightMode ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.lineTo(x0, h);
        ctx.moveTo(x0 + width, 0);
        ctx.lineTo(x0 + width, h);
        ctx.stroke();
      } else {
        const cyBottom = (center - offset) * keySize;
        const cy = h - cyBottom;
        const halfH = keySize * 0.32;
        const y0 = cy - halfH;
        const height = halfH * 2;

        if (y0 + height < -5 || y0 > h + 5) continue;

        ctx.fillStyle = this.isLightMode ? '#e2e8f0' : '#08090d';
        ctx.fillRect(0, y0, w, height);

        ctx.strokeStyle = this.isLightMode ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y0);
        ctx.lineTo(w, y0);
        ctx.moveTo(0, y0 + height);
        ctx.lineTo(w, y0 + height);
        ctx.stroke();
      }
    }
  }

  renderPitchTraces(ctx, w, h, isBottom, isKeysToOut) {
    if (this.pitchPoints.length === 0) return;

    const now = performance.now() / 1000;
    const windowSec = this.scrollTimeWindow;

    const segments = [];
    let currentSegment = [];

    for (let i = 0; i < this.pitchPoints.length; i++) {
      const pt = this.pitchPoints[i];
      if (pt.isVoiced) {
        if (currentSegment.length > 0) {
          const prevPt = currentSegment[currentSegment.length - 1];
          const timeDiff = pt.time - prevPt.time;
          const pitchDiff = Math.abs(pt.continuousMidi - prevPt.continuousMidi);

          if (timeDiff > 0.12 || pitchDiff > 2.0) {
            segments.push(currentSegment);
            currentSegment = [pt];
            continue;
          }
        }
        currentSegment.push(pt);
      } else {
        if (currentSegment.length > 0) {
          segments.push(currentSegment);
          currentSegment = [];
        }
      }
    }
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const lineColor = this.isLightMode ? '#0284c7' : '#00f0ff';

    for (const segment of segments) {
      if (segment.length === 0) continue;

      if (segment.length === 1) {
        const pt = segment[0];
        const tDelta = now - pt.time;
        if (tDelta <= windowSec) {
          const coords = this.getPointCoords(pt, tDelta, w, h, isBottom, isKeysToOut, windowSec);
          ctx.beginPath();
          ctx.arc(coords.x, coords.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = lineColor;
          ctx.shadowBlur = 8;
          ctx.shadowColor = lineColor;
          ctx.fill();
        }
        continue;
      }

      ctx.beginPath();
      let started = false;

      for (let i = 0; i < segment.length; i++) {
        const pt = segment[i];
        const tDelta = now - pt.time;
        if (tDelta > windowSec) continue;

        const coords = this.getPointCoords(pt, tDelta, w, h, isBottom, isKeysToOut, windowSec);

        if (!started) {
          ctx.moveTo(coords.x, coords.y);
          started = true;
        } else {
          ctx.lineTo(coords.x, coords.y);
        }
      }

      if (started) {
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 3.2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = lineColor;
        ctx.stroke();
      }

      const latest = segment[segment.length - 1];
      const latestTDelta = now - latest.time;
      if (latestTDelta < 0.4) {
        const headCoords = this.getPointCoords(latest, latestTDelta, w, h, isBottom, isKeysToOut, windowSec);
        ctx.beginPath();
        ctx.arc(headCoords.x, headCoords.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = this.isLightMode ? '#0f172a' : '#ffffff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = lineColor;
        ctx.fill();
      }
    }

    ctx.restore();
  }

  getPointCoords(pt, tDelta, w, h, isBottom, isKeysToOut, windowSec) {
    const normPitch = this.piano.getNormalizedPositionForMidi(pt.continuousMidi);
    const normTime = Math.max(0, Math.min(1, tDelta / windowSec));

    let x, y;

    if (isBottom) {
      x = normPitch * w;
      if (isKeysToOut) {
        y = h - (normTime * h);
      } else {
        y = normTime * h;
      }
    } else {
      y = (1 - normPitch) * h;
      if (isKeysToOut) {
        x = normTime * w;
      } else {
        x = (1 - normTime) * w;
      }
    }

    return { x, y };
  }

  renderEmitterLine(ctx, w, h, isBottom) {
    ctx.save();
    ctx.strokeStyle = this.isLightMode ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (isBottom) {
      const y = h - 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    } else {
      const x = 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();
    ctx.restore();
  }
}
