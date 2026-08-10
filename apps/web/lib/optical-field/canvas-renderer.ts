import { sampleDiffractionWavefront, type OpticalSample, type OpticalViewport } from './field-model';

function renderParticleLayer(
  context: CanvasRenderingContext2D,
  sample: OpticalSample,
  viewport: OpticalViewport,
  spacing: number,
  coreOnly: boolean,
) {
  const minimumX = coreOnly ? Math.max(spacing / 2, sample.origin.x - sample.radius) : spacing / 2;
  const maximumX = coreOnly ? Math.min(viewport.width, sample.origin.x + sample.radius) : viewport.width;
  const minimumY = coreOnly ? Math.max(spacing / 2, sample.origin.y - sample.radius) : spacing / 2;
  const maximumY = coreOnly ? Math.min(viewport.height, sample.origin.y + sample.radius) : viewport.height;

  context.fillStyle = coreOnly ? 'rgba(241, 238, 231, 0.58)' : 'rgba(241, 238, 231, 0.12)';
  for (let y = minimumY; y < maximumY; y += spacing) {
    for (let x = minimumX; x < maximumX; x += spacing) {
      const dx = x - sample.origin.x;
      const dy = y - sample.origin.y;
      const distance = Math.hypot(dx, dy);
      if (coreOnly && distance > sample.radius) continue;
      const influence = Math.max(0, 1 - distance / sample.radius);
      const radialX = distance ? dx / distance : 0;
      const radialY = distance ? dy / distance : 0;
      const ripple = Math.sin(sample.phase * 2.2 + distance * 0.055) * influence * (coreOnly ? 7 : 2);
      const strength = coreOnly ? sample.displacement : sample.displacement * 0.16;
      const offset = influence * influence * strength;
      const radius = coreOnly ? 0.7 + influence * 1.45 : 0.52 + influence * 0.42;

      context.beginPath();
      context.arc(
        x + radialX * offset - radialY * ripple,
        y + radialY * offset + radialX * ripple,
        radius,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }
}

function renderApertureCurtain(context: CanvasRenderingContext2D, sample: OpticalSample, viewport: OpticalViewport) {
  const columns = viewport.width < 640 ? 2 : 4;
  const step = sample.coreSpacing * 1.35;
  context.fillStyle = 'rgba(241, 238, 231, 0.48)';
  for (let y = step / 2; y < viewport.height; y += step) {
    const distanceFromAperture = Math.abs(y - sample.aperture.y);
    const width = Math.min(sample.radius * 0.56, 16 + distanceFromAperture * 0.055);
    const verticalFade = Math.max(0.12, 1 - distanceFromAperture / (viewport.height * 0.72));
    context.globalAlpha = verticalFade * (0.42 + sample.evidence * 0.35);
    for (let column = -columns; column <= columns; column += 1) {
      const normalized = column / Math.max(columns, 1);
      const wave = Math.sin(sample.phase * 1.4 + y * 0.018 + column) * 3.5;
      context.beginPath();
      context.arc(sample.aperture.x + normalized * width + wave, y, 0.65 + verticalFade * 0.45, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 1;
}

function renderDiffractionField(context: CanvasRenderingContext2D, sample: OpticalSample, mobile: boolean) {
  const { aperture } = sample;
  const intensity = 0.24 + sample.evidence * 0.56;
  const reach = mobile ? 5 : 8;
  const slitHalfHeight = mobile ? 15 : 23;
  const baffleHeight = mobile ? 72 : 112;

  context.save();
  context.globalAlpha = intensity;
  context.lineWidth = 1;

  context.strokeStyle = 'rgba(241, 238, 231, 0.5)';
  context.beginPath();
  context.moveTo(aperture.x, aperture.y - baffleHeight);
  context.lineTo(aperture.x, aperture.y - slitHalfHeight);
  context.moveTo(aperture.x, aperture.y + slitHalfHeight);
  context.lineTo(aperture.x, aperture.y + baffleHeight);
  context.stroke();

  for (let step = 0; step <= reach; step += 1) {
    const upper = sampleDiffractionWavefront(aperture, step, -1, sample.phase);
    const lower = sampleDiffractionWavefront(aperture, step, 1, sample.phase);
    const alpha = Math.max(0.05, 0.34 - step * 0.03);
    context.strokeStyle = `rgba(241, 238, 231, ${alpha})`;
    context.beginPath();
    context.moveTo(aperture.x + 2, aperture.y);
    context.quadraticCurveTo(upper.x - 12, aperture.y, upper.x, upper.y);
    context.moveTo(aperture.x + 2, aperture.y);
    context.quadraticCurveTo(lower.x - 12, aperture.y, lower.x, lower.y);
    context.stroke();
  }

  context.strokeStyle = 'rgba(241, 238, 231, 0.2)';
  for (let band = 1; band <= (mobile ? 3 : 5); band += 1) {
    const radiusX = band * (mobile ? 22 : 31);
    const radiusY = band * (mobile ? 34 : 48);
    context.beginPath();
    context.ellipse(aperture.x + 2, aperture.y, radiusX, radiusY, 0, -Math.PI / 2, Math.PI / 2);
    context.stroke();
  }

  context.fillStyle = 'rgba(241, 238, 231, 0.9)';
  context.beginPath();
  context.arc(aperture.x, aperture.y, 2.2 + sample.evidence * 1.6, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function renderOpticalField(
  context: CanvasRenderingContext2D,
  sample: OpticalSample,
  viewport: OpticalViewport,
) {
  const { width, height, dpr } = viewport;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  renderParticleLayer(context, sample, viewport, sample.ambientSpacing, false);
  renderApertureCurtain(context, sample, viewport);
  renderParticleLayer(context, sample, viewport, sample.coreSpacing, true);

  if (sample.evidence > 0.01) {
    context.globalAlpha = sample.evidence;
    context.strokeStyle = 'rgba(241, 238, 231, 0.72)';
    const width = sample.radius * 0.84;
    for (let row = -2; row <= 2; row += 1) {
      const y = sample.origin.y + row * 12;
      context.beginPath();
      context.moveTo(sample.origin.x - width / 2, y);
      context.lineTo(sample.origin.x + width * (0.14 + (row + 2) * 0.08), y);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  renderDiffractionField(context, sample, width < 640);
}
