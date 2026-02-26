---
title: "CI/CD Integration"
description: "GitHub Actions, GitLab CI, and Azure Pipelines — deterministic AI governance in every pull request."
---

# CI/CD Integration

The FusionTester runs entirely in RAM with **zero external dependencies**. No LLM API keys. No servers. No network. It integrates natively into any CI/CD pipeline without external services.

## GitHub Actions

### Basic

```yaml
# .github/workflows/mva-audit.yml
name: MVA Governance Audit

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci
      - run: npx vitest run --reporter=verbose
```

### With Coverage + Artifacts

```yaml
name: MVA Governance Audit

on: [push, pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci

      # Run all governance tests with coverage
      - run: npx vitest run --reporter=verbose --coverage

      # Upload coverage as artifact
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: coverage/
```

### Separate Jobs per Governance Concern

```yaml
name: MVA Governance Audit

on: [push, pull_request]

jobs:
  egress-firewall:
    name: "SOC2 CC6.1 — Egress Firewall"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: npx vitest run tests/firewall/ --reporter=verbose

  access-control:
    name: "SOC2 CC6.3 — Access Control"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: npx vitest run tests/guards/ --reporter=verbose

  system-rules:
    name: "Context Governance"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: npx vitest run tests/rules/ --reporter=verbose

  ui-blocks:
    name: "Response Quality"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'npm' }
      - run: npm ci
      - run: npx vitest run tests/blocks/ --reporter=verbose
```

This gives you **separate check marks** on every PR:

```
✅ SOC2 CC6.1 — Egress Firewall (3 tests, 0.4s)
✅ SOC2 CC6.3 — Access Control (4 tests, 0.5s)
✅ Context Governance (3 tests, 0.3s)
✅ Response Quality (3 tests, 0.3s)
```

### With JUnit Report (for GitHub PR annotations)

```yaml
- run: npx vitest run --reporter=junit --outputFile=results.xml
- uses: mikepenz/action-junit-report@v4
  if: always()
  with:
    report_paths: results.xml
    check_name: "MVA Governance Results"
```

## GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - test

mva-audit:
  stage: test
  image: node:20
  script:
    - npm ci
    - npx vitest run --reporter=verbose --reporter=junit --outputFile=results.xml
  artifacts:
    when: always
    reports:
      junit: results.xml
```

## Azure DevOps Pipelines

```yaml
# azure-pipelines.yml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'

  - script: npm ci
    displayName: 'Install dependencies'

  - script: npx vitest run --reporter=verbose --reporter=junit --outputFile=results.xml
    displayName: 'Run MVA Governance Audit'

  - task: PublishTestResults@2
    inputs:
      testResultsFormat: 'JUnit'
      testResultsFiles: 'results.xml'
      testRunTitle: 'MVA Governance Audit'
    condition: always()
```

## Pre-Commit Hook

Block commits that break governance:

```bash
# .husky/pre-commit
npx vitest run tests/firewall/ --bail 1
```

Or with lint-staged:

```json
// package.json
{
    "lint-staged": {
        "src/views/**/*.ts": "npx vitest run tests/firewall/ --bail 1",
        "src/agents/**/*.ts": "npx vitest run tests/guards/ --bail 1"
    }
}
```

## Pull Request Status Checks

### Required Checks

Configure your repository to require the governance audit to pass before merging:

1. Go to **Settings → Branches → Branch protection rules**
2. Enable **"Require status checks to pass before merging"**
3. Add these checks:
   - `SOC2 CC6.1 — Egress Firewall`
   - `SOC2 CC6.3 — Access Control`

Now **no PR can merge if PII leaks** or **auth gates are broken**.

### Badge

Add a governance badge to your README:

```markdown
[![MVA Audit](https://github.com/your-org/your-repo/actions/workflows/mva-audit.yml/badge.svg)](https://github.com/your-org/your-repo/actions/workflows/mva-audit.yml)
```

## Performance in CI

The FusionTester is designed for CI speed:

| Metric | Value |
|---|---|
| Cold start (npm ci + vitest) | ~3 seconds |
| Per-test execution | ~2ms |
| 50 tests total | ~100ms |
| Memory usage | ~50 MB |
| API tokens consumed | **0** |
| API keys required | **None** |
| External services | **None** |

::: info Zero Flakiness
Because the FusionTester runs in RAM with zero external dependencies, your CI tests have **zero flakiness**. No API rate limits. No network timeouts. No model behavior variance. The same test produces the same result every time, on every machine.
:::

---

## SOC2 Automated Audit — The Tests That Block PRs

This is where **MCP Fusion** does what no other AI framework can. Each test below maps directly to a SOC2 control. If any of them fail, **the PR cannot merge**.

### CC6.1 — Logical Access: No PII Reaches the LLM

```typescript
// tests/firewall/user.firewall.test.ts
describe('SOC2 CC6.1 — PII Egress Prevention', () => {

    it('passwordHash NEVER reaches the LLM', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 10 });

        for (const user of result.data as any[]) {
            // This is not a hope. This is a mathematical proof.
            // The field is physically absent — not masked, not hidden, REMOVED.
            expect(user).not.toHaveProperty('passwordHash');
        }
    });

    it('tenantId NEVER leaks across tenant boundaries', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 10 });

        for (const user of result.data as any[]) {
            expect(user).not.toHaveProperty('tenantId');
        }
    });

    it('SSN NEVER appears in API responses', async () => {
        const result = await tester.callAction('db_employee', 'find_many', { take: 5 });

        for (const employee of result.data as any[]) {
            expect(employee).not.toHaveProperty('ssn');
            expect(employee).not.toHaveProperty('socialSecurityNumber');
        }
    });

    it('MCP transport contains ZERO sensitive fields', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 5 });

        // The WIRE payload — what actually leaves the server
        const wirePayload = JSON.stringify(result.rawResponse);
        expect(wirePayload).not.toContain('passwordHash');
        expect(wirePayload).not.toContain('bcrypt');
        expect(wirePayload).not.toContain('tenantId');
        expect(wirePayload).not.toContain('ssn');
    });
});
```

### CC6.3 — Access Control: Unauthorized Users Are Blocked

```typescript
// tests/guards/user.guard.test.ts
describe('SOC2 CC6.3 — Role-Based Access Control', () => {

    it('GUEST cannot read user data', async () => {
        const result = await tester.callAction(
            'db_user', 'find_many', { take: 5 },
            { role: 'GUEST' },
        );
        expect(result.isError).toBe(true);
        expect(result.data).toContain('Unauthorized');
    });

    it('GUEST cannot create users', async () => {
        const result = await tester.callAction(
            'db_user', 'create',
            { email: 'hack@evil.com', name: 'Hacker' },
            { role: 'GUEST' },
        );
        expect(result.isError).toBe(true);
    });

    it('GUEST cannot delete users', async () => {
        const result = await tester.callAction(
            'db_user', 'delete', { id: '1' },
            { role: 'GUEST' },
        );
        expect(result.isError).toBe(true);
    });

    it('ADMIN CAN read user data', async () => {
        const result = await tester.callAction(
            'db_user', 'find_many', { take: 5 },
            { role: 'ADMIN' },
        );
        expect(result.isError).toBe(false);
        expect((result.data as any[]).length).toBeGreaterThan(0);
    });

    it('every action is protected — no gaps', async () => {
        const actions = ['find_many', 'create', 'update', 'delete'];
        for (const action of actions) {
            const result = await tester.callAction(
                'db_user', action, {},
                { role: 'GUEST' },
            );
            expect(result.isError).toBe(true);
        }
    });
});
```

### CC6.7 — Output Controls: Only Declared Fields Exist

```typescript
// tests/firewall/order.firewall.test.ts
describe('SOC2 CC6.7 — Output Field Control', () => {

    it('internal fields are stripped from order responses', async () => {
        const result = await tester.callAction('db_order', 'find_many', { take: 5 });

        for (const order of result.data as any[]) {
            // Business logic fields — ALLOWED
            expect(order).toHaveProperty('id');
            expect(order).toHaveProperty('total');
            expect(order).toHaveProperty('status');

            // Internal fields — STRIPPED
            expect(order).not.toHaveProperty('internalNotes');
            expect(order).not.toHaveProperty('profitMargin');
            expect(order).not.toHaveProperty('costPrice');
            expect(order).not.toHaveProperty('supplierEmail');
        }
    });
});
```

### CC7.1 — System Operations: Governance Directives Present

```typescript
// tests/rules/user.rules.test.ts
describe('SOC2 CC7.1 — LLM Governance Directives', () => {

    it('PII handling rules are injected on user responses', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 1 });

        expect(result.systemRules).toContain(
            'Email addresses are PII. Mask when possible.'
        );
    });

    it('financial precision rules are injected on order responses', async () => {
        const result = await tester.callAction('db_order', 'find_many', { take: 1 });

        expect(result.systemRules).toContain(
            'CRITICAL: amount_cents is in CENTS. Divide by 100 for display.'
        );
    });

    it('user rules do NOT appear in order responses (Context Tree-Shaking)', async () => {
        const result = await tester.callAction('db_order', 'find_many', { take: 1 });

        // Proves the LLM only sees relevant governance
        expect(result.systemRules).not.toContain('Email addresses are PII.');
    });
});
```

### CC8.1 — Change Management: Resource Protection

```typescript
// tests/guards/user.oom.test.ts
describe('SOC2 CC8.1 — Input Boundary Protection', () => {

    it('rejects take > 50 (prevents memory exhaustion)', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: 99999 });
        expect(result.isError).toBe(true);
    });

    it('rejects negative take (prevents negative indexing)', async () => {
        const result = await tester.callAction('db_user', 'find_many', { take: -1 });
        expect(result.isError).toBe(true);
    });

    it('rejects SQL injection in string fields', async () => {
        const result = await tester.callAction('db_user', 'create', {
            email: "admin@test.com'; DROP TABLE users; --",
            name: 'Hacker',
        });
        expect(result.isError).toBe(true); // Zod email validation rejects
    });
});
```

---

### GitHub Actions Output

When these tests run in your pipeline, the PR shows:

```
✅ SOC2 CC6.1 — PII Egress Prevention          4 tests passed (0.3s)
✅ SOC2 CC6.3 — Role-Based Access Control       5 tests passed (0.4s)
✅ SOC2 CC6.7 — Output Field Control            1 test passed  (0.2s)
✅ SOC2 CC7.1 — LLM Governance Directives       3 tests passed (0.2s)
✅ SOC2 CC8.1 — Input Boundary Protection       3 tests passed (0.2s)
──────────────────────────────────────────────────────────────────
   Total: 16 tests | 0 failures | 1.3s | $0.00 in API tokens
```

If a developer introduces a regression that leaks `passwordHash`:

```
✅ SOC2 CC6.3 — Role-Based Access Control       5 tests passed (0.4s)
✅ SOC2 CC6.7 — Output Field Control            1 test passed  (0.2s)
✅ SOC2 CC7.1 — LLM Governance Directives       3 tests passed (0.2s)
✅ SOC2 CC8.1 — Input Boundary Protection       3 tests passed (0.2s)
❌ SOC2 CC6.1 — PII Egress Prevention          1 FAILED (0.3s)
   FAIL: passwordHash NEVER reaches the LLM
         Expected: not toHaveProperty('passwordHash')
         Received: { id: '1', name: 'Alice', passwordHash: 'bcrypt$abc' }
──────────────────────────────────────────────────────────────────
   ❌ PR BLOCKED — PII leak detected. Cannot merge.
```

**The PR cannot merge.** The `passwordHash` leak is caught **before** it reaches production, **before** it reaches the LLM, and **before** your compliance officer sees it.

::: danger This is What Automated SOC2 Looks Like
No other AI framework in existence can do this. Every other MCP server relies on a developer opening Claude Desktop and saying *"looks fine to me."* That is not an audit. That is a liability.

**MCP Fusion** converts compliance requirements into `expect()` assertions that run on every commit. The auditor receives a CI/CD log, not a verbal assurance.
:::

### Manual Audit vs Automated Audit

| | Manual SOC2 Audit | MCP Fusion Automated Audit |
|---|---|---|
| **Frequency** | Quarterly or annually | Every commit, every PR |
| **Cost** | $50,000–$250,000 per audit | $0.00 (CI/CD minutes only) |
| **Evidence** | Screenshots, spreadsheets, interviews | Deterministic test results, CI logs |
| **Time to detect leak** | 3–12 months | < 60 seconds |
| **Coverage** | Sample-based (5–10% of code) | 100% of every MVA pipeline |
| **Reproducibility** | Non-reproducible (point-in-time) | Reproducible on every machine |
| **Proof format** | PDF report with checkboxes | `expect().not.toHaveProperty()` |

