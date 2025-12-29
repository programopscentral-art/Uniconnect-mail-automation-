# UniConnect Mail Automation

A comprehensive email automation platform for NxtWave ProgramOps.

## Features
- **University Management**: Create/Edit universities with unique slugs.
- **User Management**: RBAC with Admin and University Operator roles.
- **Student Management**: Upload CSVs and manage recipients.
- **Email Templates**: Create HTML templates with variable substitution support (`{{studentName}}`, etc.).
- **Gmail Automation**: Connect Gmail accounts via OAuth2 for sending.
- **Campaigns**: Schedule and send bulk emails using BullMQ for reliability and rate limiting.
- **Tracking**: Open tracking pixel and acknowledgment links.

## Tech Stack
- **Frontend/Backend**: SvelteKit, TypeScript, Tailwind CSS
- **Database**: PostgreSQL (Supabase)
- **Queue**: BullMQ + Redis
- **Worker**: Node.js (TypeScript)

## Setup

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Environment Variables**
   Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` (Supabase Postgres)
   - `REDIS_URL`
   - `GOOGLE_CLIENT_ID` & `SECRET`
   - `ADMIN_EMAIL`
   - `ENCRYPTION_KEY_BASE64` (32-byte key)

3. **Database Migration**
   ```bash
   pnpm --filter shared migrate
   ```

4. **Run Development**
   ```bash
   # Terminal 1: App
   pnpm --filter app dev

   # Terminal 2: Worker
   pnpm --filter worker start
   ```

## Roles
- **Admin**: Full access. Can create universities and manage all users.
- **University Operator**: Restricted to their assigned university.

## Deployment
- Build app: `pnpm --filter app build` -> `node build/index.js`
- Build worker: Transpile typescript and run.
