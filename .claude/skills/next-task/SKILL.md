---
name: next-task
description: Pick up the next ShopFlow backlog issue and take it through plan, build, test, pull request and a learning note.
---

1. Read PROGRESS.md.
   - A branch is in progress: switch to it and resume from "Next step".
   - Otherwise: `git switch main && git pull`, then pick the lowest-numbered open issue
     in the current milestone (GitHub MCP, or `gh issue list --milestone "<name>"`).
   Tell me in one line which issue and why.
2. Plan in under 10 lines: files to touch, approach, the concept involved, and the
   failure mode it protects against. If there is a real decision (see CLAUDE.md
   "When to ask me"), ask with AskUserQuestion. Otherwise continue without waiting.
3. Create the branch, implement in small commits, add or update tests (unit, plus
   integration or e2e where the change crosses a boundary: HTTP, DB, Kafka, Redis).
   Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build` until
   all pass. If infra is needed, start it with `docker compose up -d <service>`.
4. While implementing, explain each meaningful step in chat in 2-4 lines: what you did
   and the engineering reason (not the syntax).
5. Write `docs/learning/NN-topic.md` for the concept and commit it on the same branch.
6. Push and open the PR (Closes #n, summary, how to test, review notes).
7. Update PROGRESS.md (done, next issue, open questions for me), commit, push.
8. Finish with: the PR link, a 5-line concept summary, the interview questions this
   issue prepares me for, and what I should check in "Files changed" before merging.
