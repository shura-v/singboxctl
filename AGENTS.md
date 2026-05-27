# AGENTS

## Project Rules

- We add features sequentially in small steps.
- Do not implement speculative functionality that was not explicitly requested.
- We currently own a narrow custom parser for the project's target Xray formats.
- Prefer small, explicit parsers for the exact protocols and fields we support over generic "parse everything" logic.
- If a URI/config feature is not supported by our parser or generated sing-box config yet, fail clearly instead of guessing by default.
- Provider links may contain extra protocol fields that are common in the wild but not fully supported by our current sing-box config generation yet.
- Document provider-link parsing support separately from guaranteed sing-box runtime support when those differ.
- For provider-link fields that we intentionally accept without applying to generated config yet, prefer explicit warnings over silent dropping, and document that behavior clearly.
- Releases are published only from CI.
- Locally we only create changesets; do not perform manual package releases from this repository.
