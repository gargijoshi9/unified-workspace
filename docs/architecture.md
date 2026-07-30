# System Architecture & Diagrams

## 1. High-Level System Architecture Diagram
*(Shared Identity/Org Service, Dashboard 1: Support Hub, Dashboard 2: Code Review Console, PostgreSQL, and Redis Cache)*

```mermaid
flowchart TD
    subgraph Client Layer
        User([Enterprise User / Browser])
    end

    subgraph Shared Identity & Governance Service
        NextAuth[Shared Auth Engine & Session Manager]
        OrgSwitcher[Organization & Context Switcher]
        RBACGuard[Centralized RBAC & BOLA Guard - canPerform]
    end

    subgraph Unified Application Dashboards
        Dash1[Dashboard 1: Support Hub - /support]
        Dash2[Dashboard 2: Code Review Console - /review]
    end

    subgraph Data & Cache Storage
        Postgres[(Shared PostgreSQL DB - Multi-Tenant Schemas)]
        Redis[(Upstash Redis Cache - Session Versioning & Token Revocation)]
        AuditLog[(Append-Only Audit Log Engine)]
    end

    User -->|1. Authentication & Active Org Token| NextAuth
    NextAuth <-->|2. Session Version Sync & Invalidation| Redis
    User -->|3. Organization Switch Request| OrgSwitcher
    
    NextAuth -->|Authenticated Request| Dash1
    NextAuth -->|Authenticated Request| Dash2

    Dash1 & Dash2 -->|4. Authorize Request| RBACGuard
    RBACGuard -->|5. Tenant-Scoped Query| Postgres
    RBACGuard -->|6. Record Mutation Event| AuditLog
    AuditLog -->|Append-Only| Postgres

    style User fill:#0F1115,stroke:#8A9992,color:#F5F4F1
    style NextAuth fill:#55443A,stroke:#8A9992,color:#F5F4F1
    style Dash1 fill:#181B20,stroke:#8A9992,color:#F5F4F1
    style Dash2 fill:#181B20,stroke:#8A9992,color:#F5F4F1
    style Redis fill:#4D2308,stroke:#C68B59,color:#F5F4F1
    style Postgres fill:#181B20,stroke:#709775,color:#F5F4F1
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

1. **Authentication & Session Synchronization**: Users authenticate via the Shared Identity Service. NextAuth issues a signed JWT containing active organization memberships and `sessionVersion`. Every API request compares the token's version against Redis; logging out increments the Redis counter, instantly invalidating sessions across both **Dashboard 1** and **Dashboard 2**.
2. **RBAC & BOLA Isolation**: All route handlers enforce centralized authorization through `canPerform(user, action, context)`. Queries are automatically scoped by `activeOrgId`. Cross-org items (shared tickets or PRs) require an active `APPROVED` connection in `OrgConnection` to prevent Broken Object Level Authorization (BOLA).
3. **Append-Only Immutable Audit Trail**: System mutations (creating tickets, approving PRs, updating statuses, or sharing resources) trigger an automatic, append-only record in PostgreSQL storing actor details, target resource IDs, action type, and timestamps.
