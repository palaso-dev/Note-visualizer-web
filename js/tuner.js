export class TunerRenderer {
  constructor(canvasElement, scopeCanvasElement = null, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');

    this.notation = options.notation || 'latin';
    this.showOctave = options.showOctave !== undefined ? options.showOctave : true;
    this.isLightMode = options.isLightMode || false;

    this.currentCents = 0;
    this.targetCents = 0;
    this.currentPitchData = null;
    this.isActive = false;

    this.needleSmoothing = 0.20;

    this.dpr = window.devicePixelRatio || 1;
    this.setupResizeObserver();
  }

  setupResizeObserver() {
    this.resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      this.width = rect.width;
      this.height = rect.height;
      this.dpr = window.devicePixelRatio || 1;

      this.canvas.width = Math.floor(rect.width * this.dpr);
      this.canvas.height = Math.floor(rect.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    };

    window.addEventListener('resize', this.resize);
    setTimeout(this.resize, 40);
  }

  setNotation(notation, showOctave) {
    this.notation = notation;
    if (showOctave !== undefined) this.showOctave = showOctave;
  }

  setLightMode(isLight) {
    this.isLightMode = isLight;
  }

  updatePitch(pitchData) {
    if (pitchData && (pitchData.pitch || pitchData.frequency || pitchData.midi !== undefined)) {
      this.currentPitchData = pitchData;
      this.targetCents = Math.max(-50, Math.min(50, pitchData.cents !== undefined ? pitchData.cents : 0));
      this.isActive = true;
    } else {
      this.isActive = false;
      this.currentPitchData = null;
      this.targetCents = 0;
    }
  }

  render() {
    this.currentCents += (this.targetCents - this.currentCents) * this.needleSmoothing;
    this.renderGauge();
  }

  renderGauge() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);

    const centerX = w / 2;
    const centerY = h * 0.54;
    const radius = Math.min(w * 0.44, h * 0.48);

    if (radius < 40) return;

    const startAngle = Math.PI * 0.8;
    const endAngle = Math.PI * 2.2;
    const totalSweep = endAngle - startAngle;

    ctx.lineWidth = 1;
    ctx.strokeStyle = this.isLightMode ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.07)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 12, startAngle, endAngle);
    ctx.stroke();

    ctx.lineWidth = 4;
    ctx.strokeStyle = this.isLightMode ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.stroke();

    const sweetStartNorm = 45 / 100;
    const sweetEndNorm = 55 / 100;
    const sweetStartAngle = startAngle + sweetStartNorm * totalSweep;
    const sweetEndAngle = startAngle + sweetEndNorm * totalSweep;

    ctx.lineWidth = 8;
    ctx.strokeStyle = this.isLightMode ? 'rgba(5, 150, 105, 0.25)' : 'rgba(0, 255, 136, 0.28)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, sweetStartAngle, sweetEndAngle);
    ctx.stroke();

    const centsVal = Math.round(this.currentCents);
    let stateColor = this.isLightMode ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.22)';

    if (this.isActive && this.currentPitchData) {
      const absCents = Math.abs(centsVal);
      if (absCents <= 5) {
        stateColor = this.isLightMode ? '#059669' : '#00ff88';
      } else if (absCents <= 18) {
        stateColor = this.isLightMode ? '#d97706' : '#f59e0b';
      } else {
        stateColor = this.isLightMode ? '#dc2626' : '#ff3b5c';
      }
    }

    for (let c = -50; c <= 50; c += 1) {
      const isMultiple10 = c % 10 === 0;
      const isMultiple5 = c % 5 === 0;
      const isZero = c === 0;
      const isMajorLabel = c === -50 || c === -30 || c === -20 || c === -10 || c === 0 || c === 10 || c === 20 || c === 30 || c === 50;

      if (!isMultiple5 && radius < 140) continue;
      if (!isMultiple5 && c % 2 !== 0 && radius < 220) continue;

      const norm = (c + 50) / 100;
      const angle = startAngle + norm * totalSweep;

      let tickLen = 4;
      let strokeWidth = 1;
      let strokeStyle = this.isLightMode ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';

      if (isZero) {
        tickLen = Math.round(radius * 0.12);
        strokeWidth = 3;
        strokeStyle = this.isLightMode ? '#059669' : '#00ff88';
      } else if (isMultiple10) {
        tickLen = Math.round(radius * 0.09);
        strokeWidth = 2;
        strokeStyle = this.isLightMode ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.45)';
      } else if (isMultiple5) {
        tickLen = Math.round(radius * 0.06);
        strokeWidth = 1.2;
        strokeStyle = this.isLightMode ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.2)';
      }

      const innerR = radius - tickLen;
      const outerR = radius;

      const x1 = centerX + Math.cos(angle) * innerR;
      const y1 = centerY + Math.sin(angle) * innerR;
      const x2 = centerX + Math.cos(angle) * outerR;
      const y2 = centerY + Math.sin(angle) * outerR;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = strokeStyle;
      ctx.stroke();

      if (isMajorLabel) {
        const textR = radius - Math.round(radius * 0.18);
        const tx = centerX + Math.cos(angle) * textR;
        const ty = centerY + Math.sin(angle) * textR;

        const fontSize = Math.max(9, Math.round(radius * 0.062));
        ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
        ctx.fillStyle = isZero 
          ? (this.isLightMode ? '#059669' : '#00ff88') 
          : (this.isLightMode ? 'rgba(0, 0, 0, 0.48)' : 'rgba(255, 255, 255, 0.42)');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c === 0 ? '0' : (c > 0 ? `+${c}` : `${c}`), tx, ty);
      }
    }

    const needleNorm = (this.currentCents + 50) / 100;
    const needleAngle = startAngle + needleNorm * totalSweep;
    const needleLen = radius - 8;

    const nx = centerX + Math.cos(needleAngle) * needleLen;
    const ny = centerY + Math.sin(needleAngle) * needleLen;

    ctx.save();
    if (this.isActive) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = stateColor;
    }
    ctx.strokeStyle = stateColor;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = this.isLightMode ? '#ffffff' : '#08090d';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = stateColor;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.fillStyle = stateColor;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const noteText = (this.isActive && this.currentPitchData) ? this.currentPitchData.name : '--';
    const altText = (this.isActive && this.currentPitchData && this.currentPitchData.altName) ? this.currentPitchData.altName : '';
    const noteY = centerY + radius * 0.36;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const noteFontSize = Math.max(28, Math.round(radius * 0.34));
    ctx.font = `900 ${noteFontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = this.isActive ? stateColor : (this.isLightMode ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.16)');

    if (this.isActive) {
      ctx.shadowColor = stateColor;
      ctx.shadowBlur = Math.round(radius * 0.08);
    }

    ctx.fillText(noteText, centerX, noteY);

    if (altText && altText !== noteText) {
      const altFontSize = Math.max(10, Math.round(radius * 0.11));
      ctx.font = `700 ${altFontSize}px "JetBrains Mono", monospace`;
      ctx.fillStyle = this.isLightMode ? 'rgba(0, 0, 0, 0.42)' : 'rgba(255, 255, 255, 0.38)';
      ctx.shadowBlur = 0;
      ctx.fillText(`(${altText})`, centerX, noteY + radius * 0.22);
    }
    ctx.restore();
  }
}
