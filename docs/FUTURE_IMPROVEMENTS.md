# Future Improvements & Scaling Roadmap

This document outlines key technical enhancements, scalability milestones, and enterprise features planned for future iterations of the **Unified Organization Workspace**.

---

## 1. Micro-Frontend & Multi-App Decomposition

As engineering and support teams scale independently, the unified architecture can transition into independently deployed services:

1. **Independent Subdomain Routing**:
   * `support.acme.com`: Customer support ticketing application.
   * `review.acme.com`: Code review and audit dashboard.
   * `auth.acme.com`: Centralized OAuth2 / OpenID Connect identity provider.
2. **Centralized Identity Service**:
   * Extract `auth.service.ts` into a standalone OAuth2 / OIDC server issuing signed JWT tokens with standard claims.
3. **Cross-Domain Session Synchronization**:
   * Use wildcard parent domain cookies (`Domain=.acme.com`) paired with Redis Pub/Sub channels to propagate real-time logout events across all subdomains.

---

## 2. Real-Time Infrastructure & Event Bus

* **Server-Sent Events (SSE) & WebSockets**: Replace client-side notification polling with persistent Server-Sent Events (SSE) or WebSocket connections for zero-latency notification delivery.
* **Live Presence Indicators**: Display real-time user presence on tickets and PRs (e.g., *"Agent Sam is currently typing a comment..."*).
* **Granular Webhook Subscriptions**: Allow Organization Administrators to register webhook endpoints for sensitive events (`ticket.resolved`, `pr.approved`, `member.joined`).

---

## 3. Storage & Binary Payload Pipeline

* **Direct Cloud Storage (S3 / Cloudflare R2)**: Implement direct browser-to-bucket uploads using short-lived pre-signed URLs, keeping large binary payloads off application servers.
* **Asynchronous File Security Scanning**: Trigger serverless Lambda/Worker functions on upload events to execute ClamAV or malware detection prior to marking attachments available for download.

---

## 4. Enterprise Identity & Compliance (SSO & SCIM)

* **Enterprise SAML 2.0 / OIDC Integration**: Support corporate identity providers (Okta, Azure Active Directory, Google Workspace, Ping Identity).
* **SCIM 2.0 User Provisioning**: Automatically provision, update, and de-provision user accounts and organization memberships when employees join or leave corporate directories.
* **Role Mapping & Domain Auto-Join**: Automatically route users registering with verified company domains (`@acme.com`) into existing tenant organizations with predetermined roles.

---

## 5. AI-Powered Executive Intelligence

* **LLM Digest Generation**: Connect the existing dynamic context aggregator to Gemini or Claude API endpoints to produce natural-language executive briefings, sentiment analysis on customer support tickets, and risk ratings for pending pull requests.
* **Automated Ticket Triage**: Automatically classify incoming support tickets into severity tiers and recommend reviewer assignments based on past code ownership.

---

## 6. Edge Performance & Database Scaling

* **Edge Redis REST Client**: For deployment on serverless edge environments (such as Vercel Edge Functions or Cloudflare Workers), migrate from TCP-based `ioredis` to `@upstash/redis` HTTP REST client to eliminate connection establishment latency on cold starts.
* **Read-Replica Routing**: Route high-volume read queries (e.g., public ticket lists and historical audit log queries) to PostgreSQL read replicas while routing write mutations to the primary database.
