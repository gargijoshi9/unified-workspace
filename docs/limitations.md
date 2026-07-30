# Architectural Trade-offs & Known Limitations

In the interest of full engineering transparency, this document details the deliberate trade-offs, architecture choices, and areas simplified during initial implementation.

---

## 1. Single Next.js Monolith vs. Two Independently Deployed Dashboards

### Current Architecture Choice:
Both the **Support Hub (`/support`)** and **Code Review Console (`/review`)** are deployed within a unified Next.js App Router workspace under shared authentication and layout boundaries.

### Why This Decision Was Made:
- **Unified Identity & Session Performance**: Hosting both dashboards in the same codebase allowed zero-latency cross-dashboard navigation and instantaneous organization context switching without requiring cross-domain OAuth redirects.
- **Shared Codebase & Dry Domain Logic**: Controller, Service, and Repository layers (`/src/backend/modules/`) could directly re-use authorization guards (`canPerform`), BOLA checks, and Prisma models.

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
