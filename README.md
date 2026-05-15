# Consent Location Share

A static, opt-in location sharing prototype. It creates an SMS invite link, asks the recipient to grant browser location permission, and displays shared coordinates on a dashboard.

## Real-time cross-device updates

The app supports Firebase Realtime Database for real phone-to-dashboard updates. Without Firebase config, it falls back to a same-browser demo using `localStorage` and `BroadcastChannel`.

### Firebase setup

1. Go to the Firebase console and create a project.
2. Add a Web App and copy the Firebase config object.
3. Create a Realtime Database for the project.
4. Paste your config values into `src/firebase-config.js`.
5. Deploy the folder to Netlify again.

For quick testing, use these Realtime Database rules:

```json
{
  "rules": {
    "locations": {
      "$sessionId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

For production, lock these rules down with authentication, invite expiry, consent logs, and data deletion.

## Run

Serve the folder on localhost so browser geolocation is allowed:

```bash
python -m http.server 5501
```

Then open:

```text
http://localhost:5501
```

## Files

- `index.html`: Consent invite, receiver, and dashboard layout.
- `styles.css`: Responsive dark interface and map-style visual.
- `src/app.js`: SMS link generation, geolocation permission flow, and demo live updates.
- `src/firebase-config.js`: Firebase config for real-time cross-device sync.
