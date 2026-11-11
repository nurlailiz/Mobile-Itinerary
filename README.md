# Swipe Itinerary 🧳

A mobile itinerary planner that works like a spreadsheet but reads like flashcards.

Each **row** (activity) holds:

| Field | Example |
|---|---|
| Time (+ optional end time) | 08:30 → 09:45 |
| Activity | Kansai Airport → Kyoto Station |
| Transportation (mode + details) | 🚆 Train · *JR Haruka Express* / 🚌 Bus · *Bus 205* |
| Fee | ¥ 3,600 |
| Remarks | Buy ICOCA & Haruka combo at ticket office |

## Features

- **Card view**: swipe left/right through the day's activities one at a time. Tap a card to edit it.
- **Sheet view**: the same day as a table, like Excel, with a total row. Tap a row to edit it.
- **Trips & days**: set a start date and the number of days. Each day shows its date and can have a title (e.g. "Arashiyama").
- Activities are **sorted by time** automatically. A new activity starts at the time the previous one ends.
- **Totals**: fees add up per day and per trip, in the currency you choose (RM, $, ¥, €…).
- **Export to Excel (CSV)**, **share or copy a day as text**, and **JSON backup/restore**.
- **Works offline** and can be **installed on your home screen** (PWA). Light and dark mode.
- Data stays on your device in browser storage. There are no accounts and no server.

## Run it

It's plain HTML/CSS/JS with no build step.

```bash
python3 -m http.server 8000
# open http://localhost:8000 (or http://<your-computer-ip>:8000 on your phone)
```

### Put it on your phone

1. Host the folder anywhere static. For **GitHub Pages**: repo → Settings → Pages → Deploy from branch → pick the branch, root folder.
2. Open the URL on your phone:
   - **iPhone (Safari)**: Share → *Add to Home Screen*
   - **Android (Chrome)**: ⋮ menu → *Install app* / *Add to Home screen*
3. It opens full-screen like a native app and works offline.

> Note: data is stored per browser/device. Use **⋯ → Back up** to move trips to another phone.

## Files

```
index.html            app shell + edit sheets (dialogs)
styles.css            mobile-first styles (light/dark)
app.js                all app logic (storage, views, swipe deck, export)
sw.js                 service worker for offline use
manifest.webmanifest  install metadata
icons/                app icons
```
