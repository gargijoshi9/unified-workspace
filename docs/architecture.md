# Architecture Overview

```mermaid
flowchart TD
    User([User / Browser]) -->|HTTPS + NextAuth Cookie| AuthLayer[Shared Auth & Identity Layer]
    
    subgraph Frontend & Middleware Boundaries
        AuthLayer -->|Validate Session Version| Redis[(Upstash Redis Cache)]
        AuthLayer -->|Active Org Context| Dashboards{Dashboard Routing}
        Dashboards -->|/support| SupportHub[Support Hub Dashboard]
        Dashboards -->|/review| ReviewConsole[Code Review Console]
    end

    subgraph Service & Control Flow
        SupportHub & ReviewConsole -->|1. Request Action| Controller[Module Controllers]
        Controller -->|2. Check Permission canPerform| Authorize[RBAC Engine & Policy Guard]
        Authorize -->|3. Scoped Repository Query| Repository[Modular Repositories]
        Repository -->|4. Execute Read/Write| Postgres[(PostgreSQL Database)]
        Repository -->|5. Append Audit Event| AuditLog[(Append-Only Audit Log)]
    end

    style User fill:#0F1115,stroke:#8A9992,color:#F5F4F1
    style AuthLayer fill:#55443A,stroke:#8A9992,color:#F5F4F1
    style Redis fill:#4D2308,stroke:#C68B59,color:#F5F4F1
    style Postgres fill:#181B20,stroke:#8A9992,color:#F5F4F1
    style AuditLog fill:#181B20,stroke:#709775,color:#F5F4F1
```

## Data Flow Explanation

1. **Authentication & Session Validation**: When a user makes a request, NextAuth validates the JWT against the shared identity service and compares the token's `sessionVersion` with Redis to ensure immediate cross-dashboard revocation if logged out.
2. **Role-Based Access Control (`canPerform`)**: Every controller invokes `canPerform(user, action, context)` to evaluate the user's role in their active organization (`ORG_ADMIN`, `SUPPORT_AGENT`, `REVIEWER_APPROVER`, `CROSS_ORG_GUEST`, or `PLATFORM_SUPER_ADMIN`) before executing domain logic.
3. **Tenant-Scoped Repository Queries**: Domain services query PostgreSQL strictly through modular repositories, automatically scoping query filters by `orgId` or explicitly verifying cross-org share permissions (`OrgConnection` status `APPROVED`) to eliminate Broken Object Level Authorization (BOLA).
4. **Append-Only Audit Logging**: All state-mutating actions (ticket creation, PR review decisions, sharing events) automatically emit an immutable audit log record to PostgreSQL with actor, action type, timestamp, and target resource metadata.
