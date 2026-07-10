# AGENTS.md

## File Access Policy for AI Agents

### Core Rule

Agents **must not** read from or write to any file without **explicit permission** from the user or a designated system owner. When in doubt, ask — never assume access is allowed.

---

### Sensitive Files — Always Off-Limits Unless Explicitly Permitted

Agents must never access the following without clear, documented permission:

- **Environment files** — `.env`, `.env.local`, `.env.production`, and any variant
- **Credentials & secrets** — API keys, tokens, certificates (`.pem`, `.key`, `.p12`)
- **Authentication config** — OAuth secrets, JWT signing keys, session secrets
- **Database config** — connection strings, credentials, migration files containing sensitive data
- **Private keys** — SSH keys (`id_rsa`, `id_ed25519`), GPG keys
- **System files** — `/etc/passwd`, `/etc/shadow`, host files, OS-level config
- **CI/CD secrets** — `.github/secrets`, pipeline config files containing credentials
- **User data files** — any file containing PII, health data, financial records

---

### Before Reading a File

An agent must confirm:

- [ ] The user has explicitly named the file and asked the agent to read it
- [ ] The file is not in the sensitive files list above
- [ ] The purpose of reading is clear and scoped

---

### Before Writing to a File

An agent must confirm:

- [ ] The user has explicitly instructed the agent to write to that specific file
- [ ] The agent has shown the intended changes to the user before applying them (where possible)
- [ ] The file is not a system, config, or credentials file
- [ ] A backup or reversible path exists for critical files

---

### Explicit Permission Requirements

Permission must be:

- **Direct** — the user must name or clearly reference the file
- **In-context** — granted in the current session, not assumed from a past session
- **Scoped** — permission to read does not imply permission to write, and vice versa

> Example of valid permission:
> _"Read the `users.service.ts` file and suggest improvements."_

> Example of invalid assumption:
> _User says "fix the auth bug" → agent reads `.env` to find secrets without being told to._

---

### When Unsure

If an agent is uncertain whether it has permission to access a file, it must:

1. **Stop** and not proceed with the file operation
2. **Ask** the user explicitly which files it may access
3. **Wait** for a clear response before continuing

---

### Violations

Any agent action that reads, writes, modifies, or deletes a file without explicit permission is considered a policy violation and must be flagged immediately in the session output.
