import { NextResponse } from "next/server";
import { getPublicQrResult } from "@/src/lib/public-redirect";

const cacheHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
};

function brandedResponse(
  title: string,
  message: string,
  status: 404 | 410 | 500,
) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · QR Studio</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f1eee7;color:#111827;font:16px/1.5 Arial,sans-serif}.card{width:min(520px,calc(100% - 48px));border:1px solid #d8d0c1;border-top:6px solid #ffb000;background:#fffdf8;padding:32px;box-shadow:0 18px 48px rgba(30,24,16,.13)}p:first-child{color:#8a4f2d;font-size:12px;font-weight:800;letter-spacing:.2em;text-transform:uppercase}h1{margin:.35rem 0;font-size:clamp(2rem,8vw,4rem);line-height:.95}p:last-child{color:#687080}</style></head><body><main class="card"><p>QR Studio</p><h1>${title}</h1><p>${message}</p></main></body></html>`,
    {
      headers: {
        ...cacheHeaders,
        "Content-Type": "text/html; charset=utf-8",
      },
      status,
    },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  try {
    const headers = request.headers;
    const result = await getPublicQrResult({
      ipAddress: headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      referrer: headers.get("referer"),
      slug,
      userAgent: headers.get("user-agent"),
    });

    if (result.kind === "missing") {
      return brandedResponse(
        "Link not found",
        "This QR link does not exist or is no longer available.",
        404,
      );
    }
    if (result.kind === "disabled") {
      return brandedResponse(
        "Link unavailable",
        "The owner has temporarily disabled this QR link.",
        410,
      );
    }

    return NextResponse.redirect(result.destinationUrl, {
      headers: cacheHeaders,
      status: 302,
    });
  } catch (error) {
    console.error("Public QR lookup failed", error);
    return brandedResponse(
      "Link unavailable",
      "The QR service could not load this link. Please try again shortly.",
      500,
    );
  }
}
