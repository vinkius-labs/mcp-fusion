---
title: "Command-Line Runner"
description: "Run, filter, watch, and report — every CLI option for the FusionTester pipeline."
---

# Command-Line Runner

The FusionTester is **runner-agnostic** — it returns plain JavaScript objects. You can use any test runner you want: **Vitest**, **Jest**, **Mocha**, or Node's native `node:test`. This page documents the most common CLI patterns using Vitest (recommended).

## Running Tests

### Run All Tests

```bash
npx vitest run
```

Output:

```
 ✓ tests/firewall/user.firewall.test.ts (3 tests) 4ms
 ✓ tests/guards/user.guard.test.ts (4 tests) 3ms
 ✓ tests/rules/user.rules.test.ts (3 tests) 2ms
 ✓ tests/blocks/analytics.blocks.test.ts (3 tests) 2ms
 ✓ tests/guards/user.oom.test.ts (5 tests) 2ms

 Test Files  5 passed (5)
      Tests  18 passed (18)
   Duration  520ms
```

### Run with Verbose Output

```bash
npx vitest run --reporter=verbose
```

Shows every individual test with timing:

```
 ✓ tests/firewall/user.firewall.test.ts (3 tests) 4ms
   ✓ User Egress Firewall > strips passwordHash from response 2ms
   ✓ User Egress Firewall > strips tenantId (multi-tenant isolation) 1ms
   ✓ User Egress Firewall > preserves declared fields accurately 1ms
```

## Selecting Tests

### By Directory (Governance Concern)

```bash
# Egress Firewall audits only
npx vitest run tests/firewall/

# Middleware & OOM Guard audits only
npx vitest run tests/guards/

# System Rules audits only
npx vitest run tests/rules/

# UI Blocks audits only
npx vitest run tests/blocks/
```

### By File (Specific Entity)

```bash
# User firewall tests only
npx vitest run tests/firewall/user.firewall.test.ts

# Order guard tests only
npx vitest run tests/guards/order.guard.test.ts
```

### Multiple Directories/Files

```bash
# Firewall + Rules (skip guards and blocks)
npx vitest run tests/firewall/ tests/rules/

# Specific files
npx vitest run tests/firewall/user.firewall.test.ts tests/rules/user.rules.test.ts
```

## Filtering by Test Name

Use `-t` (or `--testNamePattern`) to filter by test description:

```bash
# Only tests containing "passwordHash"
npx vitest run -t "passwordHash"

# Only tests containing "GUEST"
npx vitest run -t "GUEST"

# Only tests containing "OOM"
npx vitest run -t "OOM"

# Only truncation tests
npx vitest run -t "truncat"

# Only tests for ADMIN role
npx vitest run -t "ADMIN"

# Only email validation tests
npx vitest run -t "email"

# Only "strips" tests (egress firewall)
npx vitest run -t "strips"
```

### Combining Directory + Name Filter

```bash
# Only user firewall tests that mention "password"
npx vitest run tests/firewall/user.firewall.test.ts -t "password"

# Only guard tests for GUEST role
npx vitest run tests/guards/ -t "GUEST"

# Only OOM tests about boundaries
npx vitest run tests/guards/ -t "rejects"
```

## Watch Mode

Re-runs tests automatically when source files change — essential during development:

```bash
# Watch all tests
npx vitest watch

# Watch only firewall tests
npx vitest watch tests/firewall/

# Watch with name filter
npx vitest watch -t "passwordHash"

# Watch specific file
npx vitest watch tests/guards/user.guard.test.ts
```

Watch mode re-runs **only the affected tests** when you edit a source file:

```
RERUN  tests/firewall/user.firewall.test.ts x 1

 ✓ tests/firewall/user.firewall.test.ts (3 tests) 3ms
   ✓ User Egress Firewall > strips passwordHash from response 2ms
   ✓ User Egress Firewall > strips tenantId (multi-tenant isolation) 0ms
   ✓ User Egress Firewall > preserves declared fields accurately 0ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  180ms

 PASS  Waiting for file changes...
       press h to show help, press q to quit
```

## Coverage

```bash
# Run with coverage
npx vitest run --coverage

# Coverage for specific directory
npx vitest run --coverage tests/firewall/

# Coverage with specific reporter
npx vitest run --coverage --coverage.reporter=text --coverage.reporter=html
```

Example output:

```
 % Coverage Report
 --------------------------------|---------|----------|---------|---------|
 File                            | % Stmts | % Branch | % Funcs | % Lines |
 --------------------------------|---------|----------|---------|---------|
 src/views/user.presenter.ts     |   100   |   100    |   100   |   100   |
 src/views/order.presenter.ts    |    92   |    85    |   100   |    92   |
 src/agents/user.tool.ts         |    95   |    90    |   100   |    95   |
 src/agents/order.tool.ts        |    88   |    80    |   100   |    88   |
 src/models/user.schema.ts       |   100   |   100    |   100   |   100   |
 src/models/order.schema.ts      |   100   |   100    |   100   |   100   |
 --------------------------------|---------|----------|---------|---------|
 All files                       |    96   |    92    |   100   |    96   |
 --------------------------------|---------|----------|---------|---------|
```

## Output Formats

### Default (dots)

```bash
npx vitest run
```

### Verbose (every test listed)

```bash
npx vitest run --reporter=verbose
```

### JSON (machine-readable)

```bash
npx vitest run --reporter=json --outputFile=results.json
```

### JUnit XML (CI/CD integration)

```bash
npx vitest run --reporter=junit --outputFile=results.xml
```

### Multiple reporters simultaneously

```bash
npx vitest run --reporter=verbose --reporter=junit --outputFile.junit=results.xml
```

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | All tests passed |
| `1` | At least one test failed |
| `2` | Configuration error |

## Stopping Early

```bash
# Stop on first failure
npx vitest run --bail 1

# Stop after 5 failures
npx vitest run --bail 5
```

## Test Execution Order

```bash
# Randomize execution order
npx vitest run --sequence.shuffle

# Run in parallel (default)
npx vitest run --pool=threads

# Run sequentially  
npx vitest run --pool=forks --poolOptions.forks.singleFork
```

## Jest Equivalent Commands

If your project uses Jest instead of Vitest:

```bash
# Run all tests
npx jest

# Run by directory
npx jest tests/firewall/

# Filter by name
npx jest -t "passwordHash"

# Watch mode
npx jest --watch

# Coverage
npx jest --coverage

# Verbose
npx jest --verbose

# Bail on first failure
npx jest --bail
```

## Node.js Native Test Runner

If you prefer zero dependencies:

```bash
# Run all tests
node --test tests/

# Run specific file
node --test tests/firewall/user.firewall.test.ts

# Filter by name
node --test --test-name-pattern="passwordHash" tests/
```

Notice what's missing from every command above: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `CLAUDE_API_KEY`. The FusionTester runs 100% in RAM. No LLM calls. No token costs. No rate limits. No flaky tests from API outages.
