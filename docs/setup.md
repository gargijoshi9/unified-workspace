# Local Setup & Installation Guide

Follow these steps to set up and run the Unified Organization Workspace locally on your machine.

---

## 1. Prerequisites

- **Node.js**: `v18.x` or higher
- **npm** / **bun** / **yarn**
- **PostgreSQL Database** (local Postgres instance or remote PostgreSQL URI like Neon/Supabase)
- **Redis Server** (local Redis instance or Upstash Redis URL)

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
Create a `.env` file in the root directory:

```env
# PostgreSQL Database Connection String
DATABASE_URL="postgresql://username:password@localhost:5432/unified_workspace?sslmode=disable"

# Upstash Redis Connection String (or local redis://127.0.0.1:6379)
REDIS_URL="redis://default:your_redis_token@your_redis_host:6379"

# NextAuth Configuration
AUTH_SECRET="your-32-byte-secret-key"
NEXTAUTH_SECRET="your-32-byte-secret-key"
NEXTAUTH_URL="http://localhost:3000"
```

### Step 4: Run Database Migrations
Generate Prisma Client and push database schema:
```bash
npx prisma generate
npx prisma db push
```

### Step 5: Seed the Database
Populate the database with default organizations, multi-tenant users, sample tickets, PRs, and connections:
```bash
npx prisma db seed
```

### Step 6: Start Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Seeded Demo Credentials

| Organization | Email | Password | Role | Supported Dashboards |
| :--- | :--- | :--- | :--- | :--- |
| **Acme Corp** | `admin@acme.com` | `password123` | `ORG_ADMIN` | Support Hub, PR Console, Audit, Settings |
| **Acme Corp** | `agent@acme.com` | `password123` | `SUPPORT_AGENT` | Support Hub (Create/Edit Tickets, Comment) |
| **Acme Corp** | `reviewer@acme.com` | `password123` | `REVIEWER_APPROVER` | PR Console (Review, Approve, Reject PRs) |
| **Globex Inc** | `admin@globex.com` | `password123` | `ORG_ADMIN` | Globex Support Hub, PR Console, Cross-Org |
| **Globex Inc** | `guest@globex.com` | `password123` | `CROSS_ORG_GUEST` | Read-only access to Acme shared items |
| **Global Platform** | `superadmin@platform.com` | `password123` | `PLATFORM_SUPER_ADMIN` | Full Cross-Tenant & Platform Governance |

---

## 🧪 Running Automated Tests

To execute the complete 7-suite test battery (47 RBAC tests, BOLA isolation, session sync, token revocation, append-only audit verification):

```bash
npm test
```
