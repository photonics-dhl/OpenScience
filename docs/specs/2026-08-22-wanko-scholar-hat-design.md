# Wanko Scholar Hat Design

Status: **APPROVED FOR VISUAL AUTHORING — not yet approved for Cubism import**

## Goal

Create a permanent scholar hat for canonical Wanko that reads as a worn
Live2D accessory rather than a flat overlay.

## Visual direction

- Deep indigo soft mortarboard with restrained warm-gold piping.
- Shortened diamond brim and a rounded crown fitted to Wanko's broad head.
- Small paw medallion and right-side ivory tassel; no crown, text, or extra
  character pixels.
- The front brim overlaps only the upper forehead; rear brim remains behind
  both ears so the canonical face and ears stay readable.

## Layer contract

The Photoshop source must keep a shared transparent canvas and separate at
least: rear brim/crown, front brim, gold trim, top button, cord, tassel,
medallion, highlight, and contact shadow. The cord and tassel must remain
independently deformable. The hat body follows head angle/body breath; work
and scan states may add restrained trim/medallion light but the hat remains
visible in every state, including reduced motion.

### Cord-and-tassel correction amendment

The approved indigo hat body is now immutable. Replace only the right-side
cord endpoint and tassel: button, cord, brim crossing and one compact tassel
must read as one continuous object. In the worn composite the right ear may
occlude the middle of the cord, but both attachment and tassel end must remain
legible. White feather/hair shapes, floating fragments, a second tassel and
changes to the hat body are rejected.

## Acceptance gates

- Canonical Wanko pixels are never baked into the hat PSD.
- Exactly one hat is visible; no background, checkerboard, watermark, text,
  crown, or duplicated ornaments.
- Face, eyebrows, eyes, ears, and cheeks remain unobstructed in the neutral
  composite.
- Native 288 px and 160 px previews still read as a scholar cap; the tassel
  does not merge into the face or disappear.
- User approves the neutral composite before any Cubism import or `.cmo3`
  save.
