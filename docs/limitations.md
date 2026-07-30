# Architectural Trade-offs & Known Limitations

In the interest of full engineering transparency, this document details the deliberate trade-offs, architecture choices, areas simplified during initial implementation, and the Agentic AI toolchain used during development.

---

## 🤖 Agentic AI & LLM Toolchain

This repository was architected, built, and tested in pair-programming collaboration with **Antigravity (powered by Google DeepMind's Gemini 3.6 Flash model)** operating as an autonomous software architect and coding assistant.

### AI Integration & Reasoning:
- **Refactoring & Modular Architecture**: The LLM was leveraged to execute non-breaking modular refactoring from flat route handlers into strict `Controller -> Service -> Repository (*.repository.ts)` layers.
- **Security & Authorization Verification**: Used to generate comprehensive RBAC and BOLA verification test matrices across 5 system roles (`ORG_ADMIN`, `SUPPORT_AGENT`, `REVIEWER_APPROVER`, `CROSS_ORG_GUEST`, `PLATFORM_SUPER_ADMIN`).
- **Data Flow & Consistency**: Automated migration checks, Prisma schema relations, and Redis session versioning hooks.

### Pros & Cons of Agentic AI Pair Programming:

| Pros 👍 | Cons / Trade-offs 👎 |
| :--- | :--- |
| **Rapid Iteration**: Accelerated boilerplate creation for test suites (47 RBAC test cases written and verified cleanly). | **Strict Verification Needed**: AI generated queries can occasionally miss deep relational joins (e.g. initial ticket author join in comments required explicit repository mapping). |
| **Comprehensive Security Auditing**: Proactively caught subtle BOLA edge cases in cross-org item sharing and AI Digest generation. | **Context Maintenance**: Long architectural conversations require periodic summarization to maintain precision on environment variables and connection string settings. |
| **Zero Regressions**: Running continuous background unit and BOLA tests prevented regressions during refactoring. | **Database Pool Specifics**: Required explicit tuning for serverless PostgreSQL connection pooling (`pg.Pool` reuse) and Redis timeouts. |

---

## 1. Single Next.js Monolith vs. Two Independently Deployed Dashboards

### Current Architecture Choice:
Both the **Support Hub (`/support`)** and **Code Review Console (`/review`)** are deployed within a unified Next.js App Router workspace under shared authentication and layout boundaries.

### Why This Decision Was Made:
- **Unified Identity & Session Performance**: Hosting both dashboards in the same codebase allowed zero-latency cross-dashboard navigation and instantaneous organization context switching without requiring cross-domain OAuth redirects.
- **Shared Codebase & Dry Domain Logic**: Controller, Service, and Repository layers (`/src/backend/modules/`) could directly re-use authorization guards (`canPerform`), BOLA checks, and Prisma models.

### How We Would Split It With More Time (Micro-Frontend / Multi-App Architecture):
If scaling for separate engineering and support organizations:
1. **Dedicated Repositories**:
   - `support-dashboard.acme.com` (React / Next.js)
   - `code-review.acme.com` (React / Next.js)
   - `identity.acme.com` (OAuth2 / OpenID Connect Identity Provider)
2. **Centralized Identity Service**: Extract `auth.service.ts` into a standalone OAuth2 / OIDC authentication service emitting signed JWT tokens.
3. **Cross-Domain Session Synchronization**: Use centralized Redis pub/sub and HTTP cookie sharing across subdomains (`.acme.com`) to propagate global logout events.

---

## 2. Simplifications & Areas for Production Expansion

### A. Attachments Handling
- **Current State**: Attachment uploads in Support Hub store metadata (file name, file size, MIME type, upload timestamp) directly in PostgreSQL.
- **Production Expansion**: In a full production setup, files should be streamed to an S3/Cloudflare R2 bucket with pre-signed upload URLs, virus scanning, and CDN distribution.

### B. Pull Request Diff View
- **Current State**: PR versioning tracks complete description revisions and version history counts. Code diffs are rendered as structured text blocks.
- **Production Expansion**: Integrate `monaco-editor` or `diff2html` to parse git unified patch formats (`git diff`) with line-by-line inline code comments.

### C. AI Digest Natural Language Generation
- **Current State**: AI Digests dynamically aggregate live open tickets, overdue items, pending PR reviews, and cross-org shared assets into formatted context strings.
- **Production Expansion**: Connect the aggregate digest payload to an LLM endpoint (such as Google Gemini API) to generate personalized executive summaries and action recommendations.

### D. Upstash Redis Serverless Cold Starts
- **Current State**: Redis connection uses `ioredis` with TLS support against Upstash Cloud.
- **Production Expansion**: For edge-deployed serverless functions, migrate to `@upstash/redis` REST client to eliminate TCP connection establishment latency on cold starts.
