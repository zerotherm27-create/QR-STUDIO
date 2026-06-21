import { NextResponse } from "next/server";
import { adminErrorResponse } from "@/app/api/admin/_shared";
import { setUserRole } from "@/src/lib/admin-service";
import type { UserRole } from "@/src/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const [{ id }, body] = await Promise.all([
      params,
      request.json() as Promise<{ role?: unknown }>,
    ]);
    const result = await setUserRole(
      id,
      (typeof body.role === "string" ? body.role : "") as UserRole,
    );
    return NextResponse.json(result);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
