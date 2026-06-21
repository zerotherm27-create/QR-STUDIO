import { NextResponse } from "next/server";
import { adminErrorResponse } from "@/app/api/admin/_shared";
import { inviteUser } from "@/src/lib/admin-service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: unknown };
    const result = await inviteUser(
      typeof body.email === "string" ? body.email : "",
      new URL(request.url).origin,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
