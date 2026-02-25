# Contributing to MCP Fusion

Thank you for your interest in contributing to MCP Fusion! This document provides guidelines and information about contributing.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs

Before submitting a bug report:

1. Check the [existing issues](https://github.com/vinkius-core/mcp-fusion/issues) to avoid duplicates
2. Collect information about the bug:
   - Stack trace
   - Node.js version (`node --version`)
   - TypeScript version
   - Package version
   - Steps to reproduce

Then [open a new issue](https://github.com/vinkius-core/mcp-fusion/issues/new?template=bug_report.md) with the bug report template.

### Suggesting Features

Feature requests are welcome! Please:

1. Check existing issues and discussions first
2. Describe the use case clearly
3. Explain why existing features don't solve your problem
4. [Open a feature request](https://github.com/vinkius-core/mcp-fusion/issues/new?template=feature_request.md)

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes**
4. **Add tests** for any new functionality
5. **Run tests**: `npm test`
6. **Run build**: `npm run build`
7. **Ensure 100% test coverage** for new code
8. **Submit a pull request**

#### Pull Request Guidelines

- Follow the existing code style
- Write clear commit messages
- Update documentation if needed
- Add tests for new features
- Keep PRs focused — one feature or fix per PR

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/mcp-fusion.git
cd mcp-fusion

# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build
npm run build
```

### Code Style

- Use TypeScript strict mode
- Follow existing patterns in the codebase
- Write JSDoc comments for public APIs
- Keep functions small and focused
- Use meaningful variable names

### Testing

- Write tests for all new functionality
- Maintain or improve code coverage
- Include edge cases and error scenarios
- Test security boundaries (see `SecurityDeep.test.ts` for examples)

### Documentation

- Update README.md for user-facing changes
- Update relevant docs in `/docs` folder
- Add JSDoc comments to public APIs
- Include code examples where helpful

## Project Structure

This project is a **monorepo** using npm workspaces:

```
mcp-fusion/                          ← Framework root (private, not published)
├── packages/
│   ├── core/                        ← @vinkius-core/mcp-fusion (published)
│   │   ├── src/
│   │   │   ├── core/                # Builder, Registry, Execution, Middleware, Schema
│   │   │   ├── client/              # tRPC-style FusionClient
│   │   │   ├── observability/       # Debug Observer, OpenTelemetry Tracing
│   │   │   ├── presenter/           # MVA (Model-View-Agent) View Layer
│   │   │   ├── prompt/              # Prompt Engine
│   │   │   ├── server/              # MCP Server Attachment
│   │   │   ├── exposition/          # Flat/Grouped Topology Compiler
│   │   │   ├── state-sync/          # Epistemic Cache-Control
│   │   │   ├── introspection/       # Dynamic Manifest Resource
│   │   │   ├── domain/              # Domain model classes
│   │   │   ├── converters/          # Bidirectional type converters
│   │   │   └── index.ts             # Root barrel export
│   │   ├── tests/                   # All framework tests
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── testing/                     ← @vinkius-core/mcp-fusion-testing (published)
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── docs/                            # Documentation (VitePress)
├── package.json                     # Workspace root
└── tsconfig.base.json               # Shared TypeScript config
```

## Questions?

Feel free to [open a discussion](https://github.com/vinkius-core/mcp-fusion/discussions) for questions or ideas.

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
