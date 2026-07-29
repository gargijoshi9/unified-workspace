import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    memberships?: {
      orgId: string;
      orgName: string;
      role: string;
    }[];
  }

  interface Session {
    user: {
      id: string;
      activeOrgId: string | null;
      memberships: {
        orgId: string;
        orgName: string;
        role: string;
      }[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    activeOrgId?: string | null;
    memberships?: {
      orgId: string;
      orgName: string;
      role: string;
    }[];
    sessionVersion?: string;
    revoked?: boolean;
  }
}
