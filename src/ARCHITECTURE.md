# Architecture

## Folder intent
- src/features/<feature> holds feature-specific components, hooks, services, and types.
- src/shared holds cross-feature UI, hooks, and utilities.
- src/pages should be thin shells that wire routing + feature modules.

## Import rules
- Features may import from src/shared and their own feature only.
- Shared must not import from features.
- Pages may import from features and shared.
- Avoid cross-feature imports; move shared code to src/shared instead.
