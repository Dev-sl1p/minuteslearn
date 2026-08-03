export function licenseLoginErrorMessage(error: string, message?: string) {
  const map: Record<string, string> = {
    EMPTY: "กรุณาใส่อีเมลและ license key",
    REVOKED: "คีย์นี้ถูกระงับแล้ว",
    BOUND_OTHER_EMAIL:
      "คีย์นี้ถูกผูกกับอีเมลอื่นแล้ว — ใช้ email ที่เข้าใช้ครั้งแรก",
    EMAIL_MISMATCH_ORDER: "อีเมลต้องตรงกับอีเมลตอนสั่งซื้อบนร้าน",
    INVALID_KEY: "คีย์ไม่ถูกต้องหรือหมดอายุ",
    ACTIVATION_LIMIT: "คีย์นี้ถูก activate ครบจำนวนแล้ว",
    NO_COURSE_MAPPING: "ยังไม่ได้ผูกสินค้า Woo กับคอร์ส — ติดต่อแอดมิน",
    WP_ACTIVATE_FAILED: message ?? "เปิดใช้งานคีย์บน WordPress ไม่สำเร็จ",
    ALREADY_REDEEMED: "คีย์นี้ถูกใช้โดยบัญชีอื่นแล้ว",
    ALREADY_YOURS: "คีย์นี้ผูกกับบัญชีนี้แล้ว",
  };
  return map[error] ?? error;
}
