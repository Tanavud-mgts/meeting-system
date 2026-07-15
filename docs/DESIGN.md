# Design Tokens — ระบบจองห้องประชุม

เอกสารสรุป design token (สี · spacing · typography) โทนใหม่: **ม่วงไวโอเลต × เทอร์คอย × เขียว บนพื้น lavender** สกัดจากหน้า Claude Design ชุดใหม่ (จองห้องประชุม + คำขอรออนุมัติ)
ไฟล์ที่เกี่ยวข้อง: `tokens/design-tokens.json` (W3C DTCG) · `tokens/tokens.css` (CSS variables) · `app/globals.css` (Tailwind `@theme` mapping + gradient utilities)

ฟอนต์หลัก: **Sarabun** (รองรับภาษาไทย, weight 300–800) · บุคลิก: สดใส มีมิติ ใช้ gradient และเงาโทนม่วง

---

## 1. สี (Color)

### Brand & Gradient
| Token | CSS variable | ค่า | การใช้งาน |
|---|---|---|---|
| brand.primary | `--color-brand-primary` | `#7c3aed` | สีหลัก · แถบ accent · ลิงก์เน้น · focus ring |
| brand.primary-strong | `--color-brand-primary-strong` | `#5b21b6` | ข้อความเน้นบนพื้นม่วงจาง |
| brand.deep | `--color-brand-deep` | `#4c1d95` | ม่วงลึก จุดเริ่ม gradient hero |
| brand.accent | `--color-brand-accent` | `#0891b2` | เทอร์คอย · ตัวเลขเน้น · ปลาย gradient |
| gradient.brand | `--gradient-brand` / class `.bg-grad-brand` | `linear-gradient(120deg,#7c3aed,#0891b2)` | ปุ่มหลัก · chip active · เมนู active |
| gradient.hero | `--gradient-hero` / class `.bg-grad-hero` | `linear-gradient(120deg,#4c1d95 0%,#7c3aed 38%,#0891b2 75%,#059669 100%)` | แบนเนอร์หัวหน้า (PageHero) |
| gradient.success | `--gradient-success` / class `.bg-grad-success` | `linear-gradient(120deg,#059669,#0891b2)` | ปุ่มอนุมัติ/ยืนยัน |
| gradient.danger | `--gradient-danger` / class `.bg-grad-danger` | `linear-gradient(120deg,#dc2626,#f59e0b)` | ปุ่มยืนยันการปฏิเสธ |
| gradient.page | `--gradient-page` / class `.bg-page-wash` | radial อุ่น+มิ้นต์ บน `#f2effa` | พื้นหลัง `<main>` |

### Neutral scale (lavender-tinted)
| Token | CSS variable | HEX |
|---|---|---|
| neutral.0 | `--color-neutral-0` | `#ffffff` |
| neutral.50 | `--color-neutral-50` | `#faf8ff` |
| neutral.100 | `--color-neutral-100` | `#f5f1fc` |
| neutral.150 | `--color-neutral-150` | `#f1eafb` |
| neutral.200 | `--color-neutral-200` | `#eee5fb` |
| neutral.300 | `--color-neutral-300` | `#e6ddfa` |
| neutral.400 | `--color-neutral-400` | `#c3b8dd` |
| neutral.500 | `--color-neutral-500` | `#8a80a3` |
| neutral.600 | `--color-neutral-600` | `#6b6480` |
| neutral.700 | `--color-neutral-700` | `#4a3f66` |
| neutral.900 | `--color-neutral-900` | `#20182f` |

### Surface & Text
| Token | CSS variable | ค่า | การใช้งาน |
|---|---|---|---|
| surface.page | `--color-surface-page` | `#f2effa` | พื้นหลังหน้า (ใช้ผ่าน `.bg-page-wash`) |
| surface.card | `--color-surface-card` | `#ffffff` | พื้นการ์ด |
| surface.sunken | `--color-surface-sunken` | `#faf7ff` | กล่องย่อยในการ์ด (approval chain) — ขอบใช้ `--color-border-sunken` `#ecdcff` |
| surface.field | `--color-surface-field` | `#faf8ff` | พื้นช่องกรอก / ดรอปดาวน์ (ตั้งอัตโนมัติใน globals.css) |
| text.primary | `--color-text-primary` | `#20182f` | ข้อความหลัก |
| text.secondary | `--color-text-secondary` | `#6b6480` | ข้อความรอง |
| text.muted | `--color-text-muted` | `#8a80a3` | label จาง |
| text.on-primary | `--color-text-on-primary` | `#ffffff` | ข้อความบนพื้น brand/gradient |
| text.on-hero-muted | `--color-text-on-hero-muted` | `#e9d9ff` | subtitle บน hero gradient |
| text.on-hero-gold | `--color-text-on-hero-gold` | `#fde68a` | ตัวเลข/คำเน้นบน hero gradient |

### Status (สีสถานะ — ต้องดูออกทันที)
| กลุ่ม | Token | CSS variable | HEX | การใช้งาน |
|---|---|---|---|---|
| **success / อนุมัติแล้ว** | success.solid | `--color-success-solid` | `#059669` | แถบ accent · จุดเริ่ม gradient success |
| | success.accent | `--color-success-accent` | `#10b981` | ขอบ / จุดสถานะ |
| | success.surface | `--color-success-surface` | `#d7f7e6` | พื้น badge |
| | success.text | `--color-success-text` | `#047857` | ข้อความบน surface |
| **warning / รออนุมัติ** | warning.accent | `--color-warning-accent` | `#f59e0b` | รอดำเนินการ · ขอบการ์ด urgent |
| | warning.surface | `--color-warning-surface` | `#fff1e6` | พื้น badge · ปุ่มปฏิเสธ (soft) |
| | warning.text | `--color-warning-text` | `#c2410c` | ข้อความบน surface |
| | warning.border | `--color-warning-border` | `#fbd9b8` | ขอบเตือน/ขอบปุ่มปฏิเสธ |
| **danger / ปฏิเสธ** | danger.solid | `--color-danger-solid` | `#dc2626` | สถานะปฏิเสธ · จุดเริ่ม gradient danger |
| | danger.surface | `--color-danger-surface` | `#fde8e8` | พื้น badge |
| | danger.text | `--color-danger-text` | `#dc2626` | ข้อความ / label |
| | danger.border | `--color-danger-border` | `#f3c1bb` | ขอบ |

### Accent เสริม + Tag อุปกรณ์
| Token | CSS variable | ค่า | การใช้งาน |
|---|---|---|---|
| accent.pink | `--color-accent-pink` | `#db2777` | สีประจำห้อง (ลำดับ 5) |
| tag.blue | `--color-tag-blue-surface` / `-text` | `#e8f0fb` / `#2054a8` | chip โปรเจกเตอร์ |
| tag.orange | `--color-tag-orange-surface` / `-text` | `#fdeee0` / `#b5652f` | chip ไวท์บอร์ด |
| tag.pink | `--color-tag-pink-surface` / `-text` | `#fce7f3` / `#a3175e` | chip ไมโครโฟน |

สีประจำห้อง (การ์ดผลค้นหา `/booking`) วนตามลำดับ: brand-primary → brand-accent → success-solid → warning-accent → accent-pink → brand-deep (ใช้กับแถบบนการ์ด 5px + ปุ่ม "เลือกห้องนี้")

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
| radius.sm | `--radius-sm` | `9px` | ปุ่ม · input |
| radius.md | `--radius-md` | `12px` | กล่องย่อย |
| radius.lg | `--radius-lg` | `16px` | การ์ด · dialog |
| radius.xl | `--radius-xl` | `20px` | การ์ดใหญ่ |
| radius.pill | `--radius-pill` | `999px` | badge · chip |

### Shadow (เงาโทนม่วงตาม brand)
| Token | CSS variable | ค่า |
|---|---|---|
| shadow.card | `--shadow-card` | `0 8px 22px rgba(76,29,149,.08)` |
| shadow.raised | `--shadow-raised` | `0 16px 40px rgba(76,29,149,.14)` |
| shadow.modal | `--shadow-modal` | `0 20px 50px rgba(0,0,0,.25)` |
| shadow.brand | `--shadow-brand` | `0 6px 16px rgba(124,58,237,.3)` — ปุ่ม/chip gradient ม่วง |
| shadow.success | `--shadow-success` | `0 8px 20px rgba(5,150,105,.32)` — ปุ่มอนุมัติ |

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
| extrabold | `--font-weight-extrabold` | `800` — หัวเรื่องหน้า/ปุ่มเน้น |

**Font size**
| Token | CSS variable | ค่า | การใช้งาน |
|---|---|---|---|
| size.xs | `--font-size-xs` | `11px` | badge · caption |
| size.sm | `--font-size-sm` | `13px` | label · meta |
| size.base | `--font-size-base` | `14.5px` | เนื้อความหลัก |
| size.md | `--font-size-md` | `15px` | ข้อความเน้น |
| size.lg | `--font-size-lg` | `17px` | หัวข้อ section |
| size.xl | `--font-size-xl` | `20px` | หัวข้อ dialog |
| size.2xl | `--font-size-2xl` | `25px` | หัวเรื่องรอง |
| size.3xl | `--font-size-3xl` | `28px` | หัวเรื่องหน้าใน hero (`text-3xl font-extrabold`) |

---

## 4. Component Patterns

### PageHero (แบนเนอร์หัวหน้า) — บังคับใช้ทุกหน้า
ทุกหน้าใน `(app)` ใช้ `<PageHero>` จาก `components/ui/PageHero.tsx` แทน `<h1>` ธรรมดา
แล้วตามด้วย container ที่ดึงการ์ดแรกขึ้นซ้อนแบนเนอร์:

```tsx
<div className="animate-fade-in-up pb-10">
  <PageHero title="ชื่อหน้า" subtitle="คำอธิบายสั้น" width="max-w-2xl" />
  <div className="relative mx-auto -mt-6 max-w-2xl px-6">
    {/* เนื้อหา — width ต้องตรงกับ prop ของ PageHero */}
  </div>
</div>
```

- แบนเนอร์: `.bg-grad-hero` + overlay `.hero-glow`
- หัวเรื่อง: `text-3xl font-extrabold` สีขาว · subtitle: `text-text-on-hero-muted`
- ตัวเลขเน้นใน subtitle: `text-text-on-hero-gold`

### SectionTitle (หัวข้อ section ในการ์ด)
```tsx
<SectionTitle>ค้นหาห้องว่าง</SectionTitle>
// = h2.text-lg.font-extrabold + <span className="section-bar" /> (แท่ง gradient 8×20px)
```

### Card (การ์ดมาตรฐาน)
```tsx
<Card>...</Card>                    // ขอบ #eee5fb, radius 16, เงาม่วงจาง
<Card accent="brand">...</Card>     // แถบ accent บน 5px (brand|warning|success|danger)
<Card className="border-l-4 border-l-brand-primary">  // แถบ accent ซ้าย (รายการคิว)
```
- การ์ด urgent (รอนานเกิน 2 ชม.): `border-warning-border border-l-warning-accent`

### Button (`components/ui/Button.tsx`)
| variant | ลักษณะ | ใช้กับ |
|---|---|---|
| `primary` | gradient ม่วง→เทอร์คอย + `shadow-brand` | ปุ่มหลักทั่วไป |
| `success` | gradient เขียว→เทอร์คอย + `shadow-success` | อนุมัติ / ยืนยันการจอง |
| `secondary` | ขาว ขอบ `neutral-300` (1.5px) | ยกเลิก / ปุ่มรอง |
| `danger` | พื้น `warning-surface` ตัวอักษร `warning-text` ขอบ `warning-border` | ปฏิเสธ (soft) |
| `dangerSolid` | gradient แดง→ส้ม | ยืนยันการปฏิเสธใน dialog |

### Badge / Status Chip
```css
/* รูปแบบ pill เสมอ — font-weight: bold */
.badge-success  { background: var(--color-success-surface); color: var(--color-success-text); }
.badge-warning  { background: var(--color-warning-surface); color: var(--color-warning-text); }
.badge-danger   { background: var(--color-danger-surface);  color: var(--color-danger-text);  }
.badge-neutral  { background: var(--color-neutral-150);     color: var(--color-text-secondary); }
```

### Filter chips (แถวกรองสถานะ)
- active: `.bg-grad-brand` ตัวอักษรขาว `font-bold` + `shadow-brand`
- inactive: พื้นขาว ขอบ `neutral-300` ตัวอักษร `neutral-700`
- ตัวนับใน chip: pill เล็ก `bg-neutral-150 text-brand-primary-strong` (active: `bg-white/20 text-white`)

### Approval Chain Step Indicator
- กล่อง: `bg-surface-sunken` ขอบ `border-sunken` radius 12
- step done: วงกลม `.bg-grad-brand` ✓ ขาว · เส้นเชื่อม `brand-primary`
- step current: พื้น `warning-surface` ขอบ/ตัวอักษร `warning-text`
- step wait: ขาว ขอบ `neutral-300` ตัวอักษร `neutral-400`

### Form Field
- พื้น `surface-field` ตั้งอัตโนมัติผ่าน globals.css (input/select/textarea)
- ขอบ `neutral-300` (1.5px) radius 9px
- focus: `outline 2px solid brand-primary` (ตั้งอัตโนมัติ)

### Dialog / Modal
- overlay: `rgba(18,40,42,.5)` + `backdrop-blur`
- กล่อง: radius 16 + `shadow-modal`
- dialog ยืนยัน: ไอคอนวงกลม gradient (✓ = `.bg-grad-success`, ✕ = `.bg-grad-danger`) + หัวข้อ `font-extrabold` กึ่งกลาง

### Empty state
```html
<div class="rounded-lg border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
  ไม่มีรายการในหมวดนี้
</div>
```

### AsyncBoundary — Loading Skeleton
```css
.skeleton {
  background: var(--color-neutral-150);
  border-radius: var(--radius-sm);
  animation: shimmer 1.4s infinite;
}
```

---

## 5. Mobile Responsive Strategy

breakpoint เดียวที่สำคัญคือ `768px` (md ของ Tailwind)

- Desktop ≥ 768px → Sidebar ซ้าย 200px (เมนู active = pill gradient ม่วง)
- Mobile < 768px → Bottom Navigation Bar 64px (active = `text-brand-primary font-bold`)
- Stat card: mobile 2 คอลัมน์ → desktop 4 คอลัมน์
- Table → Card list บนมือถือ (ซ่อน column รองด้วย `hidden md:table-cell`)
- ปุ่ม action บน mobile ≥ 44px

---

## 6. Page References (จาก Claude Design ชุดใหม่)

| หน้า | Route | สิ่งที่โดดเด่น |
|---|---|---|
| จองห้องประชุม | `/booking` | Hero gradient + การ์ดค้นหาซ้อนแบนเนอร์, ปุ่มยืนยัน gradient เขียว, การ์ดสำเร็จมี ✓ วงกลม gradient |
| คำขออนุมัติ | `/approver` | การ์ดคิวมีแถบซ้าย (urgent = เหลืองอำพัน), ป้าย "รอมาแล้ว X", dialog ยืนยันมีไอคอน gradient |
| ภาพรวมปฏิทิน | `/calendar` | Hero + toolbar การ์ดขาว, ปุ่มสลับมุมมอง active = gradient |

---

## 7. การใช้งานผ่าน Tailwind (v4 — mapping อยู่ใน `app/globals.css` แล้ว)

token ทั้งหมด map เป็น utility class ผ่าน `@theme inline` — **ห้าม hardcode สี/spacing/font ตรงๆ ในโค้ด**

```tsx
// ปุ่มอนุมัติ
<Button variant="success">อนุมัติ</Button>

// การ์ดมาตรฐาน + แถบ accent บน
<Card accent="brand">...</Card>

// Badge รอการอนุมัติ
<Badge tone="warning">รออนุมัติ</Badge>

// gradient utilities (กำหนดใน globals.css)
<div className="bg-grad-hero" />   // แบนเนอร์
<div className="bg-grad-brand" />  // ปุ่ม/chip/เมนู active
<span className="section-bar" />   // แท่งหน้าหัวข้อ section
```

---

## 8. Editorial Patterns (นำร่องหน้า /approver — 2026-07-15)

ทิศทางใหม่: **Editorial grid** — โครงสร้างมาจากเส้น hairline 1px และกริดที่ align กัน ไม่ใช่การ์ดโค้ง+เงา; gradient เหลือบทบาท accent (แถบ + ปุ่ม primary เดียว/หน้า + icon dialog). ค่าสี token เดิมไม่เปลี่ยน — เปลี่ยนแค่ *วิธีใช้*.

### Primitives ใหม่ (`components/ui/`)
| Component | ใช้ทำอะไร |
|---|---|
| `EditorialCard` (+ `.Section`) | การ์ดมุมเกือบเหลี่ยม (`rounded-[2px]`) ขอบ `border-neutral-300` ไม่มีเงา แบ่ง section ด้วย hairline; `accent` = แถบซ้าย 3px |
| `FieldTable` | ตาราง label/value 2 คอลัมน์ align กัน คั่น `border-neutral-150`; `mono` สำหรับ ref/เวลา |
| `StatusMarker` | swatch สี่เหลี่ยม 9px + ข้อความ (แทน pill ในบริบทตาราง); `Badge` pill ยังใช้ที่หัวข้อ/dialog |
| `PageHeader` | หัวหน้าเตี้ย: accent bar ม่วง + `h1` + เส้นล่าง ไม่มี gradient bg ไม่ overlap (`PageHero` เดิมยังใช้กับหน้าอื่น) |
| `Brand` | โลโก้คณะ (`public/logo-fms.svg`) + wordmark 2 ระดับ; `size="sm"` sidebar / `"lg"` หน้า public |

### นโยบายสี (Editorial)
- **ม่วง** = accent bar หัวข้อ + ปุ่ม primary เดียว/หน้า + เส้น chain done
- **สถานะ** = `StatusMarker` swatch เล็ก (ไม่ระบายพื้นใหญ่)
- **Filter chip active** = ขอบม่วง + พื้น `neutral-50` (เลิก `bg-grad-brand` เต็ม)
- **ที่เหลือ** = ขาว/lavender + hairline เทา

### Hairline conventions
- แบ่งแถวในตาราง: `border-neutral-150`
- เส้นแบ่ง section / rule ปกติ: `border-neutral-200`
- ขอบนอกการ์ด / rule เข้ม: `border-neutral-300`

### Typography — 3 roles
`h1` (`text-3xl font-extrabold`) · `SectionTitle`/หัว section (`text-lg font-extrabold` + accent bar) · body (`text-base`). **mono** (`font-mono`) เฉพาะ ref ID, วันเวลา, timestamp.

> สถานะ: นำร่องที่ `/approver` เท่านั้น — หน้าอื่นยังใช้ `PageHero`/`Card` เดิมจนกว่าจะยกเครื่องทีละหน้า
