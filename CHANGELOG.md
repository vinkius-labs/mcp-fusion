# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-02-20

### Changed
- **BREAKING:** Domain model migrated from Java-style getter/setter methods to idiomatic TypeScript public fields. All `getX()`/`setX()` methods removed — use direct property access instead (e.g. `tool.name` instead of `tool.getName()`, `tool.title = 'Deploy'` instead of `tool.setTitle('Deploy')`).
- **BREAKING:** `getParentGroups()` and `getParentGroupRoots()` removed from `AbstractLeaf`. Use `instance.parentGroups` directly; for roots use `instance.parentGroups.map(g => g.getRoot())`.
- **BREAKING:** `getChildrenGroups()`, `getChildrenTools()`, `getChildrenPrompts()`, `getChildrenResources()`, `getParent()`, `setParent()` removed from `Group`. Use `instance.childGroups`, `instance.childTools`, `instance.childPrompts`, `instance.childResources`, `instance.parent` directly.
- **BREAKING:** `Annotations` constructor parameters are now optional: `new Annotations()` is valid. Previously all three were required.
- `ToolAnnotations` empty constructor removed — class is now a plain data class with public fields.

### Fixed
- **Comma operator anti-pattern:** Replaced obscure `indexOf === -1 && (push, true)` pattern with readable `includes()` + explicit return in `AbstractLeaf.addParentGroup()` and `Prompt.addPromptArgument()`.
- **Unused parameter removed:** `sb: string` parameter in `Group.getFullyQualifiedNameRecursive()` was a Java `StringBuilder` remnant — removed.
- **Dead import removed:** Unused `import { z } from 'zod'` in `ToonDescriptionGenerator.ts`.

### Documentation
- `docs/api-reference.md` rewritten for new public-field API with usage examples.

## [0.2.1] - 2026-02-17

### Fixed
- **O(1) Action Routing:** Replaced `Array.find()` linear scan with `Map.get()` in `execute()`. The `_actionMap` is built once during `buildToolDefinition()` and reused across all invocations — fulfilling the README's O(1) performance promise.

### Added
- **Build-Time Schema Collision Detection:** `SchemaGenerator` now calls `assertFieldCompatibility()` to detect incompatible field types across actions at build time. The 3-layer check hierarchy detects base type mismatches (e.g. `string` vs `number`), enum presence conflicts (e.g. `z.enum()` vs `z.string()`), and enum value-set differences — while correctly treating `integer` as compatible with `number`. Throws actionable errors with field name, action key, conflicting types, and guidance.
- **`SchemaUtils.assertFieldCompatibility()`:** Extracted collision detection into `SchemaUtils` as a pure, reusable helper alongside the existing `getActionRequiredFields()`. Keeps `SchemaGenerator` focused on generation, not validation.
- **`SchemaCollision.test.ts`:** 50 dedicated tests covering all primitive type pairs, enum conflicts, integer/number compatibility, nullable edge cases, commonSchema vs action conflicts, hierarchical groups, multi-action chains, error message quality, and runtime behavior after valid builds.

## [0.2.0] - 2026-02-12

### Changed
- **BREAKING:** `zod` moved from `dependencies` to `peerDependencies` with range `^3.25.1 || ^4.0.0`. Projects using zod 4 no longer hit version conflicts.
- **BREAKING:** `@modelcontextprotocol/sdk` moved from `dependencies` to `peerDependencies`. Projects already have it installed — no duplication.

### Fixed
- GitHub URLs in `package.json` and `CONTRIBUTING.md` corrected from `vinkius-core` to `vinkius-labs`.

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

