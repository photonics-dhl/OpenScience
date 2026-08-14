# Optical Idle Attention Design

## Goal

Make the Landing `Science evolves.` surface visibly alive before any pointer
input, while keeping the shared renderer's pointer interaction a distinct,
stronger local state and removing any mouse-shaped dark artefact. Lab remains
the exact accepted diagnostic surface.

## Visual model

- Resting motion is a Landing-only, slow optical current concentrated around
  the title and central energy seam. A restrained cool-white-warm light band
  crosses the authored plates; it is not a whole-stage scale pulse.
- Pointer motion keeps the accepted local wake, caps and 700ms recovery. While
  local input is active, the autonomous title current becomes subordinate; it
  resumes continuously after recovery.
- The operating-system cursor is hidden only inside the Landing optical stage;
  interactive links retain their normal cursor behavior. No resting or active frame may contain a cursor glyph, closed radial halo,
  black sampling hole or opaque dark replacement patch. Texture coordinates
  remain edge-safe and the canvas contributes optical deltas, not a second
  dark copy of the authored plates.
- `prefers-reduced-motion: reduce` remains the exact accepted static artwork
  with no WebGL canvas.

## Acceptance

- Three no-input windows show a clearly measurable central-title-band change at a
  perceptual threshold above single-code-value noise, not merely 1% pixels at
  threshold 1.
- A real-browser computed-style gate proves the operating-system cursor is
  hidden on the Landing optical stage; retained desktop/mobile idle screenshots
  are inspected for cursor-like dark shapes or opaque black replacement areas.
- Idle and pointer captures are observably different; the pointer state still
  passes existing locality, halo, cap, recovery, touch and lifecycle gates.
- Desktop and mobile normal/reduced Landing captures remain unclipped and free
  of runtime errors.
