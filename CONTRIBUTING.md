# Contributing — Git Workflow

This file is the quick-reference for making changes to the TryOn codebase. It assumes you're a solo developer working off `main`, with a GitHub remote for hosting and review.

> **Related docs:**
> - [DEPLOYMENT.md](DEPLOYMENT.md) — how to ship merged code to the Lightsail production server (deploys are manual, not auto-triggered by merges).
> - [CLAUDE.md](CLAUDE.md) — repo architecture and conventions.

---

## TL;DR — the standard cycle

For any non-trivial change:

```bash
# 1. Start from a fresh main
git checkout main
git pull origin main

# 2. Create a branch named for the work
git checkout -b feature/short-description

# 3. Edit code, commit small atomic chunks
git add <files>
git commit -m "Short imperative message"

# 4. Push the branch to GitHub
git push -u origin feature/short-description

# 5. Open a PR on GitHub, review the diff, merge (Rebase and merge for linear history)

# 6. Back on your machine: sync main and clean up
git checkout main
git pull origin main
git fetch --prune
git branch -d feature/short-description
```

That's the whole loop. The rest of this file explains the *why* behind each step and the gotchas.

---

## 1. Why branch at all?

A branch is just a movable label pointing at a commit. Working on a branch (rather than directly on `main`) gives you four things:

1. **A safety net.** If the changes turn out to be wrong, you delete the branch — `main` was never touched.
2. **A review checkpoint.** You can diff the branch against `main` before merging, catching mistakes early.
3. **Atomic merges.** A whole feature lands as one logical unit. History stays readable.
4. **Isolation from `main`'s state.** If `main` is in App Store review and you don't want any new commits affecting production, branches keep your work staged.

> **TryOn-specific:** Deploys to Lightsail are **manual** (`ssh + git pull + docker compose up`). Merging to `main` does NOT auto-deploy. So `main` is always safe to merge into — production only changes when you SSH and pull.

### Branch naming convention

Pick a prefix that says *what kind of work*:

| Prefix | Use for | Example |
|---|---|---|
| `feature/` | New functionality or doc additions | `feature/docupdate`, `feature/deep-healthcheck` |
| `fix/` | Bug fixes | `fix/login-rate-limit` |
| `chore/` | Refactors, dep updates, cleanup | `chore/upgrade-prisma` |
| `ops/` | Infra/deployment changes | `ops/hardening` |

The text after the slash is short kebab-case. The name doesn't matter much technically — it's just a label — but consistent naming helps you (and future-you) scan branch lists.

---

## 2. Making commits

```bash
# See what changed
git status                # Which files are modified / staged / untracked
git diff                  # Show unstaged changes (working tree vs index)
git diff --staged         # Show staged changes (index vs last commit)

# Stage specific files (preferred — don't blindly `git add .`)
git add CLAUDE.md DEPLOYMENT.md

# Or stage interactively, one chunk at a time
git add -p

# Commit with a message
git commit -m "Short imperative summary (under 60 chars)"
```

### Why "stage specific files" matters

`git add .` or `git add -A` adds *everything* in the working tree — including files you didn't mean to commit (`.env` accidentally tracked, build output, scratch files, secrets). Adding specific files is a five-second habit that prevents very bad days. Use it.

### Commit message style

- **First line:** imperative ("Add X", "Fix Y", "Update Z"), under ~60 chars, no trailing period.
- **Blank line, then a body** for non-trivial changes — explain the *why*, not the *what* (the diff already shows what).
- Reference issue/PR numbers if relevant: `Fix #42`.

Bad: `stuff`, `wip`, `more changes`
Good: `Add deep /health endpoint that probes Postgres + Redis`

### Atomic commits

A commit should represent one logical change. If you've done two unrelated things (added a feature AND fixed a typo), make two commits — `git add` only the relevant files for each. This makes review, revert, and `git bisect` (finding when a bug was introduced) much easier later.

---

## 3. Pushing to GitHub

```bash
# First push of a new branch — sets upstream tracking
git push -u origin feature/your-branch

# Subsequent pushes — tracking is already set
git push
```

The `-u` (`--set-upstream`) flag tells git "remember that this local branch tracks this remote branch." After that, `git status` will tell you when your local copy is ahead/behind the remote, and `git push` / `git pull` work without arguments.

### Checking sync status

```bash
git branch -vv
```

Shows each local branch with its tracking info. The bracketed string after the commit hash is the upstream — `[origin/feature/x]` means "this branch tracks `origin/feature/x` on GitHub." Missing brackets = local-only branch.

---

## 4. Reviewing the diff before merging

This is the most important step and the one most people skip. Three ways, in increasing order of friendliness:

### 4a. Terminal: quick stats

```bash
# File-level summary (which files changed, how many lines)
git diff main...HEAD --stat

# Just the names of changed files
git diff main...HEAD --name-only

# List commits on this branch that aren't on main
git log main..HEAD --oneline
```

### 4b. Terminal: actual diffs

```bash
# Full diff of every change against main
git diff main...HEAD

# Diff for one file only
git diff main...HEAD -- backend/src/index.ts

# Commit-by-commit with full diff for each
git log -p main..HEAD
```

**`..` vs `...` gotcha:** in `git diff`, use **three dots** (`main...HEAD`) to compare the branch against the common ancestor with `main`. With `git log`, use **two dots** (`main..HEAD`) to list commits unique to the branch. Most people just memorize "three dots for diff, two dots for log."

### 4c. GitHub Pull Request (recommended for non-trivial work)

```bash
# Push the branch first, then open a PR via the GitHub UI
git push -u origin feature/your-branch
```

Then either:
- Visit `https://github.com/<your-username>/<your-repo>/compare/main...feature/your-branch` directly, or
- Go to your repo on GitHub → **Pull requests** tab → **New pull request** → set base=`main`, compare=your branch.

The GitHub UI gives you:
- Side-by-side or unified diff with syntax highlighting
- File-by-file navigation with collapse/expand
- Line-by-line commenting (useful even when reviewing your own work — leaves a paper trail)
- A status check area where CI runs would surface (we don't have CI yet)

A PR is overkill for a one-line typo fix. It's invaluable for anything you'd want to look at carefully or refer back to later.

---

## 5. Merging into main

### Path A — GitHub Pull Request

After opening the PR (see §4c):

1. Review the **Files changed** tab.
2. Click the **Merge pull request** button.
3. **Important — pick a merge style** from the dropdown next to the button:
   - **Create a merge commit** (default) — preserves the branch structure in history, creates a "merged X into main" commit.
   - **Squash and merge** — combines all your branch commits into a single commit on main. Tidy for PRs with many small WIP commits.
   - **Rebase and merge** — replays your branch commits onto main one at a time, no merge commit. Cleanest linear history. **Recommended for solo work** if you wrote good commit messages.
4. Confirm. GitHub also offers a **Delete branch** button after merge — click it to remove the remote branch.

### Path B — Terminal fast-forward merge

```bash
git checkout main
git pull origin main                  # sync with remote first
git merge feature/your-branch         # merge
git push origin main                  # publish
```

If `main` hasn't moved since you branched, the merge will print **`Fast-forward`** — git just moves the `main` pointer to your branch's tip with no merge commit. Linear history preserved.

If `main` HAS moved (someone else committed, or you committed to main directly while your branch was open), git will create a merge commit by default. To force a clean history in that case:

```bash
# Rebase your branch onto the latest main first, then fast-forward merge
git checkout feature/your-branch
git rebase main
git checkout main
git merge feature/your-branch         # now a clean fast-forward
```

Rebasing rewrites your branch's commits to appear *after* main's latest commit. Don't rebase a branch that someone else has based work on — it changes commit hashes and confuses their copy.

---

## 6. Cleanup after merge

```bash
# Switch back to main
git checkout main

# Pull the merge down (if you merged via GitHub PR; skip if you merged in terminal)
git pull origin main

# Remove tracking references for branches that GitHub deleted
git fetch --prune

# Delete the local copy of the merged branch
git branch -d feature/your-branch

# Delete the remote copy (if not already deleted via GitHub's "Delete branch" button)
git push origin --delete feature/your-branch

# Sanity check
git branch -vv
```

**Flag meanings:**

| Flag | What it does |
|---|---|
| `--prune` | Remove local tracking refs (like `origin/feature/x`) whose remote branch no longer exists. Stale tracking refs accumulate over time; this cleans them up. |
| `-d` (lowercase) | "Safe delete" — refuses if the branch has commits not merged into upstream. After a successful merge, the safety check passes. |
| `-D` (uppercase) | Force-delete, even unmerged. Almost always wrong — use it only if you knowingly want to discard work. |

---

## 7. Common situations & gotchas

### "I committed to the wrong branch"

```bash
# You meant to commit on feature/x but you're on main with uncommitted changes
git stash                             # park the work
git checkout feature/x                # switch to the right branch
git stash pop                         # restore the work

# Or, if you already committed to main:
git log -1                            # note the commit hash
git reset --hard HEAD~1               # roll main back one commit (destructive — only if local-only)
git checkout feature/x
git cherry-pick <commit-hash>         # apply the commit on the right branch
```

### "I want to undo my last commit but keep the changes"

```bash
git reset --soft HEAD~1               # undoes the commit, keeps changes staged
git reset --mixed HEAD~1              # undoes commit, keeps changes unstaged (default)
git reset --hard HEAD~1               # undoes commit AND throws away changes — irreversible
```

Never `--hard` reset commits that have been pushed and others may have pulled.

### "My branch is out of date with main"

```bash
git checkout feature/your-branch
git fetch origin
git rebase origin/main                # replay your commits on top of latest main
# Resolve any conflicts, then:
git push --force-with-lease           # only force-push if you're the only person on the branch
```

`--force-with-lease` is safer than `--force`: it refuses to push if someone else has updated the remote branch in the meantime, preventing accidental overwrites.

### "I accidentally pushed `.env` or another secret"

1. **Rotate the secret immediately.** The git history is already on GitHub; the secret must be treated as compromised regardless of any history rewriting.
2. Remove the file from history with `git filter-repo` or BFG Repo-Cleaner.
3. Force-push the cleaned history.
4. The old commits may still be cached by GitHub for a while; the secret rotation in step 1 is what actually protects you.

This is why staging specific files (§2) and keeping `.env` in `.gitignore` matters.

### "I want to see what's on a remote branch without checking it out"

```bash
git fetch origin
git log origin/main --oneline -10     # last 10 commits on remote main
git diff main origin/main             # what does remote main have that local main doesn't
```

### "How do I know if main was force-pushed?"

```bash
git fetch origin
git log HEAD..origin/main             # commits on remote not in local
git log origin/main..HEAD             # commits on local not in remote
```

If both lists are non-empty after fetch, history has diverged — someone force-pushed. Investigate before pulling.

---

## 8. Generating the HTML docs

This repo ships HTML versions of the three top-level docs under `docs/`. They're regenerated from the `.md` sources by a Node script using `markdown-it`.

### When to regenerate

After editing any of: `CLAUDE.md`, `DEPLOYMENT.md`, `CONTRIBUTING.md`. The `.md` files are the source of truth; the HTML is build output.

### Commands

```bash
# One-time setup (or after pulling new devDependencies):
npm install

# Regenerate docs/*.html from the markdown sources:
npm run build:docs
```

Output goes to `docs/`:

| File | Source |
|---|---|
| `docs/index.html` | (landing page, generated by the script itself) |
| `docs/claude.html` | `CLAUDE.md` |
| `docs/deployment.html` | `DEPLOYMENT.md` |
| `docs/contributing.html` | `CONTRIBUTING.md` |
| `docs/styles.css` | hand-maintained, not regenerated by the script |

Open any of them directly in a browser (`file://...`) or serve the `docs/` folder via any static server.

### Adding a new doc

1. Create the `.md` file at the repo root.
2. In `scripts/build-docs.js`, append an entry to the `sources` array:
   ```js
   { md: 'YOUR_DOC.md', html: 'your-doc.html', title: 'YOUR_DOC', blurb: 'Short description.' },
   ```
3. Run `npm run build:docs`. The new doc appears in the top nav of all pages and on the landing page.

### What the script does

- Parses each `.md` with `markdown-it` (GFM tables, fenced code, raw HTML allowed).
- Adds `id="slug"` attributes to all H1–H4 headings via `markdown-it-anchor`.
- Extracts H2 + H3 headings to build a sidebar table of contents per page.
- Rewrites internal `.md` links to `.html` (case-insensitive) so cross-doc navigation works in the browser.
- Strips GitHub line-number anchors (`#L468`) that don't exist in the HTML.
- Wraps each rendered body in a layout template with the top nav and sidebar.

### What it does NOT do

- No syntax highlighting in code blocks (intentional — keeps the dependency surface tiny). If you want this later, add `highlight.js` or `prism` to the script.
- No CI step regenerates docs on push. Run `npm run build:docs` manually and commit the output.

## 9. What this project does NOT use

- **No CI/CD on push.** No GitHub Actions are wired up. Merging to `main` does not trigger any automated build, test, or deploy. Production deploys are explicit SSH actions (see [DEPLOYMENT.md §13](DEPLOYMENT.md#13-updating-the-application)).
- **No required code review.** Solo dev — you review your own PRs. The discipline of opening one anyway gives you a paper trail and a moment to second-guess yourself.
- **No conventional-commits enforcement.** Commit message style is encouraged but not mechanically required.
- **No branch protection rules on `main`.** You *can* push directly to `main`, but the branch-then-PR flow gives you a habit and a checkpoint. Use it.

---

## 10. Quick-reference cheat sheet

| Goal | Command |
|---|---|
| Start a new branch from latest main | `git checkout main && git pull && git checkout -b feature/x` |
| See what changed | `git status` / `git diff` |
| Stage and commit | `git add <files> && git commit -m "..."` |
| Push first time | `git push -u origin feature/x` |
| Push again | `git push` |
| Compare branch to main | `git diff main...HEAD --stat` |
| List your branch's commits | `git log main..HEAD --oneline` |
| Merge via terminal | `git checkout main && git pull && git merge feature/x && git push` |
| Delete local branch | `git branch -d feature/x` |
| Delete remote branch | `git push origin --delete feature/x` |
| Clean up stale refs | `git fetch --prune` |
| See all branches with tracking | `git branch -vv` |
| Undo last commit (keep changes) | `git reset --soft HEAD~1` |
| Stash uncommitted work | `git stash` / `git stash pop` |
