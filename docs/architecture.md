# System Architecture & Diagrams

## 1. High-Level System Architecture Diagram
*(User → Auth/Identity Layer → [Support Hub | Review Console] → Shared Postgres DB with Redis and Audit Log side components)*

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

---

## 2. Session Synchronization & Global Revocation Diagram
*(Cross-Dashboard Single Sign-On and Multi-Device Session Invalidation)*

```mermaid
sequenceDiagram
    autonumber
    actor User as Enterprise User
    participant Dash1 as Dashboard 1 (Support Hub)
    participant Dash2 as Dashboard 2 (PR Console)
    participant Auth as Shared Auth Service
    participant Redis as Upstash Redis Cache

    User->>Auth: Login Request (email & password)
    Auth->>Redis: Fetch current sessionVersion for userId
    Redis-->>Auth: Returns sessionVersion = 1
    Auth-->>User: Issues JWT Token (sessionVersion: 1)

    Note over User,Dash2: Dual-Dashboard Access Active
    User->>Dash1: Request Support Tickets
    Dash1->>Redis: Verify sessionVersion === 1
    Redis-->>Dash1: Valid (200 OK)

    User->>Dash2: Request Code Reviews
    Dash2->>Redis: Verify sessionVersion === 1
    Redis-->>Dash2: Valid (200 OK)

    Note over User,Redis: Global Logout Action
    User->>Dash1: Logout from Dashboard 1
    Dash1->>Auth: Trigger signOut()
    Auth->>Redis: INCR user:session-version:${userId} (New Version: 2)

    Note over User,Dash2: Immediate Cross-Dashboard Invalidation
    User->>Dash2: Subsequent request on Dashboard 2
    Dash2->>Redis: Compare Token Version (1) vs Redis Version (2)
    Redis-->>Dash2: Version Mismatch (Revoked)
    Dash2-->>User: 401 Unauthorized (Redirect to /login)
```

---

## 3. Multi-Tenant Authorization & BOLA Prevention Flow
*(Cross-Org Data Isolation, Shared Resources, and Append-Only Audit Trail)*

```mermaid
flowchart LR
    subgraph Client Request
        Req[Incoming Action Request]
    end

    subgraph Authorization Engine
        Step1{1. Valid Auth Session?}
        Step2{2. Organization Context Match?}
        Step3{3. RBAC Role Allowed?}
        Step4{4. BOLA Check: Org Connection Approved?}
    end

    subgraph Execution & Audit
        Success[Execute Controller & Repository Action]
        Audit[Append Audit Log Record]
        Deny[Reject Request: 403 Forbidden / 404 Not Found]
    end

    Req --> Step1
    Step1 -- No --> Deny
    Step1 -- Yes --> Step2
    
    Step2 -- Same Org --> Step3
    Step2 -- Cross Org Item --> Step4
    
    Step4 -- Connection APPROVED --> Step3
    Step4 -- No Connection / Pending --> Deny

    Step3 -- Role Allowed --> Success
    Step3 -- Role Denied --> Deny

    Success --> Audit

    style Step1 fill:#181B20,stroke:#8A9992,color:#F5F4F1
    style Step2 fill:#181B20,stroke:#8A9992,color:#F5F4F1
    style Step3 fill:#181B20,stroke:#8A9992,color:#F5F4F1
    style Step4 fill:#4D2308,stroke:#C68B59,color:#F5F4F1
    style Success fill:#181B20,stroke:#709775,color:#F5F4F1
    style Deny fill:#181B20,stroke:#A35D5D,color:#F5F4F1
```

---

## Data Flow & Control Architecture Explanation

1. **Authentication & Session Validation**: When a user makes a request, NextAuth validates the JWT against the shared identity service and compares the token's `sessionVersion` with Redis to ensure immediate cross-dashboard revocation if logged out.
2. **Role-Based Access Control (`canPerform`)**: Every controller invokes `canPerform(user, action, context)` to evaluate the user's role in their active organization (`ORG_ADMIN`, `SUPPORT_AGENT`, `REVIEWER_APPROVER`, `CROSS_ORG_GUEST`, or `PLATFORM_SUPER_ADMIN`) before executing domain logic.
3. **Tenant-Scoped Repository Queries**: Domain services query PostgreSQL strictly through modular repositories, automatically scoping query filters by `orgId` or explicitly verifying cross-org share permissions (`OrgConnection` status `APPROVED`) to eliminate Broken Object Level Authorization (BOLA).
4. **Append-Only Audit Logging**: All state-mutating actions (ticket creation, PR review decisions, sharing events) automatically emit an immutable audit log record to PostgreSQL with actor, action type, timestamp, and target resource metadata.
