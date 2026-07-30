# Unified Organization Workspace

A scalable, multi-tenant enterprise portal incorporating **Support Ticket Management**, **Pull Request Review & Audit Console**, **Cross-Organization Collaboration**, **Redis-backed Security**, and **AI Progress Digest Tracking**.

Built for the **Froncort.AI Full-Stack Architecture Assignment**.

---

## 📚 Submission & Evaluator Quick Links

For quick review and evaluation of the project documentation, click any link below:

| Resource | Description | Direct Link |
| :--- | :--- | :--- |
| **🏛️ System Architecture** | 3 Detailed Mermaid Diagrams (System, Session Sync, BOLA Flow) & Control Architecture | [docs/ARCHITECTURE.md](docs/architecture.md) |
| **🛠️ Local Setup Guide** | Step-by-Step Installation, `.env` guide, Prisma migrations, and Seeded Demo Credentials | [docs/SETUP.md](docs/setup.md) |
| **⚠️ Trade-offs & Limitations** | Technical decisions, Monolith vs. Micro-Frontend, and simplified areas | [docs/LIMITATIONS.md](docs/limitations.md) |
| **🚀 Future Roadmap** | Micro-frontend migration plan, edge Redis REST API upgrades, and SSE real-time alerts | [docs/FUTURE_IMPROVEMENTS.md](docs/FUTURE_IMPROVEMENTS.md) |
| **🤖 LLM / AI Toolchain** | AI pair-programming details, technical reasoning, pros, and cons | [docs/LLM_USAGE.md](docs/LLM_USAGE.md) |

---

## 🏛️ System Architecture Overview

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

---

## 🔑 Quick Demo Credentials

All seed accounts use the default password: **`password123`**

| Role | Email | Organization | Access Summary |
| :--- | :--- | :--- | :--- |
| **Org Admin** | `admin@acme.com` | Acme Corp | Full administrative control over tickets, PRs, audit, and org connections. |
| **Support Agent** | `agent@acme.com` | Acme Corp | Can create/manage tickets, status, attachments, and comments. Forbidden from PR/Admin functions. |
| **Reviewer / Approver** | `reviewer@acme.com` | Acme Corp | Can view tickets, review PRs, submit approve/reject decisions, and view audit logs. |
| **Cross-Org Guest** | `admin@globex.com` | Globex Inc | Restricted guest access. Can view/comment *only* on explicitly shared partner items. |
| **Platform Super Admin**| `super@platform.com` | Platform | Platform-wide administrative privileges across all tenant organizations. |

---

## 🧪 Automated Testing Suite

The project includes 7 automated security and integration test suites covering BOLA data isolation, RBAC matrices, session synchronization, token revocation, and audit trail immutability.

```bash
# Run all test suites sequentially
npm test
```

---

## 📁 Project Directory Structure

```
unified-workspace/
├── docs/                  # Evaluator Documentation Folder
│   ├── ARCHITECTURE.md    # 3 Mermaid Diagrams & Control Flow
│   ├── SETUP.md           # Local Installation & Credentials
│   ├── LIMITATIONS.md     # Architectural Trade-offs
│   ├── FUTURE_IMPROVEMENTS.md # Roadmap & Micro-Frontend Plan
│   └── LLM_USAGE.md       # Agentic AI & LLM Toolchain Details
├── prisma/
│   ├── schema.prisma      # Prisma ORM Data Models
│   └── seed.ts            # Database Seeding Script
├── src/
│   ├── backend/           # Scalable Feature-Based Backend
│   │   ├── middleware/    # Auth, Tenant, Validation, Audit Middleware
│   │   └── modules/       # Domain Feature Modules (auth, pr, ticket, audit, etc.)
│   └── frontend/          # Next.js UI Application Layer
└── tests/                 # Automated Verification Test Suites
```
