import type { OpticalSample, OpticalViewport } from './field-model';

export interface GlyphParticle {
  alpha: number;
  x: number;
  y: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function dot(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
) {
  if (alpha <= 0.01) return;
  context.fillStyle = `rgba(241, 238, 231, ${clamp(alpha, 0, 0.92)})`;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function chromaticFringe(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
) {
  context.fillStyle = `rgba(255, 78, 34, ${clamp(alpha * 0.2, 0, 0.12)})`;
  context.beginPath();
  context.arc(x - 1.15, y, radius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = `rgba(87, 184, 204, ${clamp(alpha * 0.16, 0, 0.1)})`;
  context.beginPath();
  context.arc(x + 1.15, y, radius, 0, Math.PI * 2);
  context.fill();
}

function renderGlyphDiffraction(
  context: CanvasRenderingContext2D,
  sample: OpticalSample,
  glyphParticles: readonly GlyphParticle[],
  fieldScale: number,
  motionScale: number,
) {
  const { aperture } = sample;
  const fieldWidth = sample.radius * 0.95 * fieldScale;

  for (const particle of glyphParticles) {
    const dx = particle.x - aperture.x;
    if (Math.abs(dx) > fieldWidth) continue;

    const proximity = 1 - Math.abs(dx) / fieldWidth;
    const energy = 0.72 + sample.evidence * 0.28;
    let x = particle.x;
    let y = particle.y;

    if (dx <= 0) {
      const compression = Math.pow(proximity, 1.75) * 0.68;
      x += (aperture.x - particle.x) * compression;
      y += Math.sin(particle.y * 0.105 + sample.phase * 2.1)
        * proximity * (1.8 * motionScale + sample.evidence * 3.8);
      y += sample.verticalBias * proximity;
    } else {
      const refraction = Math.exp(-dx / (fieldWidth * 0.52));
      x += Math.sin((particle.y - aperture.y) * 0.046 + sample.phase)
        * refraction * (4 * motionScale + sample.evidence * 7);
      y += Math.sin(dx * 0.052 + sample.phase * 2.4)
        * refraction * (2.5 * motionScale + sample.evidence * 6.5);
      y += sample.verticalBias * refraction;
    }

    const grain = 0.48 + proximity * 0.88;
    const alpha = particle.alpha * (0.46 + proximity * 0.54) * energy;
    dot(context, x, y, grain, alpha);
    if (dx > 0 && dx < fieldWidth * 0.42 && sample.evidence > 0.04) {
      chromaticFringe(context, x, y, grain * 0.78, alpha * sample.evidence);
    }
  }
}

function renderFocalCaustic(context: CanvasRenderingContext2D, sample: OpticalSample, viewport: OpticalViewport) {
  const { aperture } = sample;
  const spacing = viewport.width < 640 ? 6 : 4;
  const halfHeight = viewport.height * 0.5;

  for (let y = spacing / 2; y < viewport.height; y += spacing) {
    const dy = y - aperture.y;
    const normalizedY = Math.min(1, Math.abs(dy) / halfHeight);
    const envelope = 1.2 + Math.pow(normalizedY, 1.65) * (viewport.width < 640 ? 24 : 62);
    const fade = Math.pow(1 - normalizedY * 0.68, 1.6);

    for (let lane = -4; lane <= 4; lane += 1) {
      const lanePosition = lane / 4;
      const x = aperture.x
        + lanePosition * envelope
        + Math.sin(y * 0.031 + sample.phase * 1.7 + lane) * (0.7 + normalizedY * 1.6);
      const alpha = fade * (0.07 + (1 - Math.abs(lanePosition)) * 0.2) * (0.78 + sample.evidence * 0.22);
      dot(context, x, y + sample.verticalBias * (1 - normalizedY), 0.45 + fade * 0.42, alpha);
    }
  }

  dot(context, aperture.x, aperture.y + sample.verticalBias, 1.8 + sample.evidence * 0.7, 0.82);
}

function renderFresnelGrain(context: CanvasRenderingContext2D, sample: OpticalSample, mobile: boolean) {
  const { aperture } = sample;
  const families = mobile ? 6 : 11;
  const steps = mobile ? 42 : 78;
  const reach = sample.radius * (mobile ? 1.1 : 1.85);

  for (let family = 0; family < families; family += 1) {
    for (const side of [-1, 1] as const) {
      for (let step = 1; step <= steps; step += 1) {
        const progress = step / steps;
        const x = aperture.x + 5 + progress * reach;
        const spread = Math.pow(progress, 1.42) * (18 + family * (mobile ? 8 : 13));
        const phaseRipple = Math.sin(progress * 11 + sample.phase * 1.8 + family * 0.63) * (1.2 + progress * 3.2);
        const y = aperture.y + side * (spread + phaseRipple) + sample.verticalBias * (1 - progress);
        const alpha = (1 - progress) * (1 - family / (families + 2)) * (0.065 + sample.evidence * 0.035);
        dot(context, x, y, 0.42 + (1 - progress) * 0.34, alpha);
      }
    }
  }
}

function renderAcceptedWaterBand(
  context: CanvasRenderingContext2D,
  sample: OpticalSample,
  viewport: OpticalViewport,
  plate: CanvasImageSource,
) {
  const { height, width } = viewport;
  const sourceWidth = 'naturalWidth' in plate ? plate.naturalWidth : width;
  const sourceHeight = 'naturalHeight' in plate ? plate.naturalHeight : height;
  const top = height * .27;
  const bottom = height * .62;
  const strips = width < 640 ? 30 : 56;
  const stripHeight = (bottom - top) / strips;
  const baseAmplitude = width < 640 ? 2.6 : 4.2;
  const amplitude = baseAmplitude + sample.evidence * (width < 640 ? 2 : 3.6);

  context.save();
  for (let strip = 0; strip < strips; strip += 1) {
    const y = top + strip * stripHeight;
    const progress = (strip + .5) / strips;
    const envelope = Math.sin(progress * Math.PI);
    const wave = Math.sin(sample.phase * 1.35 + progress * 10.5)
      + Math.sin(sample.phase * .72 - progress * 18.0) * .34;
    const shift = wave * amplitude * (.58 + envelope * .42);
    const sourceY = y / height * sourceHeight;
    const sourceStripHeight = (stripHeight + 1) / height * sourceHeight;
    context.save();
    context.beginPath();
    context.rect(0, y, width, stripHeight + 1);
    context.clip();
    context.drawImage(
      plate,
      0,
      sourceY,
      sourceWidth,
      sourceStripHeight,
      shift,
      y,
      width,
      stripHeight + 1,
    );
    context.restore();
  }
  context.restore();
}

export function renderOpticalField(
  context: CanvasRenderingContext2D,
  sample: OpticalSample,
  viewport: OpticalViewport,
  glyphParticles: readonly GlyphParticle[] = [],
  motionScale = 1,
  fieldScale = 1,
  acceptedPlate: CanvasImageSource | null = null,
) {
  const { width, height, dpr } = viewport;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  if (acceptedPlate) renderAcceptedWaterBand(context, sample, viewport, acceptedPlate);
  renderGlyphDiffraction(context, sample, glyphParticles, fieldScale, motionScale);
  renderFocalCaustic(context, sample, viewport);
  renderFresnelGrain(context, sample, width < 640);
}
