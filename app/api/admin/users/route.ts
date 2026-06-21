import { NextResponse } from "next/server";
import { adminErrorResponse } from "@/app/api/admin/_shared";
import { listUsers } from "@/src/lib/admin-service";

export async function GET() {
  try {
    return NextResponse.json(await listUsers());
  } catch (error) {
    return adminErrorResponse(error);
  }
}
