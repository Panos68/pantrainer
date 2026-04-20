# PanTrainer

> **Built entirely with [Claude Code](https://claude.ai/code) (Anthropic) — AI-generated codebase.**

A personal training management app that closes the loop between logging workouts and AI-powered weekly planning.

## What it does

- **Log sessions** — duration, HR, calories, exercises, notes
- **Export to Claude** — downloads a structured JSON snapshot of your week
- **Import Claude's plan** — paste the AI response back to load next week's sessions and exercises
- **Notion sync** — push/pull sessions to Notion for phone access at the gym
- **Progress charts** — conditioning output and lift progression over time
- **Deload tracking** — automatic reminders after 4 weeks of high output

## The loop

```
Log sessions → Export JSON → Paste into Claude chat → Claude plans next week
     ↑                                                          |
     └──────────── Import JSON response ───────────────────────┘
```

## Tech stack

- **Next.js 15** (App Router, server + client components)
- **TypeScript** + **Zod** (runtime schema validation)
- **Tailwind CSS v4** + **shadcn/ui** (zinc dark theme)
- **Recharts** (progress charts)
- **@notionhq/client** (Notion database sync)
- Local JSON file storage — no database, no hosting required

## Setup

```bash
npm install
cp .env.local.example .env.local   # add Notion credentials (optional)
npm run dev
```

Opens at `http://localhost:3000`

## Notion integration (optional)

Create a Notion integration at [notion.so/my-integrations](https://notion.so/my-integrations), share a database with it, then add to `.env.local`:

```
NOTION_TOKEN=your_token
NOTION_DATABASE_ID=your_database_id
```

Required database properties: `Day` (title), `Date` (date), `Type` (select), `Status` (select), `Week` (text), `Subtype` (text), `Notes` (text), `Duration` (number), `Avg HR` (number), `Calories` (number)

## Data

All training data is stored locally in `data/` (gitignored). Export files go to `exports/` (gitignored).

---

*This project was designed and built through an extended conversation with Claude Code. The architecture, schema design, UI, and all implementation were AI-generated based on product requirements defined by the user.*
