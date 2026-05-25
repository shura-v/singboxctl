# AGENTS

## Project Rules

- We add features sequentially in small steps.
- Do not implement speculative functionality that was not explicitly requested.
- We currently own a narrow custom parser for the project's target Xray formats.
- Prefer small, explicit parsers for the exact protocols and fields we support over generic "parse everything" logic.
- If a URI/config feature is not supported by our parser yet, fail clearly instead of guessing.
