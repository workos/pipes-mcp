# Contributing to Pipes MCP

Thank you for your interest in contributing to Pipes MCP. This guide will help you get started.

## Development setup

1. Fork and clone the repository.
2. Install dependencies with `pnpm install`.
3. Copy `.env.local.example` to `.env.local` and add your configuration.
4. Start the development server with `pnpm dev`.

See the [README](README.md) for full quick-start instructions.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Next.js development server |
| `pnpm test` | Run tests |
| `pnpm lint` | Lint with Biome |
| `pnpm format` | Format with Biome |
| `pnpm typecheck` | Run TypeScript type checking |

## Code style

This project uses [Biome](https://biomejs.dev/) for linting and formatting. Run `pnpm lint` and `pnpm format` before committing to ensure your changes conform to the project style.

## Submitting a pull request

1. Fork the repository and create a branch from `main`.
2. Make your changes and ensure all checks pass (`pnpm lint`, `pnpm typecheck`, `pnpm test`).
3. Write clear, concise commit messages.
4. Open a pull request against `main` with a description of your changes.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
