# Swipe Itinerary 🧳

A mobile itinerary planner that works like a spreadsheet but reads like flashcards.

Each **row** (activity) holds:

| Field | Example |
|---|---|
| Time (+ optional end time) | 08:30 → 09:45 |
| Activity | Kansai Airport → Kyoto Station |
| Transportation (one or more legs, for transfers) | 🚌 Bus 205 → 🚆 JR Nara Line |
| Fees (as many as you need, each in any currency) | Ticket ¥ 3,600 + Express pass US$ 50 → ≈ RM 494.20 |
| Remarks | Buy ICOCA & Haruka combo at ticket office |

Each **day** also has a **Spending** list, shown under the itinerary:

| Field | Example |
|---|---|
| Item | Matcha ice cream |
| Price (any currency) | ¥ 1,000 |
| Who paid | Aina |
| Price in RM (automatic) | RM 29.00 |

Before Day 1 there's a **📊 Overview** dashboard for the whole trip:

- **Trip costs**: flights, hotel bookings, hanbok rental, insurance… (item, category, price in any currency, who paid)
- **Budget allocations**: money set aside for meals, lodging, transport, shopping…, compared against what you've spent day by day
- **Estimated total trip cost** = trip costs + allocations + activity fees, with a per-person amount (set the number of travellers)
- A list of the days with each day's fees and spending

## Features

- **Card view**: swipe left/right through the day's activities one at a time. Tap a card to edit it.
- **Sheet view**: the same day as a table, like Excel, with a total row. Tap a row to edit it.
- **Trips & days**: set a start date and the number of days. Each day shows its date and can have a title (e.g. "Arashiyama").
- Activities are **sorted by time** automatically. A new activity starts at the time the previous one ends.
- **Multiple fees per activity**, each in its own currency (e.g. a ticket in ¥ and a pass in US$).
- **Daily spending** with item, price, who paid, and the price converted to RM. The day shows a total and a per-person breakdown.
- **Spending summary** (⋯ menu) lists the total for each day and how much each person paid over the whole trip.
- **Currencies & rates** (⋯ menu or 💱 Rates): rates fill in automatically when you're online (free daily market rates, similar to XE), with an **XE ↗** link next to each rate to compare. You can still type your own rate, e.g. your money changer's. Totals are converted to RM by default. You can change this under *Edit trip → Convert totals to*.
- **Share or copy a day as text**, and **JSON backup/restore**.
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
