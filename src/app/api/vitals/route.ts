import { NextResponse } from "next/server";

// Records web-vitals beacons. Currently a no-op: the server logs the payload
// in non-production environments and returns 204. A future round can route
// this into a metrics sink.
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "production") {
    try {
      const body = await request.json();
      console.info("[vitals:api]", body);
    } catch {
      // swallow parse errors
    }
  }
  return new NextResponse(null, { status: 204 });
}

export const runtime = "nodejs";
