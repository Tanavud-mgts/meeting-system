# Design Tokens — ระบบจองห้องประชุม

เอกสารสรุป design token (สี · spacing · typography) ที่สกัดจากทั้ง 3 หน้า: หน้าจอง, ภาพรวมปฏิทิน และคำขออนุมัติ
ไฟล์ที่เกี่ยวข้อง: `tokens/design-tokens.json` (W3C DTCG) · `tokens/tokens.css` (CSS variables) · `Design Tokens.dc.html` (หน้าแสดงผล)

ฟอนต์หลัก: **Sarabun** (รองรับภาษาไทย) · โทนหลัก teal น้ำเงิน-เขียวสุภาพแบบราชการ

---

## 1. สี (Color)

### Brand
| Token | CSS variable | HEX | การใช้งาน |
|---|---|---|---|
| brand.primary | `--color-brand-primary` | `#15727d` | ปุ่มหลัก · แถบ active · ไฮไลต์ |
| brand.primary-strong | `--color-brand-primary-strong` | `#0e5a63` | พื้นหลังเข้ม · แถบสรุปห้องที่เลือก |
| brand.accent | `--color-brand-accent` | `#2a8a86` | eyebrow · ลิงก์ · ข้อความเน้น |

### Neutral scale
| Token | CSS variable | HEX |
|---|---|---|
| neutral.0 | `--color-neutral-0` | `#ffffff` |
| neutral.50 | `--color-neutral-50` | `#f6f9f9` |
| neutral.100 | `--color-neutral-100` | `#eef2f2` |
| neutral.150 | `--color-neutral-150` | `#e6eeee` |
| neutral.200 | `--color-neutral-200` | `#e0e8e8` |
| neutral.300 | `--color-neutral-300` | `#d3dede` |
| neutral.400 | `--color-neutral-400` | `#b6c2c2` |
| neutral.500 | `--color-neutral-500` | `#8a989a` |
| neutral.600 | `--color-neutral-600` | `#5c6b6d` |
| neutral.700 | `--color-neutral-700` | `#33474a` |
| neutral.900 | `--color-neutral-900` | `#1b2b2d` |

### Surface & Text
| Token | CSS variable | ค่า | การใช้งาน |
|---|---|---|---|
| surface.page | `--color-surface-page` | `#eef2f2` (neutral.100) | พื้นหลังหน้า |
| surface.card | `--color-surface-card` | `#ffffff` (neutral.0) | พื้นการ์ด |
| surface.sunken | `--color-surface-sunken` | `#f7fafa` | กล่องย่อยในการ์ด (approval chain) |
| surface.field | `--color-surface-field` | `#fbfdfd` | พื้นช่องกรอก / ดรอปดาวน์ |
| text.primary | `--color-text-primary` | `#1b2b2d` | ข้อความหลัก |
| text.secondary | `--color-text-secondary` | `#5c6b6d` | ข้อความรอง |
| text.muted | `--color-text-muted` | `#8a989a` | label จาง |
| text.on-primary | `--color-text-on-primary` | `#ffffff` | ข้อความบนพื้น brand |

### Status (สีสถานะ — ต้องดูออกทันที)
| กลุ่ม | Token | CSS variable | HEX | การใช้งาน |
|---|---|---|---|---|
| **success / อนุมัติแล้ว** | success.solid | `--color-success-solid` | `#1f9d57` | ปุ่มอนุมัติ |
| | success.accent | `--color-success-accent` | `#3f9e74` | ขอบ / จุดสถานะ |
| | success.surface | `--color-success-surface` | `#e4f3ea` | พื้น badge |
| | success.text | `--color-success-text` | `#1c6b4c` | ข้อความบน surface |
| **warning / รออนุมัติ** | warning.accent | `--color-warning-accent` | `#d9a93c` | รอดำเนินการ |
| | warning.surface | `--color-warning-surface` | `#fbf1da` | พื้น badge |
| | warning.text | `--color-warning-text` | `#876217` | ข้อความบน surface |
| | warning.border | `--color-warning-border` | `#f0d27a` | ขอบเตือนการ์ดที่รอนานเกินกำหนด |
| **danger / ปฏิเสธ** | danger.solid | `--color-danger-solid` | `#d24b3e` | ปุ่มยืนยันปฏิเสธ |
| | danger.surface | `--color-danger-surface` | `#fdecea` | พื้นปุ่มปฏิเสธ |
| | danger.text | `--color-danger-text` | `#c43d2f` | ข้อความ / label |
| | danger.border | `--color-danger-border` | `#f1c4bd` | ขอบ |

---

## 2. Spacing

Scale ฐาน 4px — ใช้กับ padding, gap, margin

| Token | CSS variable | ค่า |
|---|---|---|
| space.1 | `--space-1` | `4px` |
| space.2 | `--space-2` | `8px` |
| space.3 | `--space-3` | `12px` |
| space.4 | `--space-4` | `16px` |
| space.5 | `--space-5` | `20px` |
| space.6 | `--space-6` | `24px` |
| space.8 | `--space-8` | `32px` |

### Radius
| Token | CSS variable | ค่า | การใช้งาน |
|---|---|---|---|
| radius.sm | `--radius-sm` | `8px` | ปุ่มเล็ก · input |
| radius.md | `--radius-md` | `10px` | ปุ่ม · กล่องย่อย |
| radius.lg | `--radius-lg` | `14px` | การ์ด |
| radius.xl | `--radius-xl` | `16px` | dialog · การ์ดใหญ่ |
| radius.pill | `--radius-pill` | `999px` | badge · chip |

### Shadow
| Token | CSS variable | ค่า |
|---|---|---|
| shadow.card | `--shadow-card` | `0 3px 14px rgba(20,60,64,.05)` |
| shadow.raised | `--shadow-raised` | `0 4px 18px rgba(20,60,64,.06)` |
| shadow.modal | `--shadow-modal` | `0 20px 50px rgba(0,0,0,.25)` |

---

## 3. Typography

**Font family**
- base: `--font-family-base` → `'Sarabun', system-ui, sans-serif`
- mono: `--font-family-mono` → `ui-monospace, Menlo, monospace` (รหัสอ้างอิง)

**Font weight**
| Token | CSS variable | ค่า |
|---|---|---|
| light | `--font-weight-light` | `300` |
| regular | `--font-weight-regular` | `400` |
| medium | `--font-weight-medium` | `500` |
| semibold | `--font-weight-semibold` | `600` |
| bold | `--font-weight-bold` | `700` |

**Font size**
| Token | CSS variable | ค่า | การใช้งาน |
|---|---|---|---|
| size.xs | `--font-size-xs` | `11px` | badge · caption |
| size.sm | `--font-size-sm` | `13px` | label · meta |
| size.base | `--font-size-base` | `14.5px` | เนื้อความหลัก |
| size.md | `--font-size-md` | `15px` | ข้อความเน้น |
| size.lg | `--font-size-lg` | `17px` | หัวข้อ section |
| size.xl | `--font-size-xl` | `20px` | หัวข้อ dialog |
| size.2xl | `--font-size-2xl` | `25px` | หัวเรื่องหน้า |

---

## การใช้งาน

```html
<link rel="stylesheet" href="tokens/tokens.css">
```
```css
.card {
  background: var(--color-surface-card);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: var(--space-4);
  font-family: var(--font-family-base);
  color: var(--color-text-primary);
}
.btn-approve { background: var(--color-success-solid); color: var(--color-text-on-primary); }
.btn-reject  { background: var(--color-danger-surface); color: var(--color-danger-text); }
```

---

## 4. Component Patterns

### Card (การ์ดมาตรฐาน)
```css
.card {
  background:    var(--color-surface-card);
  border:        1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);          /* 14px */
  box-shadow:    var(--shadow-card);
  padding:       var(--space-5);             /* 20px */
}
/* hover */
.card:hover { box-shadow: var(--shadow-raised); }
```

### Card — Warning border (รอนานเกิน 2 ชม. ใน Approver Queue)
```css
.card-urgent {
  border-color: var(--color-warning-border);
  border-width: 1.5px;
}
```

### Button
```css
/* Primary (อนุมัติ / ยืนยัน) */
.btn-primary {
  background: var(--color-brand-primary);
  color:      var(--color-text-on-primary);
  border-radius: var(--radius-sm);          /* 8px */
  padding: var(--space-2) var(--space-4);   /* 8px 16px */
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-sm);
}
.btn-primary:hover { background: var(--color-brand-primary-strong); }

/* Approve (ปุ่มอนุมัติ — เขียว) */
.btn-approve {
  background: var(--color-success-solid);
  color:      var(--color-text-on-primary);
}

/* Reject (ปุ่มปฏิเสธ — แดงอ่อน) */
.btn-reject {
  background: var(--color-danger-surface);
  color:      var(--color-danger-text);
  border:     1px solid var(--color-danger-border);
}
.btn-reject:hover { background: var(--color-danger-solid); color: var(--color-text-on-primary); }

/* Ghost (secondary) */
.btn-ghost {
  background: transparent;
  color:      var(--color-text-secondary);
  border:     1px solid var(--color-neutral-300);
}
.btn-ghost:hover { background: var(--color-neutral-100); }
```

### Badge / Status Chip
```css
/* รูปแบบ pill เสมอ */
.badge {
  border-radius: var(--radius-pill);
  padding:       2px 10px;
  font-size:     var(--font-size-xs);       /* 11px */
  font-weight:   var(--font-weight-semibold);
}
.badge-success  { background: var(--color-success-surface); color: var(--color-success-text); }
.badge-warning  { background: var(--color-warning-surface); color: var(--color-warning-text); }
.badge-danger   { background: var(--color-danger-surface);  color: var(--color-danger-text);  }
.badge-neutral  { background: var(--color-neutral-150);     color: var(--color-text-secondary); }
```

### Approval Chain Step Indicator
```css
/* แสดงความคืบหน้าของ chain: Admin ✅ → Approver1 ✅ → Approver2 ⏳ */
.step-done   { color: var(--color-success-text);   }  /* ✅ */
.step-active { color: var(--color-warning-text);   }  /* ⏳ รอดำเนินการ */
.step-idle   { color: var(--color-text-muted);     }  /* — ยังไม่ถึง */
```

### Form Field
```css
.field {
  background:    var(--color-surface-field);
  border:        1px solid var(--color-neutral-300);
  border-radius: var(--radius-sm);
  padding:       var(--space-2) var(--space-3);    /* 8px 12px */
  font-size:     var(--font-size-base);            /* 14.5px */
  color:         var(--color-text-primary);
  font-family:   var(--font-family-base);
  width:         100%;
}
.field:focus {
  border-color: var(--color-brand-primary);
  outline:      none;
  box-shadow:   0 0 0 3px rgba(21,114,125,.12);
}
```

### Dialog / Modal
```css
.dialog-overlay {
  background: rgba(0,0,0,.45);
  backdrop-filter: blur(2px);
}
.dialog {
  background:    var(--color-surface-card);
  border-radius: var(--radius-xl);            /* 16px */
  box-shadow:    var(--shadow-modal);
  padding:       var(--space-6);              /* 24px */
  max-width:     480px;
  width:         100%;
}
```

### AsyncBoundary — Loading Skeleton
```css
.skeleton {
  background: var(--color-neutral-150);
  border-radius: var(--radius-sm);
  animation: shimmer 1.4s infinite;
}
@keyframes shimmer {
  0%   { opacity: 1; }
  50%  { opacity: .45; }
  100% { opacity: 1; }
}
```

---

## 5. Mobile Responsive Strategy

breakpoint เดียวที่สำคัญคือ `768px` (md ของ Tailwind)

```css
/* Mobile-first — เขียน mobile ก่อน override ด้วย md: prefix */

/* Navigation */
/* Desktop ≥ 768px → Top Navigation Bar */
/* Mobile < 768px  → Bottom Navigation Bar (ความสูง 64px) */
.nav-bottom { height: 64px; padding-bottom: env(safe-area-inset-bottom); }

/* Sidebar (Admin Dashboard) */
/* Desktop → sidebar ซ้ายมือกว้าง 200px */
/* Mobile  → ซ่อน เปิดด้วย hamburger เป็น drawer เต็มจอ */

/* Layout Grid */
/* Stat card: mobile 2 คอลัมน์ → desktop 4 คอลัมน์ */
.stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-3); }
@media (min-width: 768px) {
  .stat-grid { grid-template-columns: repeat(4, 1fr); gap: var(--space-4); }
}

/* Table → Card list บนมือถือ */
/* ซ่อน column รองด้วย hidden md:table-cell */

/* Calendar */
/* Mobile  → เริ่มที่ Day / Agenda view */
/* Desktop → Month grid */

/* ขนาดปุ่ม action บน mobile — ต้องแตะได้ง่าย */
.btn { min-height: 44px; }
```

---

## 6. Page References (จาก Claude Design)

หน้าที่ออกแบบ high-fidelity แล้ว — ใช้เป็น visual reference ตอนเขียน component

| หน้า | Route | สิ่งที่โดดเด่น |
|---|---|---|
| จองห้องประชุม | `/booking` | 2-step flow: ค้นหาห้องว่าง → กรอกรายละเอียด, Progress indicator, ห้องไม่ว่าง disabled จาง |
| ภาพรวมปฏิทิน | `/calendar` | FullCalendar 3 มุมมอง (วัน/สัปดาห์/เดือน), filter dropdown ตามห้อง, popup รายละเอียดเมื่อคลิก |
| คำขออนุมัติ | `/approver` | Card list พร้อม urgent border เหลือง, Step indicator ของ chain, Dialog confirm ก่อน action |

---

## 7. Tailwind Config สำหรับ Design Tokens

เพิ่มใน `tailwind.config.ts` เพื่อให้ใช้ CSS variable ผ่าน Tailwind utility class ได้:

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:        'var(--color-brand-primary)',
          'primary-strong':'var(--color-brand-primary-strong)',
          accent:         'var(--color-brand-accent)',
        },
        surface: {
          page:    'var(--color-surface-page)',
          card:    'var(--color-surface-card)',
          sunken:  'var(--color-surface-sunken)',
          field:   'var(--color-surface-field)',
        },
        text: {
          primary:    'var(--color-text-primary)',
          secondary:  'var(--color-text-secondary)',
          muted:      'var(--color-text-muted)',
          'on-primary': 'var(--color-text-on-primary)',
        },
        success: {
          solid:   'var(--color-success-solid)',
          accent:  'var(--color-success-accent)',
          surface: 'var(--color-success-surface)',
          text:    'var(--color-success-text)',
        },
        warning: {
          accent:  'var(--color-warning-accent)',
          surface: 'var(--color-warning-surface)',
          text:    'var(--color-warning-text)',
          border:  'var(--color-warning-border)',
        },
        danger: {
          solid:   'var(--color-danger-solid)',
          surface: 'var(--color-danger-surface)',
          text:    'var(--color-danger-text)',
          border:  'var(--color-danger-border)',
        },
      },
      borderRadius: {
        sm:   'var(--radius-sm)',   // 8px
        md:   'var(--radius-md)',   // 10px
        lg:   'var(--radius-lg)',   // 14px
        xl:   'var(--radius-xl)',   // 16px
        pill: 'var(--radius-pill)', // 999px
      },
      fontFamily: {
        sans: ['Sarabun', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs:   ['11px', { lineHeight: '1.4' }],
        sm:   ['13px', { lineHeight: '1.5' }],
        base: ['14.5px', { lineHeight: '1.6' }],
        md:   ['15px',   { lineHeight: '1.6' }],
        lg:   ['17px',   { lineHeight: '1.5' }],
        xl:   ['20px',   { lineHeight: '1.4' }],
        '2xl':['25px',   { lineHeight: '1.3' }],
      },
      boxShadow: {
        card:   'var(--shadow-card)',
        raised: 'var(--shadow-raised)',
        modal:  'var(--shadow-modal)',
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
      },
    },
  },
}
export default config
```

ตัวอย่างการใช้ผ่าน Tailwind:
```tsx
// ปุ่มอนุมัติ
<button className="bg-success-solid text-text-on-primary rounded-sm px-4 py-2 text-sm font-medium">
  อนุมัติ
</button>

// การ์ดมาตรฐาน
<div className="bg-surface-card border border-neutral-200 rounded-lg shadow-card p-5">
  ...
</div>

// Badge รอการอนุมัติ
<span className="bg-warning-surface text-warning-text rounded-pill px-2.5 py-0.5 text-xs font-semibold">
  รออนุมัติ
</span>
```
