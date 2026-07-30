import { NextResponse } from "next/server";
import { AuthenticatedHandler } from "./authenticate";
import { UserSession } from "@/backend/modules/auth/auth.types";

export type ValidatorCallback = (
  data: unknown
) => { success: true; data: unknown } | { success: false; error: string };

export function withValidation(validator: ValidatorCallback) {
  return (handler: AuthenticatedHandler): AuthenticatedHandler => {
    return async (req: Request, user: UserSession, ...args: unknown[]) => {
      try {
        let body: unknown = {};
        if (req.method !== "GET" && req.method !== "DELETE") {
          body = await req.clone().json();
        }

        const validation = validator(body);
        if (!validation.success) {
          return NextResponse.json({ error: validation.error }, { status: 400 });
        }

        // Pass parsed data as an argument to the handler if needed, or simply let handler continue
        return handler(req, user, ...args);
      } catch {
        return NextResponse.json({ error: "Invalid request payload JSON" }, { status: 400 });
      }
    };
  };
}
