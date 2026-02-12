# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-02-12

### Added
- Scaling guide (`docs/scaling.md`) — technical deep-dive into how grouping, tag filtering, TOON compression, schema unification, Zod `.strip()`, and structured errors prevent LLM hallucination at scale.
- Link to scaling guide in README documentation table and Token Management section.

## [0.1.0] - 2026-02-12

### Added
- Core framework with `Tool`, `Resource`, and `Prompt` abstractions.
- `Group` class for logical organization of MCP capabilities.
- Discriminator-based routing for efficient tool selection.
- Strongly typed arguments and outputs using Zod.
- Initial project configuration and CI/CD setup.
- Basic documentation structure.

