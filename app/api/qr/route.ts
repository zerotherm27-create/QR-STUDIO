import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/src/lib/auth";
import {
  createQr,
  listQrs,
  QrRepositoryError,
} from "@/src/lib/qr-repository";
import type { QrCode } from "@/src/lib/qr-types";

function serializeQr(qr: QrCode, origin: string) {
  return {
    ...qr,
    shortUrl: `${origin}/q/${encodeURIComponent(qr.slug)}`,
  };
}

function errorResponse(error: unknown) {
  if (error instanceof AuthError || error instanceof QrRepositoryError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 422 },
    );
  }

  console.error("QR API error", error);
  return NextResponse.json(
    { error: "Could not complete the QR request." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const auth = await requireUser({ redirectToLogin: false });
    const qrs = await listQrs(auth);
    const origin = new URL(request.url).origin;
    return NextResponse.json(qrs.map((qr) => serializeQr(qr, origin)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser({ redirectToLogin: false });
    const body = (await request.json()) as {
      customAlias?: unknown;
      destinationUrl?: unknown;
      title?: unknown;
    };
    const qr = await createQr(
      {
        customAlias:
          typeof body.customAlias === "string" ? body.customAlias : undefined,
        destinationUrl:
          typeof body.destinationUrl === "string" ? body.destinationUrl : "",
        title: typeof body.title === "string" ? body.title : undefined,
      },
      auth,
    );

    return NextResponse.json(serializeQr(qr, new URL(request.url).origin), {
      status: 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
