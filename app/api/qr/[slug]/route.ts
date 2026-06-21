import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/src/lib/auth";
import {
  deleteQr,
  getQr,
  QrRepositoryError,
  updateQr,
} from "@/src/lib/qr-repository";
import type { QrCode, QrStatus } from "@/src/lib/qr-types";

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

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const auth = await requireUser({ redirectToLogin: false });
    const { slug } = await params;
    const qr = await getQr(slug, auth);
    return NextResponse.json(serializeQr(qr, new URL(request.url).origin));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const auth = await requireUser({ redirectToLogin: false });
    const { slug } = await params;
    const body = (await request.json()) as {
      destinationUrl?: unknown;
      status?: unknown;
      title?: unknown;
    };
    if (
      body.status !== undefined &&
      body.status !== "active" &&
      body.status !== "disabled"
    ) {
      throw new QrRepositoryError(
        "Status must be active or disabled.",
        422,
        "VALIDATION",
      );
    }
    const qr = await updateQr(
      slug,
      {
        destinationUrl:
          typeof body.destinationUrl === "string"
            ? body.destinationUrl
            : undefined,
        status:
          body.status === "active" || body.status === "disabled"
            ? (body.status as QrStatus)
            : undefined,
        title: typeof body.title === "string" ? body.title : undefined,
      },
      auth,
    );

    return NextResponse.json(serializeQr(qr, new URL(request.url).origin));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const auth = await requireUser({ redirectToLogin: false });
    const { slug } = await params;
    await deleteQr(slug, auth);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
