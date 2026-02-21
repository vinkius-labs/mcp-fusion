## ⚡ Breaking Changes — Idiomatic TypeScript Naming

All Java-style `Abstract*` prefixes removed. Classes renamed to idiomatic TypeScript conventions:

| Before | After |
|--------|-------|
| `AbstractBase` | `BaseModel` |
| `AbstractLeaf` | `GroupItem` |
| `AbstractConverter` | `ConverterBase` |
| `AbstractGroupConverter` | `GroupConverterBase` |
| `AbstractToolConverter` | `ToolConverterBase` |
| `AbstractPromptConverter` | `PromptConverterBase` |
| `AbstractResourceConverter` | `ResourceConverterBase` |
| `AbstractToolAnnotationsConverter` | `ToolAnnotationsConverterBase` |

Private methods `addLeaf()`/`removeLeaf()` → `addChild()`/`removeChild()` in Group.

## Added
- **`ConverterBase<TSource, TTarget>`** — Generic base for bidirectional converters (DRY elimination)
- **`removeFromArray<T>()`** — Reusable utility replacing 4 duplicated splice patterns
- **ESLint integration** — Flat config with typescript-eslint, `npm run lint` / `npm run lint:fix`
- **`JsonSchemaObject` interface** — Typed zodToJsonSchema output, eliminating raw casts

## Changed
- `success('')` now returns `'OK'` instead of empty string
- `ToolAnnotationsConverter` API normalized (no overloading)

## Fixed
- Dead `description` field removed from `getGroupSummaries` return type
- Unused `z` import removed from `GroupedToolBuilder`
- `ToolRegistry.callHandler` request parameter properly typed

## Removed
- `hashCode()` / `equals()` from `BaseModel` (Java pattern)
- `toString()` from all 8 domain model classes (Java pattern)
- Redundant null guard from `BaseModel` constructor

---

**Validation:** tsc ✅ | 475 tests ✅ | ESLint 0 problems ✅
