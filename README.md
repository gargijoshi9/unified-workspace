# Unified Organization Workspace

A scalable, multi-tenant enterprise portal incorporating **Support Ticket Management**, **Pull Request Review & Approval Console**, **Cross-Organization Collaboration**, **Redis-Backed Real-Time Security**, **Self-Service Tenant Registration**, and **AI Progress Digest Tracking**.

Built with **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **NextAuth v5 (Beta)**, **Prisma v7**, **PostgreSQL**, and **Redis**.

---

## 📚 Evaluator & Documentation Quick Links

| Resource | Description | Direct Link |
| :--- | :--- | :--- |
| **🏛️ System Architecture** | Detailed Mermaid diagrams (Full System, Session Sync, BOLA Flow) & Deep-Dive Control Flow | [docs/architecture.md](docs/architecture.md) |
| **🛠️ Local Setup Guide** | Step-by-Step Installation, `.env` template, Prisma migrations, and Email Setup | [docs/setup.md](docs/setup.md) |
| **⚠️ Trade-offs & Limitations** | Architectural trade-offs, Monolith vs. Micro-Frontend, and simplified areas | [docs/limitations.md](docs/limitations.md) |
| **🚀 Future Roadmap** | Micro-frontend migration plan, S3 attachments, WebSockets/SSE, and Enterprise SSO | [docs/FUTURE_IMPROVEMENTS.md](docs/FUTURE_IMPROVEMENTS.md) |
| **🤖 LLM / AI Toolchain** | AI pair-programming details, technical reasoning, pros, and cons | [docs/LLM_USAGE.md](docs/LLM_USAGE.md) |

---

## 🏛️ System Architecture

The application strictly enforces a **Layered Feature-Based Architecture** ensuring separation of concerns:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              Next.js Frontend (React 19)                               │
│        [Support Hub]      [PR Review Console]      [Audit Trail]      [Register/Login] │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTP / JSON API
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 API Route Handlers                                     │
│  /api/auth/*     /api/tickets/*     /api/prs/*     /api/audit     /api/connections/*   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Requests Scoped Through Middleware
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Middleware Layer                                     │
│  withAuth (Session Valid)  │  withTenant (Org Scoped)  │  withPermission (RBAC Guard)  │
│                   checkRateLimit (Distributed Redis Rate Limiter)                      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Scoped Domain Service Calls
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   Service Layer                                        │
│  (Business Logic, RBAC & BOLA Checks, Audit Triggers, N-Approval Rules, Hash Hashing)  │
│  AuthService │ TicketsService │ PRsService │ OrganizationService │ AuditService │ AI   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Repository Abstraction
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  Repository Layer                                      │
│                  (*.repository.ts - Exclusive Database Interaction Layer)              │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Prisma v7 (@prisma/adapter-pg)
                                            ▼
┌──────────────────────────────────────────────┬─────────────────────────────────────────┐
│              PostgreSQL Database             │               Redis Cache               │
│  (Users, Orgs, Memberships, Tickets, PRs,   │  (Session Versioning, Token Revocation, │
│     Shares, AuditLogs, FeatureFlags)         │    Rate Limiting, Reset Token Hashes)   │
└──────────────────────────────────────────────┴─────────────────────────────────────────┘
```

---

## 🚀 Key Features

### 1. 🛡️ Identity, Authentication & Security
* **NextAuth v5 (Beta) Credentials Provider**: JWT session strategy fortified with Redis session tracking.
* **Self-Service Registration (`/register`)**: Atomically provisions a new organization, creator user, and assigns `ORG_ADMIN` membership in an isolated Prisma transaction. Server-side inputs are strictly validated (RFC 5322 email formatting, min 8-character password with letters and numbers).
* **Strict Privilege Escalation Defense**: Rejects and ignores client attempts to assign elevated roles (e.g., `PLATFORM_SUPER_ADMIN`) or join arbitrary tenant IDs during registration.
* **Email Normalization & Secure Password Storage**: Emails are trimmed and lowercased across authentication and recovery; passwords are encrypted with `bcryptjs` (12 salt rounds) and never exposed in responses or logs.
* **Redis-Backed Real-Time Session Invalidation**: Dual-dashboard session versioning (`user:session-version:${userId}`) immediately terminates access across all tabs, devices, and dashboards upon logout.
* **Distributed Rate Limiting**: Built-in fixed-window rate limiter in Redis protects against brute force attacks and registration spam.
* **Cryptographically Secure Password Recovery**: Implements expiring, single-use SHA-256 hashed recovery tokens stored in Redis with enumeration-resistant generic responses.

### 2. 🎫 Customer Support Hub (`/support`)
* **Ticket Management**: Create, view, update, search, and soft-delete tickets across statuses (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`).
* **Collaboration**: Threaded ticket comments and cloud file attachment tracking.
* **BOLA-Safe Cross-Org Sharing**: Explicit resource-level sharing with approved partner organizations.

### 3. 🔀 Engineering Code Review Console (`/review`)
* **Pull Request Workflow**: Track states (`DRAFT`, `IN_REVIEW`, `APPROVED`, `REJECTED`, `MERGED`).
* **Multi-Version History**: Retain complete code description iteration history via `PRVersion`.
* **Governance & N-Approvals**: Enforces configurable approval thresholds (`requiredApprovals`) and reviewer decision matrix (`approved`, `changes_requested`).
* **Cross-Org Review**: Authorize partner organizations to collaborate on shared pull requests.

### 4. 🤝 Cross-Organization Connections
* Mutual partner lifecycle (`PENDING` ➔ `APPROVED` ➔ `REVOKED`) managed under `/api/connections`.
* Guests only access assets explicitly shared with their organization.

### 5. 📜 Immutable Audit Logging (`/review/audit`)
* Black-box flight recorder capturing actor ID, organization context, action type (`ticket.created`, `pr.approved`, `org.registered`, etc.), target entity, and JSON metadata.
* Database models enforce append-only immutability; updates and deletions are strictly rejected.

### 6. 🤖 AI Progress Digest Tracking
* Automated service (`/api/cron`, `Digest` model) summarizing active tickets, pending PR reviews, and shared partner workloads without leaking cross-tenant data.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Framework** | Next.js 16 (App Router), React 19, TypeScript 5 |
| **Authentication** | NextAuth.js v5 (Beta), Bcryptjs |
| **Database & ORM** | PostgreSQL, Prisma ORM v7 with `@prisma/adapter-pg` |
| **Cache & Real-Time Security** | Redis / Upstash Redis (`ioredis`) |
| **Styling & Icons** | Tailwind CSS v4, Lucide React, Geist Fonts |
| **Transactional Email** | Resend API / Nodemailer (Pluggable) |
| **Testing** | Node.js Test Runner, TSX, Comprehensive 9-Suite Test Battery |

---

## 💻 Prerequisites

Before running the application locally, ensure you have:
* **Node.js**: `v18.18.0` or higher (Node v20+ recommended)
* **npm**: `v9.x` or higher
* **PostgreSQL Database**: Local PostgreSQL instance or cloud provider (e.g., Neon, Supabase, AWS RDS)
* **Redis Server**: Local Redis (`redis://127.0.0.1:6379`) or Upstash Redis URL

---

## ⚙️ Local Setup Instructions

### 1. Clone the Repository
```bash
git clone https://github.com/gargijoshi9/unified-workspace.git
cd unified-workspace
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the project root:

```env
# PostgreSQL Database Connection String
DATABASE_URL="postgresql://username:password@localhost:5432/unified_workspace?sslmode=disable"

# Redis Server Connection String (Local or Upstash)
REDIS_URL="redis://127.0.0.1:6379"

# NextAuth Secret & Base URL
NEXTAUTH_SECRET="your-32-byte-secret-key-here"
AUTH_SECRET="your-32-byte-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"

# Optional: Transactional Email Delivery (Required for live password reset emails)
RESEND_API_KEY="re_your_api_key_here"
EMAIL_FROM="Unified Workspace <onboarding@resend.dev>"
```

### 4. Push Database Schema
```bash
npx prisma generate
npx prisma db push
```

### 5. Seed Initial Development Data
Populates default organizations, demo users, sample tickets, and PRs:
```bash
npx prisma db seed
```

### 6. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Development-Only Demo Credentials

> [!CAUTION]
> **DEVELOPMENT / TESTING PURPOSES ONLY**
> The accounts below are created strictly for local development and evaluator demonstration. **Never use shared demo passwords in staging or production environments.**

All pre-seeded local development accounts share the default local password: **`password123`**

| Role | Email | Organization | Access Summary |
| :--- | :--- | :--- | :--- |
| **Org Admin** | `admin@acme.com` | Acme Corp | Full administrative control over tickets, PRs, audit, settings, and partner links. |
| **Support Agent** | `agent@acme.com` | Acme Corp | Can create/manage tickets, status, attachments, and comments. Blocked from PR/Admin actions. |
| **Reviewer / Approver** | `reviewer@acme.com` | Acme Corp | Can view tickets, review PRs, submit approve/reject decisions, and view audit logs. |
| **Cross-Org Guest** | `admin@globex.com` | Globex Inc | Restricted partner access. Can view/comment *only* on items explicitly shared by Acme. |
| **Platform Super Admin**| `super@platform.com` | Platform | Platform-wide administrative privileges across all tenant organizations. |

---

## 🧪 Security & Regression Testing Suite

The repository includes **9 automated test suites** covering multi-tenant isolation, role boundaries, instant session revocation, audit immutability, and authentication hardening.

Run the entire test suite sequentially:
```bash
npm test
```

### Test Suite Coverage:
1. `tests/auth-security.test.ts`: User & tenant registration, password complexity, atomic rollback, privilege escalation rejection, email normalization, production session guard, and reset lifecycle.
2. `tests/tenant-isolation.test.ts`: Cross-tenant read/write prevention, BOLA defense, and zero database state tampering.
3. `tests/bola-tickets.ts`: Cross-tenant ticket read/edit boundaries.
4. `tests/bola-prs.ts`: Cross-tenant PR review and approval isolation.
5. `tests/bola-digests.ts`: AI progress digest cross-tenant privacy verification.
6. `tests/rbac.test.ts`: Complete 47-assertion role permission matrix across all 5 roles.
7. `tests/session-sync.test.ts`: Dual-dashboard session synchronization and global logout invalidation.
8. `tests/token-revocation.test.ts`: Stolen/reused JWT rejection upon logout.
9. `tests/audit.test.ts`: Append-only immutability preventing log updates and deletions.

To run static type checking across the entire project:
```bash
npx tsc --noEmit
```
