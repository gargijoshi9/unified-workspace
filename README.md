# Unified Organization Workspace

A scalable, multi-tenant enterprise portal incorporating **Support Ticket Management**, **Pull Request Review & Audit Console**, **Cross-Organization Collaboration**, **Redis-backed Security**, and **AI Progress Digest Tracking**.

Built for the **Froncort.AI Full-Stack Architecture Assignment**.

---

## 🏛️ System Architecture

The application enforces a **Feature-Based Scalable Architecture** following strict separation of concerns across standard layer boundaries:

```
                  ┌──────────────────────────────────────────────┐
                  │                 Next.js Frontend             │
                  │   (Support Hub / PR Review / Audit Views)    │
                  └──────────────────────┬───────────────────────┘
                                         │ HTTP / REST API
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │             Middleware Layer                 │
                  │ (withAuth, withTenant, withValidation, Audit)│
                  └──────────────────────┬───────────────────────┘
                                         │ Scoped Request
                                         ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │                              Feature Modules                                 │
 │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐     │
 │  │   Auth   │  │ Tickets  │  │   PRs    │  │  Audit   │  │ AI Digest  │ ... │
 │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘     │
 └───────┼─────────────┼─────────────┼─────────────┼──────────────┼─────────────┘
         │             │             │             │              │
         ▼             ▼             ▼             ▼              ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │                             Service Layer                                    │
 │ (Business Logic, RBAC & BOLA Isolation, Audit Triggers, N-Approval Rules)    │
 └──────────────────────────────────────┬───────────────────────────────────────┘
                                        │ Clean Service Calls
                                        ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │                            Repository Layer                                  │
 │        (*.repository.ts - EXCLUSIVE Database Interaction Layer)               │
 └──────────────────────────────────────┬───────────────────────────────────────┘
                                        │ Prisma ORM
                                        ▼
                  ┌──────────────────────────────────────────────┐
                  │               PostgreSQL Database            │
                  │    + Redis (Session Versioning / Revocation) │
                  └──────────────────────────────────────────────┘
```

### Flow Diagram & Layer Boundaries (Mermaid)

```mermaid
graph TD
    Client[Next.js Client UI] -->|HTTP Request| API[Next.js Route Controllers]
    API -->|Authenticate & Scope| MW[Middleware Pipeline]
    MW -->|Service Call| SVC[Feature Services Layer]
    SVC -->|RBAC & Context Check| AUTHZ[Authorization Engine - canPerform]
    SVC -->|Audit Logging| AUDIT[Audit Log Engine - Append Only]
    SVC -->|Data Query| REPO[Repository Layer *.repository.ts]
    REPO -->|ORM Calls| DB[(PostgreSQL Database)]
    AUTHZ -->|Session Version Check| REDIS[(Redis Cache)]

    subgraph Feature Modules
        SVC
        AUTHZ
        AUDIT
        REPO
    end
```

---

## 🚀 Key Architectural Highlights

1. **Strict Repository Pattern**: Repositories (`*.repository.ts`) are the **only** files permitted to interact directly with the Prisma Database Client. Services and Controllers contain 0 direct database imports.
2. **Dynamic Context-Aware Authorization**: Centralized authorization engine (`canPerform`) handling complex BOLA (Broken Object Level Authorization) prevention, cross-org sharing contexts, and static RBAC matrices.
3. **Redis-Backed Instant Token Revocation**: Multi-device logout-everywhere powered by Redis session version tracking (`user:session-version:${userId}`).
4. **Append-Only Immutable Audit Trail**: System activity (ticket/PR creation, status edits, approvals, cross-org shares) creates append-only audit entries. Update and delete operations are strictly prohibited.
5. **AI Progress Digest**: Generates personalized AI digests synthesizing active tickets, overdue items, pending PR reviews, and shared partner items without leaking private cross-tenant data.

---

## 🔑 Demo Login Credentials

All seed accounts use the default password: **`password123`**

| Role | Email | Organization | Access Summary |
| :--- | :--- | :--- | :--- |
| **Org Admin** | `admin@acme.com` | Acme Corp | Full administrative control over tickets, PRs, audit, and org connections. |
| **Support Agent** | `agent@acme.com` | Acme Corp | Can create/manage tickets, status, attachments, and comments. Forbidden from PR/Admin functions. |
| **Reviewer / Approver** | `reviewer@acme.com` | Acme Corp | Can view tickets, review PRs, submit approve/reject decisions, and view audit logs. |
| **Cross-Org Guest** | `admin@globex.com` | Globex Inc | Restricted guest access. Can view/comment *only* on explicitly shared partner items. |
| **Platform Super Admin**| `super@platform.com` | Platform | Platform-wide administrative privileges across all tenant organizations. |

---

## 🛠️ Setup & Running Locally

### 1. Prerequisites
- **Node.js**: `v18+`
- **PostgreSQL**: Running instance or database connection string
- **Redis**: Running instance (default: `redis://127.0.0.1:6379`)

### 2. Environment Configuration
Create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/unified_workspace?schema=public"
REDIS_URL="redis://127.0.0.1:6379"
NEXTAUTH_SECRET="your-super-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Database Migration & Seeding
Initialize the PostgreSQL schema and populate default sample data (Orgs, Users, Memberships, Tickets, PRs, Connections):

```bash
# Push database schema
npx prisma db push

# Seed sample data & demo users
npx prisma db seed
```

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Automated Testing Suite

The project includes 7 automated security and integration test suites covering BOLA data isolation, RBAC matrices, session synchronization, token revocation, and audit trail immutability.

### Run All Automated Tests
```bash
npm test
```

### Run Individual Test Suites
```bash
# 1. RBAC Permissions Matrix Tests
npx tsx tests/rbac.test.ts

# 2. Session Synchronization & Logout-Everywhere Tests
npx tsx tests/session-sync.test.ts

# 3. Token Revocation & JWT Lifecycle Tests
npx tsx tests/token-revocation.test.ts

# 4. Append-Only Audit Trail Integrity Tests
npx tsx tests/audit.test.ts

# 5. Ticket BOLA Isolation Tests
npx tsx tests/bola-tickets.ts

# 6. PR BOLA Isolation Tests
npx tsx tests/bola-prs.ts

# 7. AI Digest Isolation Tests
npx tsx tests/bola-digests.ts
```

---

## 📁 Repository Directory Structure

```
unified-workspace/
├── prisma/
│   ├── schema.prisma      # Prisma ORM Data Models
│   └── seed.ts            # Database Seeding Script
├── src/
│   ├── backend/           # Scalable Feature-Based Backend
│   │   ├── middleware/    # Auth, Tenant, Validation, Audit Middleware
│   │   ├── modules/       # Domain Feature Modules
│   │   │   ├── ai/        # AI Progress Digest Generator
│   │   │   ├── audit/     # Audit Trail Logger & Repository
│   │   │   ├── auth/      # Authentication, JWT, Session & Permission Matrix
│   │   │   ├── notification/ # User Digest & Notifications Repository
│   │   │   ├── organization/ # Organization & Connections Manager
│   │   │   ├── pr/        # PR Workflow, Versions, Approvals & Repository
│   │   │   ├── ticket/    # Support Tickets, Comments & Repository
│   │   │   └── user/      # User Profile & Membership Repository
│   │   └── shared/        # Shared Prisma & Redis Clients
│   └── frontend/          # Next.js UI Application Layer
│       ├── components/    # Reusable Navigation & UI Components
│       └── views/         # Dashboard Page Views (Support Hub, PR Console, Audit)
└── tests/                 # Automated Verification Test Suites
```
