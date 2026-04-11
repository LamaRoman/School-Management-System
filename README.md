# Zentara Shikshya (शिक्षा)

A complete digital solution for modern schools — built for Nepali schools (Nursery to Class X).

> A product of Zentara Labs Pvt Ltd

## Tech Stack

- **Database:** PostgreSQL
- **ORM:** Prisma
- **Backend:** Express.js + TypeScript
- **Frontend:** Next.js + TypeScript

## Project Structure

```
nepali-report-card/
├── backend/          ← Express.js backend
│   ├── prisma/       ← Schema + migrations + seed
│   └── src/
│       ├── routes/
│       ├── controllers/
│       ├── services/
│       ├── middleware/
│       └── utils/
├── frontend/         ← Next.js frontend
│   └── src/
│       ├── app/
│       ├── components/
│       ├── hooks/
│       ├── lib/
│       └── types/
└── packages/
    └── shared/       ← Shared TypeScript types
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Setup

1. Clone and install:
   ```bash
   npm install
   ```

2. Set up the database:
   ```bash
   cp apps/api/.env.example apps/api/.env
   # Edit .env with your PostgreSQL connection string
   ```

3. Run migrations and seed:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

4. Start development:
   ```bash
   npm run dev
   ```

   This starts both the API (port 4000) and web app (port 3000).

### Default Admin Login

- Email: `admin@school.edu.np`
- Password: `admin123`

## Features

- Configurable grading (Nepal CDC: A+ to E, GPA 4.0–0.8)
- Weightage-based final results (percentage-first method)
- Bikram Sambat date system
- A4/A5 paper size per exam type
- Color + B&W print support
- Conditional practical columns
