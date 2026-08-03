import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { endPlaybackSession } from "@/lib/playback-session";

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

  await endPlaybackSession(session.user.id, parsed.data.sessionToken);
  return NextResponse.json({ ok: true });
}
