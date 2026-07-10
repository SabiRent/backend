# HAVN

> HAVN, pronounced "haven", is a property manager backend API built to help landlords track properties, units, tenants, and rent in one place. The platform focuses on reducing missed payments, simplifying rent tracking, and keeping a clear history of tenant activity.

---

## For AI Agents

> Before performing any file operations, read [AGENTS.md](./AGENTS.md) and follow the file access policy.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Git Workflow and Commit Convention](#git-workflow-and-commit-convention)
- [Before You Push - Sync Your Env](#before-you-push---sync-your-env)

---

## Prerequisites

Before you begin, make sure you have the following installed:

| Tool                           | Notes                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------ |
| [Node.js](https://nodejs.org/) | Use a current Node.js release that supports modern ESM and TypeScript tooling. |
| [npm](https://www.npmjs.com/)  | This project uses npm and ships with a `package-lock.json`.                    |

> Do not mix package managers. Keep the README, lockfile, and dependency workflow aligned.

---

## Tech Stack

Based on `package.json`, HAVN uses:

- **Runtime** - Node.js
- **Framework** - Express 5
- **Language** - TypeScript
- **Database** - MongoDB via Mongoose
- **Authentication and Security** - `argon2`, `jsonwebtoken`, `cookie-parser`, `helmet`, `cors`, `rate-limiter-flexible`
- **Validation** - Zod
- **File Uploads** - Multer
- **Media Storage** - Cloudinary
- **Email** - Nodemailer
- **Background Jobs** - BullMQ
- **Caching / Queue Backend** - ioredis
- **API Documentation** - Swagger UI + OpenAPI tooling via `@asteasolutions/zod-to-openapi`
- **Logging** - Pino + `pino-http`
- **Compression** - `compression`
- **Utility Libraries** - `dotenv`, `validator`, `http-status-codes`
- **Build Tooling** - `tsdown`
- **Linting** - ESLint
- **Formatting** - Prettier
- **Testing** - Vitest + Supertest
- **Git Hooks** - Husky, lint-staged, Commitlint

---

## Project Structure

```text
.
├── AGENTS.md
├── README.md
├── package.json
├── package-lock.json
├── scripts/
├── src/
├── tests/
│   ├── integration/
│   │   └── user.spec.ts
│   ├── setup.ts
│   └── unit/
├── tsconfig.json
├── tsconfig.build.json
└── tsdown.config.ts
```

### Notable Areas

- `src/` contains the application source code.
- `scripts/` contains repository automation such as environment syncing.
- `tsdown.config.ts` configures the production build.
- `tsconfig*.json` files configure TypeScript for development and builds.

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repo-url>
cd backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create your local environment file

If the project provides an example file, copy it and fill in your local values:

```bash
cp .env.example .env
```

### 4. Start the development server

```bash
npm run dev
```

The dev server runs `tsx watch src/server.ts`, so code changes restart the API automatically.

---

## Environment Variables

Use `.env` for local runtime settings and secrets. The source of truth for required keys should be `.env.example`, and `npm run sync-env` keeps that file aligned with the local environment.

| Variable type | What it is for |
| --- | --- |
| App settings | Runtime mode and server port. |
| Database config | MongoDB connection details. |
| Auth secrets | Token signing or session secrets. |
| CORS settings | Allowed frontend origin(s). |
| Cache and jobs | Redis settings for queues or rate limiting. |
| Third-party services | Credentials for tools such as Cloudinary or email providers. |

### Notes

- Keep real secrets only in `.env`.
- Commit only non-sensitive key names in `.env.example`.
- Keep test-only overrides in `.env.test` when the test environment needs values that differ from local development.
- If you add, rename, or remove a variable, run `npm run sync-env`.

---

## Available Scripts

Run all commands with npm:

| Script             | Command                    | Description                                               |
| ------------------ | -------------------------- | --------------------------------------------------------- |
| `dev`              | `npm run dev`              | Start the API in watch mode with `tsx`.                   |
| `build`            | `npm run build`            | Compile the server bundle with `tsdown`.                  |
| `start`            | `npm start`                | Run the compiled production build from `dist/server.mjs`. |
| `type-check`       | `npm run type-check`       | Run TypeScript without emitting files.                    |
| `type-check:watch` | `npm run type-check:watch` | Continuously type-check while you work.                   |
| `lint`             | `npm run lint`             | Run ESLint across `src/`.                                 |
| `lint:fix`         | `npm run lint:fix`         | Auto-fix lint issues where possible.                      |
| `format`           | `npm run format`           | Format the `src/` tree with Prettier.                     |
| `format:check`     | `npm run format:check`     | Verify formatting without writing changes.                |
| `test`             | `npm run test`             | Run Vitest in watch mode with `.env.test` loaded.         |
| `test:run`         | `npm run test:run`         | Run the test suite once in non-watch mode.                |
| `test:coverage`    | `npm run test:coverage`    | Run the suite with coverage enabled.                      |
| `sync-env`         | `npm run sync-env`         | Regenerate `.env.example` from local env keys.            |
| `prepare`          | `npm run prepare`          | Install Husky hooks after dependency install.             |

---

## Development Workflow

1. Pull the latest changes from the main branch.
2. Create a feature branch such as `feat/add-tenant-flow` or `fix/rent-status`.
3. Make your changes in `src/`.
4. Run the checks before committing:

```bash
npm run lint
npm run type-check
```

5. If you changed environment keys, regenerate the example env file:

```bash
npm run sync-env
```

6. Commit with a conventional commit message.
7. Push your branch and open a pull request.

---

## Testing

Testing is compulsory for this project. Every meaningful change should include coverage, and integration tests should be the default choice whenever an API flow, database interaction, or end-to-end request path is involved.

The current test tooling is built around Vitest and Supertest, and the test scripts load `.env.test` automatically.

- Prefer integration tests for routes, controllers, services with database access, authentication flows, and any behavior that spans multiple layers.
- Use unit tests only for non-critical, isolated logic such as pure helpers, formatters, mappers, or validation utilities.
- Put test-specific environment values in `.env.test` when they differ from the normal development environment.
- Keep shared test bootstrapping in `tests/setup.ts`.
- Organize route and API coverage under `tests/integration/`.
- Organize pure unit coverage under `tests/unit/`.
- Run `npm run test:run` in CI or before pushing when you want a single non-watch execution.
- Run `npm run test:coverage` when you need coverage output for review or verification.

Example:

- Integration test: `tests/integration/user.spec.ts` should verify the full HTTP flow for user creation, login, or protected access.
- Unit test: a date formatter, rent-status mapper, or password comparison helper can be tested in isolation when the logic is pure and not tied to the full request lifecycle.

If you add or change testing behavior, update this section so the testing standard stays clear.

---

## Git Workflow and Commit Convention

This repository uses [Conventional Commits](https://www.conventionalcommits.org/) and Commitlint.

### Commit Format

```text
<type>(optional scope): <short description>
```

### Allowed Types

- `feat`
- `fix`
- `chore`
- `docs`
- `style`
- `refactor`
- `perf`
- `test`
- `build`
- `ci`
- `revert`

### Examples

```text
feat(auth): add login endpoint
fix(rent): handle overdue status correctly
docs: improve setup instructions
refactor(server): simplify bootstrap flow
test(tenants): add service coverage
```

---

## Before You Push - Sync Your Env

> Run this whenever you add, rename, or remove environment variables.

The `sync-env` script reads your local `.env` file and copies the variable names into `.env.example` without copying secret values.

```bash
npm run sync-env
```

### Important Notes

- Keep commits clean before pushing; do not rely on a later cleanup commit.
- The script expects `.env` to exist.
- Only committed keys should appear in `.env.example`.
- Re-run the sync script after any environment variable change so other contributors see the current configuration surface.
