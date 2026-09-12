# Failure and recovery contract

- `review_packet_ready`, `reviewing_web`, `review_received`, scientific resolution and user confirmation are distinct facts.
- Bind every review to request ID, PDF hash, SourceMap hash, candidate hash and prompt/response hashes.
- Persist submission before Send and record one canonical conversation. After an ambiguous timeout, resume only that conversation and never resend.
- Provider failure, malformed response, missing fields, unknown passage IDs or changed source identity becomes `blocked_scientific_review`; never fall back to the drafting model.
- A request for missing context becomes `awaiting_review_evidence`. Merge requested SourceMap reads into one supplemental round; unresolved issues then stop at `blocked_alignment`.
- Correct prior parsing or analysis is reused. Rerun only the failed region or review stage unless the parser version or source identity changed.
