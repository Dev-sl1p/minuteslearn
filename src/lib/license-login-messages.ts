export function licenseLoginErrorMessage(error: string, message?: string) {
  const map: Record<string, string> = {
    EMPTY: "กรุณาใส่อีเมลและคีย์จากร้าน",
    USE_EXISTING_KEY: "หากมีบัญชีแล้ว ให้เข้าสู่ระบบด้วยคีย์เดิม แล้วเพิ่มคีย์ใหม่ที่หน้าใส่คีย์",
    RATE_LIMITED: "มีการลองเข้าสู่ระบบหลายครั้ง กรุณารอสักครู่แล้วลองใหม่",
    SERVICE_UNAVAILABLE: "ติดต่อระบบร้านค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    REVOKED: "คีย์นี้ถูกระงับแล้ว",
    BOUND_OTHER_EMAIL:
      "คีย์นี้ถูกผูกกับอีเมลอื่นแล้ว — ใช้อีเมลที่เข้าใช้ครั้งแรก",
    EMAIL_MISMATCH_ORDER: "อีเมลต้องตรงกับอีเมลตอนสั่งซื้อบนร้าน",
    INVALID_KEY: "คีย์ไม่ถูกต้องหรือหมดอายุ",
    ACTIVATION_LIMIT: "คีย์นี้ถูกเปิดใช้งานครบจำนวนแล้ว",
    NO_COURSE_MAPPING: "ยังไม่ได้ผูกสินค้าจากร้านกับคอร์ส — ติดต่อแอดมิน",
    WP_ACTIVATE_FAILED: message ?? "เปิดใช้งานคีย์บนระบบร้านไม่สำเร็จ",
    ALREADY_REDEEMED: "คีย์นี้ถูกใช้โดยบัญชีอื่นแล้ว",
    ALREADY_YOURS: "คีย์นี้ผูกกับบัญชีนี้แล้ว",
  };
  return map[error] ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบอีเมลและคีย์";
}
