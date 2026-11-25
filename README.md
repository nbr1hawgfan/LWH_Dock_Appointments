# LWH Dock Appointments

Carrier dock appointment scheduling for **Logistics Warehouse** at 8501 State Hwy 45, Fort Smith, AR (ArcBest account).
Static PWA on GitHub Pages · data in Supabase (LWH Companion project, `appt_*`) · email sent by Google Apps Script.

## How it fits together

| Piece | Where | What it does |
|---|---|---|
| PWA (`index.html`, `assets/`) | GitHub Pages → `schedule.logisticswarehouse.net` | Carrier booking / reschedule / cancel; LWH team dock board |
| Supabase RPCs `appt_*` | LWH Companion | All rules: slot length, capacity, dock hours, blocks, double-booking lock |
| `appt_outbox` table | LWH Companion | Every email to send (confirm, reschedule, cancel, reminder, team notices, 6 AM schedule) |
| `gas/Code.gs` | Apps Script | Runs every minute, sends whatever is in the outbox, marks it sent. A second copy run as the calendar owner mirrors every appointment onto the shared Google Calendar (new, moved, door/status, cancelled = removed) |
| `appt-push` edge function | LWH Companion | Web push to team (new / changed / cancelled / late) and carriers (2-hour reminder, door assigned, moved by LWH) |
| `appt-tick` pg_cron job | LWH Companion | Every 10 min: 24-hour reminder emails, 2-hour push reminders, late alerts, 6 AM daily schedule |

## Carrier flow
Inbound or Outbound → pick a day and time (only open times can be tapped) → PO/BOL, trailer type, carrier, contact → confirmation number + email with calendar invite and a private manage link.
Info is remembered on the device for the next booking. Carriers can reschedule or cancel until the change cutoff (Settings).

## Team (footer link "LWH team sign in", or `?view=board`)
- **Dock Board** — week strip + day lanes (inbound / outbound), check in, at door (door #), done, no-show, cancel, reschedule (with override), team notes, history
- **Book** — book for a carrier who called (override allowed)
- **Block Time** — training, inventory, holidays; all day or a time window, one or both directions, date ranges
- **Settings** — appointment length (15 / 20 / 30 / 60), trucks per slot (in / out), notice & change cutoff, doors, dock hours by day (weekends), team + ArcBest email lists, arrival instructions, users & PINs, notifications

Changing the appointment length never moves existing bookings; the overlap check keeps a 30-min booking from being double-booked by new 20-min slots.

## Changing the colors
Edit the four variables at the top of `assets/css/app.css` (`--red` = main band (ArcBest Deep Blue #0D2E4A), `--teal` = accent (ArcBest Teal #3CAF96), `--black` = nav bar, `--accent` = link/text teal).

## Email + calendar setup (one time)
`gas/Code.gs` goes into **two** Apps Script projects (same file):
1. **Email** — script.google.com signed in as **tjennings@logistics-warehouse.com** → new project → paste `gas/Code.gs` → set `KEY_FOR_SETUP` → run **`setup()`**. Emails come from this account.
2. **Calendar** — script.google.com signed in as **administrator@logisticswarehouse.net** (owns the dock calendar) → new project → paste the same file → set `KEY_FOR_SETUP` → run **`setupCalendar()`**.

Both run every minute. The mailer key is `appt_settings.gas_key` in Supabase.
