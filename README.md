# DiTech FAO — Presales CRM v2.0

A full-featured React + TypeScript presales CRM for DiTech FAO, targeting UK accounting firms. All data is stored locally in the browser (localStorage) — no backend required.

## Features

- **Firms DB** — Full firm database with add/edit modal, bulk actions, Excel import/export, inline stage editing, call history per firm
- **Call Tracker** — Log calls with outcome pills, daily KPI stats, progress bars, monthly meeting projection, rep selector
- **All Calls** — Date range view (Today/7d/30d/Custom) with filters by rep, outcome, type
- **Team KPIs** — Live leaderboard, outcome split, monthly meetings per rep
- **Funnel & Revenue** — Pipeline funnel chart, conversion rates vs targets, quarterly table, editable win amounts
- **Admin** — User management with permissions, roles, financial years, KPI targets, dropdown options, rep config
- **Call Log Drawer** — Slides in from Firms DB for quick call logging with firm context

## Quick Start

```bash
npm install
npm run dev
# App runs at http://localhost:3000
```

## Default Login Credentials

| Email | Password | Role |
|-------|----------|------|
| admin@ditech.com | admin123 | Admin |
| diksha@ditech.com | diksha123 | Rep |
| sadichha@ditech.com | sadichha123 | Rep |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Jump to Firms DB search |
| `L` | Jump to Call Tracker |
| `Esc` | Close drawer / modal |

## Tech Stack

- React 19 + TypeScript
- Vite 6
- Tailwind CSS v4
- xlsx (Excel import/export)
- All data: localStorage (no backend)

## Data Storage Keys

| Key | Contents |
|-----|----------|
| `dtp2_firms` | Firm records |
| `dtp_calls` | Call logs |
| `dtp_admin` | Admin settings, users, KPI targets, financial years |
| `dtp_session` | Current user session |
