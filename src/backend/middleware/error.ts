import { NextResponse } from "next/server";

export function withErrorHandler(handler: (...args: unknown[]) => Promise<NextResponse>) {
  return async (...args: unknown[]) => {
    try {
      return await handler(...args);
    } catch (err: unknown) {
      console.error("Global middleware error caught:", err);
      
      // Prevent leaking internals while returning a standard error payload
      const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }
  };
}
