# Repository Guidelines

## Project Structure & Module Organization
This repository is currently a single-file Tampermonkey userscript:

- `chatgpt-to-siyuan.user.js` — main script that injects a “同步到思源” button into ChatGPT, converts conversation DOM to Markdown, and sends it to the SiYuan API.

There are no dedicated `src/`, `test/`, or `assets/` folders yet. If the project grows, keep browser-facing logic in `src/`, shared utilities in `src/utils/`, and manual test notes or fixtures in `tests/`.

## Build, Test, and Development Commands
No build system is configured. Edit the userscript directly and reload it in Tampermonkey for testing.

Useful local commands:

- `Get-Content .\chatgpt-to-siyuan.user.js` — inspect the script in PowerShell.
- `node --check .\chatgpt-to-siyuan.user.js` — optional syntax check if Node.js is installed.

Manual development flow:
1. Update `chatgpt-to-siyuan.user.js`.
2. Reinstall or refresh the script in Tampermonkey.
3. Open a ChatGPT conversation page and verify sync to SiYuan.

## Coding Style & Naming Conventions
Use the existing JavaScript style consistently:

- 2-space indentation
- double quotes
- semicolons required
- `camelCase` for functions and variables
- `UPPER_SNAKE_CASE` only for true constants if added later

Prefer small, focused helper functions such as `extractMessages()` or `messagesToMarkdown()`. Keep DOM selectors and SiYuan API calls isolated in named functions.

## Testing Guidelines
This project currently relies on manual testing. Before submitting changes:

- verify the button appears on both `chatgpt.com` and `chat.openai.com`
- test user/assistant message extraction, code blocks, lists, and tables
- confirm SiYuan document creation succeeds with a valid local API token
- verify error toasts for invalid config or missing conversation content

If automated tests are added later, place them under `tests/` and name files `*.test.js`.

## Commit & Pull Request Guidelines
No Git history is available in this workspace, so use clear, imperative commit messages, for example:

- `feat: improve Markdown conversion for tables`
- `fix: handle empty conversation pages gracefully`

PRs should include a short summary, testing steps, affected ChatGPT page variants, and screenshots/GIFs when UI behavior changes.

## Security & Configuration Tips
Do not commit real SiYuan tokens or personal notebook IDs. Keep `CONFIG` values local, and replace secrets before sharing patches or screenshots.
