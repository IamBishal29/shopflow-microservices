# Installing the ShopFlow agent kit

Run these in PowerShell. Delete this file once the kit PR is merged.

## 1. Get a clean copy of the repo
Your old local folder has the Day 2 scaffold, which kickoff will rebuild properly.
Keep it as a reference under another name and clone fresh:

```powershell
cd D:\Practice
Rename-Item shopflow-microservices shopflow-day2-practice
git clone https://github.com/IamBishal29/shopflow-microservices.git
cd shopflow-microservices
```

## 2. Set your git identity for this repo only
```powershell
git config user.name  "Syed Ahasan Habib"
git config user.email "<the email you use for GitHub>"
```

## 3. Copy the kit in
Unzip `shopflow-agent-kit.zip` and copy everything inside `shopflow-agent-kit\`
(including the hidden `.claude` folder and `.gitignore`) into the repo root.
Overwrite the existing `.gitignore` (the old one is a single broken line).

## 4. Commit on a branch and open a PR
```powershell
git switch -c chore/agent-kit
git add .
git commit -m "chore: add Claude Code agent kit"
git push -u origin chore/agent-kit
gh pr create --fill
```
Merge the PR on GitHub, then `git switch main; git pull`.

## 5. Check the tools
- `node -v` (LTS), `pnpm -v`, `docker version`, `gh auth status`
- GitHub MCP server connected in Claude Code: run `claude mcp list`
  (the same setup you use for job-scout-ai works here).

## 6. Start
```powershell
claude
```
Then type `/kickoff`. After that, every session is just `/next-task`,
and `/wrap-up` before you stop.
