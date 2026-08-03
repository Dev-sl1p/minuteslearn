# MinutesLearn — Video Course + License Redeem

เว็บเรียนวิดีโอแยกจากร้าน WooCommerce ([minutessharing.com](https://minutessharing.com/))  
ลูกค้าซื้อสินค้า → ได้ license key → สมัคร/ล็อกอินที่นี่ → redeem ผูกบัญชี → เรียน

## Features

- เข้าเรียนด้วย **อีเมล + license key** (ไม่ต้องสมัคร/รหัสผ่านแยก)
- ครั้งแรกที่สำเร็จ = ผูกคีย์กับอีเมลถาวร; ครั้งถัดไปใช้คู่เดิม
- Redeem คีย์เพิ่มเมื่อล็อกอินแล้ว (ซื้อหลายคอร์ส)
- Admin แยกด้วยรหัสผ่านที่ `/admin/login`
- Entitlements ต่อคอร์ส
- จำกัดอุปกรณ์ (`MAX_DEVICES`)
- เซสชันดูวิดีโอเดียวต่อบัญชี (heartbeat)
- Signed / short-lived playback URL (Mux / Cloudflare Stream / mock HLS)
- Forensic watermark + pause เมื่อแท็บไม่โฟกัส
- Admin: ผูก Woo SKU ↔ คอร์ส, เพิ่มบท, ระงับ license

## Quick start (Supabase Postgres)

1. สร้างโปรเจกต์ที่ [supabase.com](https://supabase.com) → **Project Settings → Database**
2. คัดลอก connection strings:
   - **Transaction pooler** (port `6543`) → `DATABASE_URL`
   - **Session / Direct** (port `5432`) → `DIRECT_URL`
3. คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่าจริง (รหัสผ่าน URL-encode ถ้ามีอักขระพิเศษ)
4. รัน:

```bash
npm install
npx prisma db push
npm run db:seed
npm run dev
```

หรือใช้ migrate:

```bash
npx prisma migrate dev --name init_supabase
npm run db:seed
```

บน **Vercel** ใส่ `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL` ใน Environment Variables

เปิด [http://localhost:3000](http://localhost:3000)

### ทดสอบ learner

1. ไป `/login`
2. ใส่อีเมลอะไรก็ได้ + `DEMO-COURSE-001` (ครั้งแรกจะผูก)
3. ครั้งถัดไปต้องใช้อีเมลเดิม + คีย์เดิม

### Admin

- `/admin/login` → `admin@minutessharing.com` / `password123`

### Demo license keys (mock mode)

- `DEMO-COURSE-001` → คอร์ส game-tilt
- `DEMO-COURSE-002` → Template Davinci

## WordPress live mode

1. ติดตั้ง **License Manager for WooCommerce** บน minutessharing.com
2. สร้าง REST API keys ในปลั๊กอิน
3. ตั้งค่าใน `.env`:

```env
WP_LICENSE_MODE=live
WP_BASE_URL=https://minutessharing.com
WP_LM_CONSUMER_KEY=ck_xxx
WP_LM_CONSUMER_SECRET=cs_xxx
```

4. ใน Admin ของ MinutesLearn ใส่ `wooSku` / `wooProductId` ให้ตรงกับสินค้าที่ออกคีย์

## Video providers

```env
VIDEO_PROVIDER=mock   # หรือ mux | cloudflare
```

ใส่ `streamAssetId` ของแต่ละบทให้ตรงกับ Mux playback ID หรือ Cloudflare Stream uid

## Scripts

- `npm run dev` — development
- `npm run build` / `npm start` — production
- `npm run db:seed` — seed demo data
- `npx prisma studio` — ดูฐานข้อมูล
