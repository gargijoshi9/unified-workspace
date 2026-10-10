# Local Setup & Installation Guide

This guide provides step-by-step instructions for running the **Unified Organization Workspace** locally on your development machine.

---

## 1. Prerequisites

Ensure your system meets the following software requirements:

* **Node.js**: `v18.18.0` or higher (Node `v20.x` or `v22.x` recommended)
* **npm**: `v9.x` or higher (or `pnpm` / `bun`)
* **PostgreSQL Database**: A running PostgreSQL instance (local Postgres on port 5432, or a hosted cloud database such as Neon, Supabase, or AWS RDS)
* **Redis Server**: A running Redis instance (local Redis server on `redis://127.0.0.1:6379`, or a cloud Upstash Redis instance)

---

## 2. Step-by-Step Installation

### Step 1: Clone the Repository
```bash
git clone https://github.com/gargijoshi9/unified-workspace.git
cd unified-workspace
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Create a `.env` file in the project root directory:

```env
# ------------------------------------------------------------------------------
# 1. Database Configuration (PostgreSQL)
# ------------------------------------------------------------------------------
# Local PostgreSQL example:
# DATABASE_URL="postgresql://postgres:password@localhost:5432/unified_workspace?sslmode=disable"
# Hosted PostgreSQL (Neon / Supabase / AWS RDS):
DATABASE_URL="postgresql://user:password@ep-sample-pooler.us-east-2.aws.neon.tech/unified_workspace?sslmode=require"

# ------------------------------------------------------------------------------
# 2. Redis Configuration (Session Versioning, Rate Limiting & Token Hashes)
# ------------------------------------------------------------------------------
# Local Redis:
# REDIS_URL="redis://127.0.0.1:6379"
# Cloud Upstash Redis:
REDIS_URL="rediss://default:your-upstash-token@your-upstash-host.upstash.io:6379"

# ------------------------------------------------------------------------------
# 3. NextAuth Authentication Secrets
# ------------------------------------------------------------------------------
# Generate a secure 32-byte secret with: openssl rand -base64 32
AUTH_SECRET="your-32-byte-secret-key-here"
NEXTAUTH_SECRET="your-32-byte-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"

# ------------------------------------------------------------------------------
# 4. Transactional Email Delivery (Required for Live Password Reset Emails)
# ------------------------------------------------------------------------------
# Option A: Resend API (Recommended - 3,000 free emails/month at https://resend.com)
RESEND_API_KEY="re_your_api_key_here"
EMAIL_FROM="Unified Workspace <onboarding@resend.dev>"

# Option B: Standard SMTP (Alternative)
# SMTP_HOST="smtp.gmail.com"
# SMTP_PORT=587
# SMTP_USER="your-email@gmail.com"
# SMTP_PASS="your-google-app-password"
```

> [!WARNING]
> Never commit real secret keys or passwords to version control. Ensure `.env` is listed in `.gitignore`.

### Step 4: Run Prisma Schema Push
Generate the Prisma Client and sync the schema to your PostgreSQL database:
```bash
npx prisma generate
npx prisma db push
```

### Step 5: Seed Development Test Data
Populate the database with sample organizations, demo users across all 5 roles, initial support tickets, and sample PRs:
```bash
npx prisma db seed
```

### Step 6: Start the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 3. Email Provider Configuration Guide

To enable live email delivery for the **Password Recovery (`/reset-password`)** pipeline:

### Setting Up Resend (Recommended & Fastest):
1. Sign up for a free account at [resend.com](https://resend.com).
2. Go to **API Keys** and click **Create API Key**.
3. Copy your key (`re_...`) and add it to `.env`:
   ```env
   RESEND_API_KEY="re_your_api_key_here"
   EMAIL_FROM="Unified Workspace <onboarding@resend.dev>"
   ```
4. Note: `onboarding@resend.dev` is Resend's built-in testing sender, allowing you to test delivery to your account email immediately without custom domain DNS setup.
5. In development, if no `RESEND_API_KEY` is provided, the server securely holds the token in Redis and logs an operational notice without printing the secret token.

---

## 4. 🔑 Seeded Demo Credentials (DEVELOPMENT-ONLY)

> [!CAUTION]
> **LOCAL DEVELOPMENT & DEMO USE ONLY**
> The default credentials below are provided strictly for local development and test evaluation. **Never use shared demo passwords in staging or production environments.** In production, all users must register independently or be invited by an Organization Administrator.

All local seed accounts share the default development password: **`password123`**

| Role | Email | Organization | Access Permissions |
| :--- | :--- | :--- | :--- |
| **Org Admin** | `admin@acme.com` | Acme Corp | Full administrative control: Tickets, PRs, Audit, Settings, Partner Links |
| **Support Agent** | `agent@acme.com` | Acme Corp | Can create/manage tickets, status, attachments, and comments |
| **Reviewer / Approver** | `reviewer@acme.com` | Acme Corp | Can review, approve, reject PRs, and inspect audit logs |
| **Cross-Org Guest** | `admin@globex.com` | Globex Inc | Restricted guest access: can only view/comment on shared partner items |
| **Platform Super Admin**| `super@platform.com` | Platform | Platform-wide administrative control across all tenant organizations |

---

## 5. 🧪 Running Automated Tests

The repository includes a comprehensive 9-suite security and integration test suite covering BOLA data isolation, RBAC matrices, session synchronization, token revocation, append-only audit verification, and authentication hardening.

```bash
# Run the complete test battery sequentially
npm test
```

### Running Static Type Checks:
```bash
npx tsc --noEmit
```
Exits cleanly with `0` errors.
