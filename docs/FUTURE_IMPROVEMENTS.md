# Future Improvements & Scaling Roadmap

This document outlines key technical enhancements and architectural improvements planned for future iterations.

---

## 1. Micro-Frontend & Multi-App Migration

If scaling for separate engineering and support organizations with independent deployment lifecycles:

1. **Dedicated Repositories**:
   - `support-dashboard.acme.com` (React / Next.js)
   - `code-review.acme.com` (React / Next.js)
   - `identity.acme.com` (OAuth2 / OpenID Connect Identity Provider)
2. **Centralized Identity Service**: Extract `auth.service.ts` into a standalone OAuth2 / OIDC authentication service emitting signed JWT tokens.
3. **Cross-Domain Session Synchronization**: Use centralized Redis pub/sub and HTTP cookie sharing across subdomains (`.acme.com`) to propagate global logout events.

---

## 2. Advanced Security & Infrastructure Upgrades

- **Edge-Based Redis API**: For edge-deployed serverless functions on Vercel, migrate `ioredis` to `@upstash/redis` REST client to eliminate TCP connection establishment latency on cold starts.
- **Granular Webhook Subscriptions**: Allow organization admins to configure webhooks for ticket status updates and PR review requests.
- **Real-Time WebSockets / SSE**: Replace 30-second notification polling in `Navbar.tsx` with Server-Sent Events (SSE) or WebSockets for instant real-time alerts.
