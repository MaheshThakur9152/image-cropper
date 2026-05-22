# Webtoon Studio - Developer & AI Documentation

This document describes the simplified architecture and workflow of Webtoon Studio, focused exclusively on webtoon panel extraction and correction.

## Tech Stack

* **Frontend**: Next.js 15, TypeScript, TailwindCSS, Shadcn UI, Zustand, TanStack Virtual
* **Backend**: NestJS, Prisma (SQLite)
* **Python Sidecar**: FastAPI, StitchToon, Pillow, OpenCV

## Directory Layout

```
d:\manhwa\
├── apps/
│   ├── frontend/             # Next.js Application
│   ├── backend/              # NestJS Backend Application
│   └── python-sidecar/       # Python Slicing Engine (FastAPI + StitchToon)
├── projects/                 # User project storage directory
│   └── [project-id]/
│       ├── raws/             # Raw imported images
│       ├── panels/           # Sliced panel outputs (non-destructive)
│       └── metadata.json     # Project config & edit history
├── AGENTS.md                 # Primary instructions for AI agents
├── package.json              # Root workspaces configuration
└── README_AI.md              # Tech description and workspace maps
```

## Running the Application

### 1. Python Sidecar Setup
From `apps/python-sidecar`:
```bash
pip install -r requirements.txt
python -m uvicorn app.main:app --port 8000 --reload
```

### 2. NestJS Backend Setup
From `apps/backend`:
```bash
npm install
npx prisma db push
npm run start:dev
```

### 3. Next.js Frontend Setup
From `apps/frontend`:
```bash
npm install
npm run dev
```

## DB Schema (SQLite)

We use SQLite for local metadata persistence:

```prisma
model Project {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  chapters  Chapter[]
}

model Chapter {
  id          String   @id @default(uuid())
  projectId   String
  title       String
  status      String   // PENDING, SLICED, FAILED
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  panels      Panel[]
}

model Panel {
  id          String   @id @default(uuid())
  chapterId   String
  panelNumber Int
  filePath    String   // Relative path to workspace folder
  width       Int
  height      Int
  cropBox     String?  // JSON stringified bounding box if cropped [x, y, w, h]
  isDeleted   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  chapter     Chapter  @relation(fields: [chapterId], references: [id], onDelete: Cascade)
}
```
