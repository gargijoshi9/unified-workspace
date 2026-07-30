import { OrganizationRepository } from "./organizationRepository";
import { UserSession } from "@/backend/modules/auth/auth.types";
import { canPerform } from "@/backend/modules/auth/authorize";
import { logAudit } from "@/backend/modules/audit/audit";

export class OrganizationService {
  static async getConnections(user: UserSession) {
    const connections = await OrganizationRepository.findConnections(user.activeOrgId);
    
    // Map connections to the other organization details
    return connections.map((conn) => {
      return conn.orgAId === user.activeOrgId ? conn.orgB : conn.orgA;
    });
  }

  static async getFeatureFlags(user: UserSession) {
    return OrganizationRepository.findFeatureFlags(user.activeOrgId);
  }

  static async toggleFeatureFlag(user: UserSession, key: string, enabled: boolean) {
    if (!canPerform(user, "manage_feature_flags")) {
      return { error: "Forbidden" };
    }

    const flag = await OrganizationRepository.upsertFeatureFlag(user.activeOrgId, key, enabled);

    await logAudit(
      user.id,
      user.activeOrgId,
      "feature_flag.toggled",
      "FeatureFlag",
      flag.id,
      { key, enabled }
    );

    return { flag };
  }
}
