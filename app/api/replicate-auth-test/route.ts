import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Diagnostic endpoint: checks only Replicate authentication, never runs a model.
// Keep it unavailable on Production deployments.
export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json(
      { configured: false, authenticated: false, result: "MISSING_TOKEN" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const response = await fetch("https://api.replicate.com/v1/account", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (response.ok) {
      return NextResponse.json(
        { configured: true, authenticated: true, result: "AUTHENTICATED", replicateStatus: response.status },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        configured: true,
        authenticated: false,
        result: response.status === 401 ? "INVALID_TOKEN" : "REPLICATE_REJECTED_REQUEST",
        replicateStatus: response.status,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { configured: true, authenticated: false, result: "CONNECTION_ERROR" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
