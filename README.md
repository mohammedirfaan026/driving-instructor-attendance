# Driving Instructor Attendance

Small, local-first attendance book for one driving instructor.

## Development

```bash
npm install
npm run dev
```

## GitHub Pages

The `master` branch deploys automatically through `.github/workflows/deploy.yml`. Enable GitHub Pages in the repository settings with **GitHub Actions** as the source.

The workflow builds with the repository base path. For a custom domain, remove or override `VITE_BASE_PATH` with `/` in the workflow; no application code needs to change.

## Google Drive setup

Create a browser OAuth client in Google Cloud, enable the Google Drive API, and configure the authorized JavaScript origin for the deployed Pages URL. Add the client ID as a non-secret repository variable named `VITE_GOOGLE_CLIENT_ID`.

The client ID is public by design. Never add a client secret, password, or private token to this frontend. Live attendance remains in IndexedDB; Drive is only used for explicit backup and restore.
