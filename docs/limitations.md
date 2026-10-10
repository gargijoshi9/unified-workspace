# Architectural Trade-offs & Known Limitations

In the interest of full engineering transparency, this document details the deliberate architectural trade-offs, design decisions, and scope boundaries established for the **Unified Organization Workspace**.

---

## 1. Unified Next.js Monolith vs. Independent Micro-Frontends

### Current Architecture Choice:
Both the **Customer Support Hub (`/support`)** and **Pull Request Review Console (`/review`)** are deployed within a unified Next.js 16 App Router application sharing authentication and layout boundaries.

### Engineering Rationale:
* **Zero-Latency Session Transitions**: Hosting both dashboards in the same application allows instant cross-dashboard navigation without requiring cross-domain OAuth redirects or federated single sign-on (SSO) handshakes between subdomains.
* **Shared Authorization Logic & Domain Boundaries**: Domain services, repositories, and the `canPerform` policy engine (`/src/backend/modules/`) are reused directly across routes without code duplication or distributed service invocation overhead.
* **Operational Simplicity**: A single deployment pipeline reduces operational overhead for local evaluation while preserving strict internal layer isolation.

### Production Alternative:
If decoupled teams require independent deployment cadences, the frontend can be decomposed into micro-frontends (e.g., Module Federation or independent subdomains like `support.acme.com` and `code.acme.com`) fronted by a centralized OAuth2/OIDC identity provider.

---

## 2. Technical Decisions & Simplifications

### A. File Attachments Storage
* **Current State**: Attachment uploads in the Support Hub store file metadata (file name, cloud URL, and timestamps) in PostgreSQL.
* **Production Expansion**: For enterprise deployments handling large binary payloads, attachments should be uploaded directly to S3 or Cloudflare R2 using short-lived pre-signed upload URLs, accompanied by serverless antivirus scanning and CDN edge distribution.

### B. Pull Request Diff Representation
* **Current State**: Pull request versioning tracks description iterations and revision histories via `PRVersion`, rendering diffs as structured code blocks.
* **Production Expansion**: Integrate `monaco-editor` or `diff2html` with a Git tree parser to support syntax-highlighted unified patch rendering, character-level diffing, and inline line-by-line comment threads.

### C. Rate Limiting Mechanism
* **Current State**: Distributed rate limiting uses a fixed-window atomic counter in Redis (`checkRateLimit`).
* **Trade-off**: Fixed windows can experience small burst spikes at window boundary resets.
* **Production Expansion**: Implement a sliding-window log or token-bucket algorithm using Redis sorted sets (`ZSET`) for perfectly smooth traffic shaping.

### D. Email Delivery Dependency
* **Current State**: Password recovery tokens are cryptographically generated (32-byte entropy) and hashed (SHA-256) in Redis. If `RESEND_API_KEY` is not present, the system logs an operational notice and safely holds the token without exposing it.
* **Production Requirement**: A valid transactional email service (Resend or SMTP) must be configured in `.env` to dispatch real password reset emails to end users.

### E. AI Progress Digests Execution Model
* **Current State**: AI digests aggregate live open tickets, overdue items, pending PR reviews, and shared partner workloads via scheduled API cron endpoints (`/api/cron`).
* **Production Expansion**: In high-throughput enterprise environments, move digest synthesis into a distributed job queue (e.g., BullMQ or Temporal) and pipe context summaries to an LLM endpoint (such as the Gemini 1.5 Flash API) to produce personalized natural-language executive briefs.
