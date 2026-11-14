---
name: wrap-up
description: Save ShopFlow work state before stopping for the day or when Claude usage is running low.
---

1. If there are uncommitted changes, commit them on the current feature branch with a
   `wip:` message and push. Never commit to `main`.
2. If Docker containers were started for this task, leave them running and note it.
3. Update PROGRESS.md: current issue and branch, what is done, the exact next step,
   and any decisions waiting for me.
4. Commit and push PROGRESS.md on the current branch.
5. Reply with three lines: where we stopped, the next step, and what I need to decide.
