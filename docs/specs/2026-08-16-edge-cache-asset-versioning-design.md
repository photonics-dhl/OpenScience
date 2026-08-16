# Edge cache asset versioning design

## Goal

Reduce Alibaba Cloud public egress without making a personal computer part of
production, while ensuring every asset update is visible immediately.

## Design

- Keep the editable optical PNG files at their existing canonical paths.
- Publish each file through a URL containing the first 16 hexadecimal digits of
  its SHA-256 digest.
- Configure Next.js with an exact rewrite from each versioned URL to its
  canonical public file and return
  `Cache-Control: public, max-age=31536000, immutable` only for those exact
  versioned URLs.
- Use one shared asset manifest in the server-rendered plates and the WebGL image
  loader. A file change therefore requires a manifest digest update, which also
  changes every consumer URL.
- Keep HTML, API responses, authenticated content, and the unversioned source
  paths outside the immutable-cache rule.

## Correctness contract

An automated test calculates each canonical file's SHA-256 and rejects a
manifest whose digest or versioned URL is stale. It also verifies exact rewrite
and header rules, server-rendered URLs, and WebGL loader use of the manifest.

## Deployment and rollback

Deployment uses the existing production build and deploy runbook. Old hashed
URLs may remain cached safely because new content always receives a new URL.
Rollback restores the previous application release; canonical source assets are
never renamed or deleted.
