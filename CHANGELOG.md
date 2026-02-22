# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-02-21

### Added
- **Strict TypeScript flags:** `noUncheckedIndexedAccess` and `noFallthroughCasesInSwitch` enabled in `tsconfig.json`.
- **ESLint type-aware rules:** Added `no-floating-promises`, `no-misused-promises`, `await-thenable`, `require-await`, `no-unnecessary-condition`, `consistent-type-imports`, and `consistent-type-exports`. Upgraded `no-explicit-any` from `warn` to `error`.
- **`createIcon()` factory function:** Creates immutable `Icon` instances.
- **`createToolAnnotations()` factory function:** Creates immutable `ToolAnnotations` instances.
- **`createAnnotations()` factory function:** Creates immutable `Annotations` instances.
- **Edge-case test suite (`EdgeCases.test.ts`):** 37 new tests covering `getActionMetadata()`, group-level middleware chains, frozen guard on all config methods, error paths (non-Error throws, middleware errors), `ResponseHelper` empty-string fallback, `ConverterBase` null filtering, custom discriminator routing, and description generator edge cases.
- **Enterprise-grade test suites:** Added `InvariantContracts.test.ts` (56 tests: determinism, execution isolation, context immutability, handler chaos, unicode/binary boundaries, re-entrancy, concurrent registry stress, API equivalence, FusionClient contracts), `DeepVerification.test.ts`, `LargeScaleScenarios.test.ts`, `SecurityDeep.test.ts` (15 attack vectors), `McpServerAdapter.test.ts` (duck-type detection, detach lifecycle), `StreamingProgress.test.ts`, `EndToEnd.test.ts` (full-stack integration), and `ToonDescription.test.ts`.
- **Test coverage improved:** 773 tests across 33 files, 100% function coverage. Comprehensive invariant, security, and adversarial testing.

### Changed
- **BREAKING:** `Icon`, `ToolAnnotations`, and `Annotations` converted from mutable classes to `readonly` interfaces with factory functions (`createIcon()`, `createToolAnnotations()`, `createAnnotations()`). Use factory functions instead of `new Icon()`, `new ToolAnnotations()`, `new Annotations()`.
- **Converter API simplified:** `ConverterBase` abstract methods renamed from `convertFromSingle`/`convertToSingle` to `convertFrom`/`convertTo`. Domain-specific converter bases (`GroupConverterBase`, `ToolConverterBase`, etc.) no longer have redundant bridge methods — they directly extend `ConverterBase<DomainType, DtoType>`.
- **`ConverterBase.filter()`** now uses `NonNullable<T>` type predicate for better type narrowing in batch operations.
- **`BaseModel`** properties (`name`, `nameSeparator`) made `readonly`.
- **`InternalAction`** and **`ActionMetadata`** properties made `readonly` for immutability.
- **`ToolRegistry._builders`** map made `readonly`.
- All `import type` declarations enforced across the codebase via ESLint auto-fix.
- Removed unnecessary `async` from `ToolRegistry` detach handler (fixes `require-await`).
- Removed unnecessary truthy check in `GroupedToolBuilder._buildValidationSchema` (fixes `no-unnecessary-condition`).

### Fixed
- **Non-null assertions eliminated:** All `!` operators in `GroupedToolBuilder.ts` replaced with explicit guards and checks.
- **`McpServerLike` typing:** Replaced `any` with `never[]` for duck-typing safety in `ToolRegistry`.

## [0.5.0] - 2026-02-21

### Added
- **`ConverterBase<TSource, TTarget>`:** Generic base class for all bidirectional converters. Consolidates the batch conversion logic (`map` + null filtering) that was previously duplicated across `GroupConverterBase`, `ToolConverterBase`, `PromptConverterBase`, `ResourceConverterBase`, and `ToolAnnotationsConverterBase`. Domain-specific converters now extend this base via bridge methods, eliminating the DRY violation while maintaining full backward compatibility.
- **`removeFromArray<T>()` utility:** Extracted duplicated `indexOf` + `splice` pattern into a reusable generic helper in `src/utils.ts`. Used by `GroupItem`, `Prompt`, and `Group`.
- **ESLint integration:** Added `eslint.config.js` (flat config) with `typescript-eslint` for type-aware linting. `npm run lint` / `npm run lint:fix` scripts available.
- **`JsonSchemaObject` interface:** Typed the `zodToJsonSchema` output in `SchemaGenerator.ts`, eliminating raw `as Record<string, unknown>` casts.

### Changed
- **BREAKING:** Java-style naming convention removed — all classes renamed to idiomatic TypeScript:
  - `AbstractBase` → `BaseModel` (file: `BaseModel.ts`)
  - `AbstractLeaf` → `GroupItem` (file: `GroupItem.ts`)
  - `AbstractConverter` → `ConverterBase` (file: `ConverterBase.ts`)
  - `AbstractGroupConverter` → `GroupConverterBase`
  - `AbstractToolConverter` → `ToolConverterBase`
  - `AbstractPromptConverter` → `PromptConverterBase`
  - `AbstractResourceConverter` → `ResourceConverterBase`
  - `AbstractToolAnnotationsConverter` → `ToolAnnotationsConverterBase`
  - `addLeaf()` / `removeLeaf()` → `addChild()` / `removeChild()` (private methods in `Group`)
- **BREAKING:** `ToolAnnotationsConverter` API normalized — method overloading removed. Use `convertFromToolAnnotation()` / `convertToToolAnnotation()` for single items, and `convertFromToolAnnotations()` / `convertToToolAnnotations()` for batch. Previous overloaded signatures no longer exist.
- **BREAKING:** `ToolAnnotationsConverterBase` abstract methods renamed from `convertFromToolAnnotationsSingle` / `convertToToolAnnotationsSingle` to `convertFromToolAnnotation` / `convertToToolAnnotation`.
- `success('')` now returns `'OK'` instead of an empty string — prevents confusing empty MCP responses.

### Fixed
- **`getGroupSummaries` dead field:** Removed unused `description` field from the return type — only `name` and `actions` were consumed.
- **Unused import:** Removed dead `z` import from `GroupedToolBuilder.ts`.
- **`ToolRegistry` typing:** Typed `callHandler` request parameter instead of `any`.

### Removed
- **BREAKING:** `hashCode()` and `equals()` methods removed from `BaseModel`. These were Java `Object` patterns with no runtime utility in TypeScript/JavaScript — use `===` for identity comparison.
- **BREAKING:** `toString()` methods removed from all domain model classes (`Group`, `Tool`, `Prompt`, `PromptArgument`, `Resource`, `Icon`, `ToolAnnotations`, `Annotations`). These used the Java `ClassName [field=value]` format — use `JSON.stringify()` or structured logging instead.
- Redundant null/undefined constructor guard removed from `BaseModel` — TypeScript strict mode handles this at compile time.

## [0.4.0] - 2026-02-20

### Changed
- **BREAKING:** Domain model migrated from Java-style getter/setter methods to idiomatic TypeScript public fields. All `getX()`/`setX()` methods removed — use direct property access instead (e.g. `tool.name` instead of `tool.getName()`, `tool.title = 'Deploy'` instead of `tool.setTitle('Deploy')`).
- **BREAKING:** `getParentGroups()` and `getParentGroupRoots()` removed from `GroupItem`. Use `instance.parentGroups` directly; for roots use `instance.parentGroups.map(g => g.getRoot())`.
- **BREAKING:** `getChildrenGroups()`, `getChildrenTools()`, `getChildrenPrompts()`, `getChildrenResources()`, `getParent()`, `setParent()` removed from `Group`. Use `instance.childGroups`, `instance.childTools`, `instance.childPrompts`, `instance.childResources`, `instance.parent` directly.
- **BREAKING:** `Annotations` constructor parameters are now optional: `new Annotations()` is valid. Previously all three were required.
- `ToolAnnotations` empty constructor removed — class is now a plain data class with public fields.

### Fixed
- **Comma operator anti-pattern:** Replaced obscure `indexOf === -1 && (push, true)` pattern with readable `includes()` + explicit return in `GroupItem.addParentGroup()` and `Prompt.addPromptArgument()`.
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

