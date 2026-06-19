import { NextResponse } from "next/server";
import { AuthError } from "@/src/lib/auth";
import { AdminServiceError } from "@/src/lib/admin-service";

export function adminErrorResponse(error: unknown) {
  if (error instanceof AuthError || error instanceof AdminServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 422 },
    );
  }
  console.error("Admin API error", error);
  return NextResponse.json(
    { error: "Could not complete the administrator request." },
    { status: 500 },
  );
}
