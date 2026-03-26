<p align="center">
  <h1 align="center">@vurb/aws</h1>
  <p align="center">
    <strong>MCP AWS Lambda Connector for Vurb.ts</strong> — A framework for creating MCP servers on AWS<br/>
    Auto-discover Lambda & Step Functions as MCP tools · IAM integration · Multi-region
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vurb/aws"><img src="https://img.shields.io/npm/v/@vurb/aws?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP" /></a>
  <a href="https://vurb.vinkius.com/"><img src="https://img.shields.io/badge/Vurb.ts-framework-0ea5e9" alt="Vurb.ts" /></a>
</p>

---

> **MCP AWS Connector for Vurb.ts** — the Model Context Protocol framework for building production MCP servers. Auto-discovers tagged AWS Lambda & Step Functions and produces typed MCP tools — so AI agents can invoke your cloud functions natively via IAM.

## Quick Start

```typescript
import { initVurb } from '@vurb/core';
import { discoverLambdas } from '@vurb/aws';

const f = initVurb<AppContext>();
const registry = f.registry();

// Auto-discover Lambda functions tagged with Vurb.ts:true
await discoverLambdas(registry, {
    region: 'us-east-1',
    tagFilter: { 'Vurb.ts': 'true' },
});
```

## Features

| Feature | Description |
|---------|-------------|
| **Auto-Discovery** | Scans AWS for Lambda functions tagged for MCP exposure |
| **Step Functions** | Trigger and poll state machines as long-running MCP actions |
| **GroupedToolBuilders** | Each Lambda becomes a typed MCP tool with Zod validation |
| **IAM Integration** | Uses your existing AWS credentials and IAM roles |
| **Multi-Region** | Discover across multiple regions simultaneously |

## Step Functions

```typescript
import { discoverStepFunctions } from '@vurb/aws';

await discoverStepFunctions(registry, {
    region: 'us-east-1',
    prefix: 'mcp-',
});
```

## Installation

```bash
npm install @vurb/aws @aws-sdk/client-lambda
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `vurb` | `^2.0.0` |
| `@aws-sdk/client-lambda` | `^3.0.0` (optional) |
| `@aws-sdk/client-sfn` | `^3.0.0` (optional) |

## Requirements

- **Node.js** ≥ 18.0.0
- **Vurb.ts** ≥ 2.0.0 (peer dependency)
- AWS credentials configured (env vars, IAM role, or AWS config file)

## License

[Apache-2.0](https://github.com/vinkius-labs/vurb.ts/blob/main/LICENSE)
