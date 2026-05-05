# Zentara Shikshya (शिक्षा)

A complete digital solution for modern schools — built for Nepali schools (Nursery to Class X).

> A product of Zentara Labs Pvt Ltd

## Tech Stack

- **Database:** PostgreSQL
- **ORM:** Prisma
- **Backend:** Express.js + TypeScript
- **Frontend:** Next.js + TypeScript
- **Mobile:** React Native (Expo)

## Project Structure

```
School-Management-System/
├── backend/          ← Express.js API
│   ├── prisma/       ← Schema, migrations, seed
│   └── src/
│       ├── routes/
│       ├── services/
│       ├── middleware/
│       ├── utils/
│       └── test/
├── frontend/         ← Next.js web app
│   └── src/
│       ├── app/
│       ├── components/
│       ├── hooks/
│       └── lib/
├── mobile-staff/     ← Expo app for teachers and accountants
│   └── src/
└── mobile-parent/    ← Expo app for parents and students
    └── src/
```

Each of the four sub-projects has its own `package.json` and `package-lock.json`. There is no root-level workspace; install and run each one independently.

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Backend setup

```bash
cd backend
cp .env.example .env       # then edit DATABASE_URL and JWT_SECRET
npm install
npm run migrate            # apply migrations
npm run seed               # seed initial data
npm run dev                # starts API on http://localhost:4000
```

### Frontend setup

```bash
cd frontend
npm install
npm run dev                # starts web app on http://localhost:3000
```

### Mobile apps (optional)

```bash
cd mobile-staff   # or mobile-parent
npm install
npx expo start
```

### Default Admin Login

- Email: `admin@school.edu.np`
- Password: `admin123`

## Features

- Configurable grading (Nepal CDC: A+ to E, GPA 4.0–0.8)
- Weightage-based final results (percentage-first method)
- Bikram Sambat date system
- A4/A5 paper size per exam type
- Color and B&W print support
- Conditional practical columns

## Testing

Backend has Jest + Supertest suites. See `backend/TESTING.md` for setup details.

```bash
cd backend
npm test
```
