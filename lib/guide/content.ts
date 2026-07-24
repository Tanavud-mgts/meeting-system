export type GuideModule = "user" | "approver" | "admin";

export type GuideStep = {
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
};

export type GuideSection = {
  id: string;
  title: string;
  steps: GuideStep[];
};

export type GuideModuleContent = {
  module: GuideModule;
  label: string;
  sections: GuideSection[];
  showApprovalChain: boolean;
};

// ลำดับสิทธิ์แบบสะสม: role หนึ่งเห็นโมดูลของตนและโมดูลที่มีสิทธิ์ต่ำกว่าทั้งหมด
const MODULE_ORDER: GuideModule[] = ["user", "approver", "admin"];

export function modulesForRole(role: string): GuideModule[] {
  const idx = MODULE_ORDER.indexOf(role as GuideModule);
  if (idx === -1) return ["user"];
  return MODULE_ORDER.slice(0, idx + 1);
}

export const GUIDE_CONTENT: GuideModuleContent[] = [
  {
    module: "user",
    label: "ผู้ใช้ทั่วไป",
    showApprovalChain: true,
    sections: [
      {
        id: "user-booking",
        title: "จองห้องประชุม",
        steps: [
          {
            title: "ค้นหาห้องว่าง",
            description:
              "เลือกวันและช่วงเวลาที่ต้องการ ระบบจะแสดงเฉพาะห้องที่ว่างในช่วงเวลานั้น",
            href: "/booking",
            linkLabel: "ไปหน้าจองห้อง",
          },
          {
            title: "กรอกรายละเอียดและส่งคำขอ",
            description:
              "ระบุหัวข้อการประชุม จำนวนผู้เข้าร่วม และอุปกรณ์ที่ต้องใช้ จากนั้นส่งคำขอจอง",
            href: "/booking",
            linkLabel: "ไปหน้าจองห้อง",
          },
          {
            title: "รอการอนุมัติ",
            description:
              "คำขอจะมีสถานะ \"รออนุมัติ\" และเข้าสู่สายอนุมัติของระบบ ดูเส้นทางการอนุมัติได้จากแผนภาพด้านล่าง",
          },
        ],
      },
      {
        id: "user-manage",
        title: "ติดตามและจัดการการจอง",
        steps: [
          {
            title: "ดูการจองของฉัน",
            description: "ตรวจสอบสถานะคำขอทั้งหมดของคุณได้ในหน้าการจองของฉัน",
            href: "/profile/bookings",
            linkLabel: "ไปหน้าการจองของฉัน",
          },
          {
            title: "ดูปฏิทินภาพรวม",
            description: "ดูตารางการใช้ห้องประชุมทั้งหมดในรูปแบบปฏิทิน วัน/สัปดาห์/เดือน",
            href: "/calendar",
            linkLabel: "ไปหน้าปฏิทิน",
          },
          {
            title: "ยกเลิกการจองที่รออนุมัติ",
            description:
              "การจองที่ยังเป็น \"รออนุมัติ\" สามารถยกเลิกได้ทันทีด้วยตนเอง",
            href: "/profile/bookings",
            linkLabel: "ไปหน้าการจองของฉัน",
          },
          {
            title: "ขอยกเลิกการจองที่อนุมัติแล้ว",
            description:
              "หากการจองอนุมัติแล้ว ต้องส่งคำขอยกเลิกพร้อมกรอกเหตุผล แล้วรอผู้ดูแลระบบพิจารณา",
            href: "/profile/bookings",
            linkLabel: "ไปหน้าการจองของฉัน",
          },
        ],
      },
      {
        id: "user-line",
        title: "เชื่อมต่อ LINE (ไม่บังคับ)",
        steps: [
          {
            title: "เชื่อมบัญชี LINE เพื่อรับการแจ้งเตือน",
            description:
              "เพิ่มเพื่อน LINE OA แล้วขอรหัส OTP ในหน้าโปรไฟล์ จากนั้นพิมพ์คำสั่งเชื่อมบัญชีในแชท LINE เพื่อรับการแจ้งเตือน (เป็นช่องทางเสริม ทุกฟีเจอร์ใช้งานบนเว็บได้ครบโดยไม่ต้องเชื่อม LINE)",
            href: "/profile",
            linkLabel: "ไปหน้าโปรไฟล์",
          },
        ],
      },
      {
        id: "user-welpru",
        title: "รับการแจ้งเตือนผ่านแอป WeLPRU (ไม่บังคับ)",
        steps: [
          {
            title: "กรอกรหัสบุคลากรในโปรไฟล์",
            description:
              "กรอกและบันทึกรหัสบุคลากรในหน้าโปรไฟล์ก่อน เพราะระบบใช้รหัสนี้ในการส่งการแจ้งเตือนผ่านแอป WeLPRU",
            href: "/profile",
            linkLabel: "ไปหน้าโปรไฟล์",
          },
          {
            title: "ยอมรับเงื่อนไขและขอยืนยันตัวตน",
            description:
              "ในหน้าโปรไฟล์ ให้ติ๊กยอมรับการรับแจ้งเตือน แล้วกดปุ่ม \"ยืนยันการรับแจ้งเตือนผ่าน WeLPRU\" ระบบจะส่งข้อความทดสอบไปยังแอป WeLPRU ของท่าน",
            href: "/profile",
            linkLabel: "ไปหน้าโปรไฟล์",
          },
          {
            title: "แตะลิงก์ยืนยันในแอป WeLPRU",
            description:
              "เปิดข้อความในแอป WeLPRU แล้วแตะลิงก์เพื่อยืนยันว่าเป็นเจ้าของบัญชีจริง เมื่อสำเร็จ หน้าโปรไฟล์จะแสดงสถานะ \"ยืนยันแล้ว\" อัตโนมัติ",
          },
        ],
      },
    ],
  },
  {
    module: "approver",
    label: "ผู้อนุมัติ",
    showApprovalChain: true,
    sections: [
      {
        id: "approver-review",
        title: "พิจารณาคำขอจอง",
        steps: [
          {
            title: "เปิดคิวคำขอรออนุมัติ",
            description:
              "ดูคำขอที่รอการพิจารณาในขั้นตอนของคุณ ระบบจะเน้นคำขอที่รอนานเป็นพิเศษ",
            href: "/approver",
            linkLabel: "ไปหน้ารออนุมัติ",
          },
          {
            title: "อนุมัติหรือปฏิเสธ",
            description:
              "ตรวจสอบรายละเอียดแล้วเลือกอนุมัติเพื่อส่งต่อขั้นถัดไป หรือปฏิเสธเพื่อจบคำขอทันที (การปฏิเสธที่ขั้นใดก็ตามจะจบสายอนุมัติทันที)",
            href: "/approver",
            linkLabel: "ไปหน้ารออนุมัติ",
          },
        ],
      },
      {
        id: "approver-cancel",
        title: "พิจารณาคำขอยกเลิก",
        steps: [
          {
            title: "พิจารณาคำขอยกเลิกจากผู้ใช้",
            description:
              "อนุมัติหรือปฏิเสธคำขอยกเลิกการจองที่ผ่านการอนุมัติแล้ว",
            href: "/approver/cancel-requests",
            linkLabel: "ไปหน้าคำขอยกเลิก",
          },
        ],
      },
      {
        id: "approver-report",
        title: "รายงานและประวัติ",
        steps: [
          {
            title: "ดูรายงานและสถิติ",
            description:
              "ดูสถิติการใช้ห้องและรายงานได้เหมือนผู้ดูแลระบบ (ไม่จำกัดตามหน่วยงาน)",
            href: "/dashboard/reports",
            linkLabel: "ไปหน้ารายงาน",
          },
          {
            title: "ดูประวัติการทำงานของฉัน",
            description: "ตรวจสอบประวัติการอนุมัติและปฏิเสธของตนเอง",
            href: "/approver/history",
            linkLabel: "ไปหน้าประวัติ",
          },
        ],
      },
    ],
  },
  {
    module: "admin",
    label: "ผู้ดูแลระบบ",
    showApprovalChain: false,
    sections: [
      {
        id: "admin-setup",
        title: "การตั้งค่าระบบ",
        steps: [
          {
            title: "จัดการห้องประชุม",
            description: "เพิ่ม แก้ไข หรือลบห้องประชุมและอุปกรณ์ประจำห้อง",
            href: "/dashboard/rooms",
            linkLabel: "ไปหน้าจัดการห้อง",
          },
          {
            title: "จัดการผู้ใช้และสิทธิ์",
            description: "กำหนดบทบาท (role) และหน่วยงานให้ผู้ใช้แต่ละคน",
            href: "/dashboard/users",
            linkLabel: "ไปหน้าจัดการผู้ใช้",
          },
          {
            title: "ตั้งค่าสายอนุมัติ เวลาทำการ และวันหยุด",
            description:
              "กำหนดผู้อนุมัติในแต่ละขั้น เวลาเปิด-ปิดทำการ และวันหยุดของระบบ",
            href: "/dashboard/settings",
            linkLabel: "ไปหน้าตั้งค่า",
          },
        ],
      },
      {
        id: "admin-approval",
        title: "การอนุมัติและการจัดการการจอง",
        steps: [
          {
            title: "เป็นผู้อนุมัติขั้นแรก",
            description:
              "ทุกคำขอจองจะผ่านผู้ดูแลระบบเป็นด่านแรกของสายอนุมัติเสมอ",
            href: "/approver",
            linkLabel: "ไปหน้ารออนุมัติ",
          },
          {
            title: "ยกเลิกการจองใดๆ ได้ทันที",
            description:
              "ผู้ดูแลระบบยกเลิกการจองได้ทุกสถานะโดยไม่ต้องขออนุมัติ แต่ต้องกรอกเหตุผล",
            href: "/dashboard/bookings",
            linkLabel: "ไปหน้าการจองทั้งหมด",
          },
          {
            title: "ดูการจองทั้งหมดในระบบ",
            description: "ตรวจสอบรายการจองทั้งหมดของทุกผู้ใช้",
            href: "/dashboard/bookings",
            linkLabel: "ไปหน้าการจองทั้งหมด",
          },
        ],
      },
      {
        id: "admin-data",
        title: "รายงาน ข้อมูล และการตรวจสอบ",
        steps: [
          {
            title: "ดูภาพรวมระบบ",
            description: "ดูสถิติและภาพรวมการใช้งานทั้งระบบ",
            href: "/dashboard",
            linkLabel: "ไปหน้าภาพรวม",
          },
          {
            title: "Export ข้อมูลและตั้งค่าการเก็บข้อมูล",
            description:
              "ส่งออกข้อมูลเป็น Excel และตั้งค่าระยะเวลาการเก็บ log (retention)",
            href: "/dashboard/data",
            linkLabel: "ไปหน้าจัดการข้อมูล",
          },
          {
            title: "ตรวจสอบสถานะการเชื่อมต่อ",
            description:
              "ดู Integration Health ของ Make.com, LINE และโควตาการใช้งาน",
            href: "/dashboard/integrations",
            linkLabel: "ไปหน้า Integration",
          },
          {
            title: "ดูประวัติการทำงานรวมของทุกคน",
            description: "ตรวจสอบประวัติกิจกรรมของผู้ใช้ทุกคนในระบบ",
            href: "/dashboard/activity",
            linkLabel: "ไปหน้าประวัติรวม",
          },
        ],
      },
    ],
  },
];
