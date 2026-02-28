<p align="center">
  <h1 align="center">@vinkius-core/mcp-fusion-aws</h1>
  <p align="center">
    <strong>AWS Lambda & Step Functions Connector</strong> — Auto-discover cloud functions as MCP tools
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@vinkius-core/mcp-fusion-aws"><img src="https://img.shields.io/npm/v/@vinkius-core/mcp-fusion-aws?color=blue" alt="npm" /></a>
  <a href="https://github.com/vinkius-labs/mcp-fusion/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
</p>

---

> AWS Lambda & Step Functions connector for MCP Fusion. Auto-discovers tagged resources and produces GroupedToolBuilders — so AI agents can invoke your cloud functions natively.

## Quick Start

```typescript
import { initFusion } from '@vinkius-core/mcp-fusion';
import { discoverLambdas } from '@vinkius-core/mcp-fusion-aws';

const f = initFusion<AppContext>();
const registry = f.registry();

// Auto-discover Lambda functions tagged with mcp-fusion:true
await discoverLambdas(registry, {
    region: 'us-east-1',
    tagFilter: { 'mcp-fusion': 'true' },
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
import { discoverStepFunctions } from '@vinkius-core/mcp-fusion-aws';

await discoverStepFunctions(registry, {
    region: 'us-east-1',
    prefix: 'mcp-',
});
```

## Installation

```bash
npm install @vinkius-core/mcp-fusion-aws @aws-sdk/client-lambda
```

### Peer Dependencies

| Package | Version |
|---------|---------|
| `@vinkius-core/mcp-fusion` | `^2.0.0` |
| `@aws-sdk/client-lambda` | `^3.0.0` (optional) |
| `@aws-sdk/client-sfn` | `^3.0.0` (optional) |

## Requirements

- **Node.js** ≥ 18.0.0
- **MCP Fusion** ≥ 2.0.0 (peer dependency)
- AWS credentials configured (env vars, IAM role, or AWS config file)

## License

[Apache-2.0](https://github.com/vinkius-labs/mcp-fusion/blob/main/LICENSE)
