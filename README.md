# Dayvup — complete replacement project

This is the complete source assembled from the uploaded original project and the redesigned Dayvup workspace (formerly StudyFlow). Use the entire `frontend` folder; do not mix the new and old index files. Your original frontend is now `frontend/legacy.html`, with its scripts and styling intact. The separate insights.js file is retained for reference; the supplied script.js already contains its code. Case-sensitive asset names have been corrected. The existing Firebase Web App configuration is reused. The duplicate Firebase initializer was removed. Classic logout now clears only its known storage keys instead of all local storage, so new workspace backups are not erased.

## Try it locally

Extract this folder, open it in VS Code, and run in PowerShell:

```powershell
cd frontend
python -m http.server 8000
```

Open http://localhost:8000/ (not the HTML file directly). Open workspace, then Classic / RPG mode from the sidebar for the original 3D orb, companion, and original insights. The Flask service is optional and unchanged.

## Replace your existing project (recommended)

1. Back up your existing project outside its folder; export any important data before switching. Stop any running server.
2. In your existing Git clone, create a branch with `git switch -c dayvup-rebrand`. Keep its hidden `.git` directory.
3. Copy the entire extracted `frontend` folder into your Git clone, replacing the old frontend after backing it up. Copy the included `backend` folder (optional), `.gitignore`, `render.yaml`, `firestore.rules.example`, and README.md to the matching locations. Do not copy old serviceAccountKey.json or .env secrets back. Do not delete `.git`.
4. Test locally. On Render Static Site retain the publish directory `frontend` and no build command. The optional Render Python backend is unchanged.
5. In the original Git clone run `git status`, `git add frontend backend/app.py backend/__init__.py backend/requirements.txt backend/.env.example .gitignore render.yaml firestore.rules.example README.md configure_seo.py`, `git diff --cached --stat`, `git commit -m "Launch Dayvup"`, `git push -u origin dayvup-rebrand`. Review before merging into main. Do not force push.

## Configure SEO before publishing

Dayvup's landing page is readable in static HTML, with branded titles, descriptions, a favicon, a 1200×630 social preview image and crawler directives. Private workspace/login/classic pages have noindex metadata; this is not an access-control mechanism. Old hash-based links remain supported. The only indexable URL in the generated sitemap is your public homepage.

From the project root (not frontend), run `python configure_seo.py` followed by your actual public HTTPS URL. Copy the URL from your Render Static Site dashboard. Do not use an unowned domain or the optional backend URL. This command writes an absolute canonical URL, WebSite JSON-LD, Open Graph and social image URLs, robots.txt and sitemap.xml. Until then the homepage is usable with a relative canonical, but the final sitemap and URL-specific metadata are intentionally not generated. Re-run the command if your public URL changes.

Keep your existing Render static-site URL initially if you want local browser data to remain accessible. If you buy a new domain, add it to Firebase Authentication's authorized domains, test login and sync, export guest data from the old origin and import it on the new one, then configure permanent redirects on the old domain if available. Do not rename the Firebase project ID, Firestore collections or existing localStorage keys; they are intentionally unchanged for compatibility. The optional backend service name remains unchanged as well.

After deploying, visit the homepage, /robots.txt and /sitemap.xml to confirm they are accessible. Open https://search.google.com/search-console/ and add a URL-prefix property using your actual site URL; verify ownership with a downloaded HTML file in frontend or Google's alternative verification method. Submit sitemap.xml under Sitemaps. In URL Inspection, enter your homepage URL, test the live URL, and request indexing. Monitor Page indexing and Performance for the query Dayvup. Add a consistent link to your website on GitHub and social profiles. Google chooses rankings and site names automatically; no SEO code guarantees the first position or autocomplete suggestions. See https://developers.google.com/search/docs/appearance/site-names and https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap.

## Firebase setup and migration (required for cloud sync)

- Revoke/delete the old exposed Firebase service-account private key in Google Cloud Console > IAM & Admin > Service Accounts > select account > Keys. The backend does not use it. If it was ever committed, remove it from tracked files and review Git history, but revocation is still required. This archive intentionally excludes private keys and real .env files. The Firebase web app config is public by design; owner-only Firestore rules are necessary.
- In Firebase Console > Firestore Database > Rules, add the match block in `firestore.rules.example` INSIDE the existing `/databases/{database}/documents` block. Do not remove existing users/{uid} rules. Check for permissive overlapping rules. Test with two accounts before publication.
- Keep Email/Password enabled in Firebase Authentication; authorize your deployment domain (and localhost for testing if required).
- Open the new workspace, click the workspace/account button at top left, sign in using your existing account, and open Settings > Import classic data. The new app copies tasks, routines and recorded sessions from your existing account or matching local storage; it never deletes the original cloud records. Original data remains in `users/{uid}`; new data is in `studyflowWorkspaces/{uid}`. They are NOT continuously synced with one another. Old RPG progress stays in Classic mode. Local browser data is tied to the exact origin; localhost cannot read your live domain data. Guest and signed-in workspaces are separate; use JSON export/import for transferring guest data.
- Export a backup before updates and regularly thereafter. The new cloud synchronization stores a single snapshot per account, using last-write-wins timestamps, not real-time collaborative editing. Firestore document size limits apply.

## Validation

The rebrand is checked for JavaScript/Python syntax, local HTML dependencies, and unchanged Firebase/storage identifiers. The SEO generator is tested against a temporary test URL (not shipped). Live Firebase permissions, actual account migration, service-worker installation, cross-device sync and classic 3D interaction require a deployment smoke test. No GitHub or Render changes were made.
