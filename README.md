# StudyFlow 2.0 — complete replacement project

This is the complete source assembled from the uploaded original project and the redesigned StudyFlow 2.0 workspace. Use the entire `frontend` folder; do not mix the new and old index files. Your original frontend is now `frontend/legacy.html`, with its scripts and styling intact. The separate insights.js file is retained for reference; the supplied script.js already contains its code. Case-sensitive asset names have been corrected. The existing Firebase Web App configuration is reused. The duplicate Firebase initializer was removed. Classic logout now clears only its known storage keys instead of all local storage, so new workspace backups are not erased.

## Try it locally

Extract this folder, open it in VS Code, and run in PowerShell:

```powershell
cd frontend
python -m http.server 8000
```

Open http://localhost:8000/ (not the HTML file directly). Open workspace, then Classic / RPG mode from the sidebar for the original 3D orb, companion, and original insights. The Flask service is optional and unchanged.

## Replace your existing project (recommended)

1. Back up your existing project outside its folder; export any important data before switching. Stop any running server.
2. In your existing Git clone, create a branch with `git switch -c studyflow-v2`. Keep its hidden `.git` directory.
3. Copy the entire extracted `frontend` folder into your Git clone, replacing the old frontend after backing it up. Copy the included `backend` folder (optional), `.gitignore`, `render.yaml`, `firestore.rules.example`, and README.md to the matching locations. Do not copy old serviceAccountKey.json or .env secrets back. Do not delete `.git`.
4. Test locally. On Render Static Site retain the publish directory `frontend` and no build command. The optional Render Python backend is unchanged.
5. In the original Git clone run `git status`, `git add frontend backend/app.py backend/__init__.py backend/requirements.txt backend/.env.example .gitignore render.yaml firestore.rules.example README.md`, `git diff --cached --stat`, `git commit -m "Launch StudyFlow 2.0"`, `git push -u origin studyflow-v2`. Review before merging into main. Do not force push.

## Firebase setup and migration (required for cloud sync)

- Revoke/delete the old exposed Firebase service-account private key in Google Cloud Console > IAM & Admin > Service Accounts > select account > Keys. The backend does not use it. If it was ever committed, remove it from tracked files and review Git history, but revocation is still required. This archive intentionally excludes private keys and real .env files. The Firebase web app config is public by design; owner-only Firestore rules are necessary.
- In Firebase Console > Firestore Database > Rules, add the match block in `firestore.rules.example` INSIDE the existing `/databases/{database}/documents` block. Do not remove existing users/{uid} rules. Check for permissive overlapping rules. Test with two accounts before publication.
- Keep Email/Password enabled in Firebase Authentication; authorize your deployment domain (and localhost for testing if required).
- Open the new workspace, click the workspace/account button at top left, sign in using your existing account, and open Settings > Import classic data. The new app copies tasks, routines and recorded sessions from your existing account or matching local storage; it never deletes the original cloud records. Original data remains in `users/{uid}`; new data is in `studyflowWorkspaces/{uid}`. They are NOT continuously synced with one another. Old RPG progress stays in Classic mode. Local browser data is tied to the exact origin; localhost cannot read your live domain data. Guest and signed-in workspaces are separate; use JSON export/import for transferring guest data.
- Export a backup before updates and regularly thereafter. The new cloud synchronization stores a single snapshot per account, using last-write-wins timestamps, not real-time collaborative editing. Firestore document size limits apply.

## Validation

The complete package is statically checked for JavaScript syntax, local HTML dependencies, and private-key exclusion. Existing new workspace functionality was previously tested in Chromium using a storage shim. Live Firebase permissions, actual account migration, service-worker installation, cross-device sync and classic 3D interaction require a deployment smoke test. No GitHub changes were made.
