import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { heartbeatPlaybackSession } from "@/lib/playback-session";

const schema = z.object({
  sessionToken: z.string().min(8),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await heartbeatPlaybackSession({
    userId: session.user.id,
    token: parsed.data.sessionToken,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: result.reason,
        error:
          result.reason === "SUPERSEDED"
            ? "มีการเปิดดูจากอุปกรณ์หรือแท็บอื่น — เซสชันนี้ถูกปิด"
            : "เซสชันไม่ถูกต้อง",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
