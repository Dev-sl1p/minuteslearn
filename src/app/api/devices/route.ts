import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { listDevices, maxDevices, registerDevice, revokeDevice } from "@/lib/devices";

const registerSchema = z.object({
  fingerprint: z.string().min(8).max(128),
  label: z.string().max(80).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const devices = await listDevices(session.user.id);
  return NextResponse.json({
    devices,
    maxDevices: maxDevices(),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const result = await registerDevice({
    userId: session.user.id,
    fingerprint: parsed.data.fingerprint,
    label: parsed.data.label,
  });

  if (!result.ok) {
    if (result.error === "DEVICE_LIMIT") {
      return NextResponse.json(
        {
          error: `เต็มจำนวนอุปกรณ์แล้ว (สูงสุด ${maxDevices()} เครื่อง) — ปลดเครื่องเก่าก่อน`,
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "อุปกรณ์นี้ถูกระงับการใช้งาน" },
      { status: 403 },
    );
  }

  return NextResponse.json({ device: result.device });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("id");
  if (!deviceId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const device = await revokeDevice(session.user.id, deviceId);
  if (!device) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, device });
}
