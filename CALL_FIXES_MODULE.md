# CALL_FIXES_MODULE.md — Qo'ng'iroq jurnali, noma'lum raqamlar va sozlanadigan Kanban

> Bu modul Settings module TUGAGANDAN keyin beriladi. CLAUDE.md ning 5.4 (qo'ng'iroqlar) va 5.2 (Kanban) bo'limlarini takomillashtiradi.
>
> **MUHIM:** Brauzerdan ovoz bilan javob berish (WebRTC softphone) bu modulga KIRMAYDI — u alohida, kelajakda qilinadi. Hozir operator alohida telefon/dasturda gaplashadi; CRM qo'ng'iroqni AMI orqali QAYD QILADI va TAHLIL qiladi, lekin ovozni boshqarmaydi.

---

## MUAMMO 1 — Javobsiz qo'ng'iroqlar saqlanmayapti

**Talab:** HAR BIR qo'ng'iroq saqlanadi — javob berilgan (ANSWERED), javobsiz (MISSED), band (BUSY), muvaffaqiyatsiz (FAILED).

### Tuzatish
- AMI'da har qo'ng'iroq hodisasi (`Newchannel`, `DialBegin`, `DialEnd`, `Hangup`) kuzatiladi.
- **Call yozuvi qo'ng'iroq BOSHLANGANDA yaratiladi** (status=RINGING), tugaganda yakuniy holat bilan yangilanadi. Shunda javob berilmasa ham yozuv qoladi — bu asosiy tuzatish.
- Yakuniy holat `Hangup` cause yoki `DialStatus` bo'yicha aniqlanadi: ANSWERED / MISSED (NO ANSWER) / BUSY / FAILED.
- **Javobsiz (MISSED) qo'ng'iroq:**
  - Call jadvalida saqlanadi.
  - Avtomatik "qayta qo'ng'iroq qilish" Task yaratiladi, mas'ul operatorga (yoki navbatdagiga) biriktiriladi.
  - Kanban kartasida qizil "javobsiz" belgisi.
  - Dashboard'da "javobsiz qo'ng'iroqlar" KPI.
- **Filtr:** Kanban va qo'ng'iroqlar ro'yxatida "faqat javobsiz" filtri.
- Qo'ng'iroq yakunlangach, agar yozuv (recording) bo'lsa, audio STT/AI navbatiga yuboriladi (mavjud oqim).

---

## MUAMMO 2 — Noma'lum raqamlar

**Talab:** Bazada bo'lmagan raqamdan qo'ng'iroq kelsa, "Noma'lum" nomi bilan saqlanadi (yo'qotilmaydi).

### Tuzatish
- Kiruvchi qo'ng'iroqda raqam bo'yicha Contact qidiriladi.
- **Topilmasa:** Contact AVTOMATIK yaratiladi — `fullName = "Noma'lum"`, `phones = [kelgan raqam]`, `source = "inbound_call"`.
- Qo'ng'iroq shu kontaktga biriktiriladi; Kanban'da karta paydo bo'ladi (sozlamaga ko'ra: avtomatik karta yoki "unsorted").
- Operator keyin ismni tahrirlaydi ("Noma'lum" → haqiqiy ism).
- **Dublikat oldini olish:** bir xil noma'lum raqamdan qayta qo'ng'iroqda yangi kontakt yaratilmaydi, mavjudiga biriktiriladi.
- Shunday qilib hech bir qo'ng'iroq/raqam yo'qolmaydi.

---

## MUAMMO 3 — Sozlanadigan Kanban (joy/ustun yetarli emas)

**Talab:** Kanban ustunlari (bosqichlari) va voronkalarini tenant-admin o'zi qo'sha/o'zgartira oladi.

### 5.2.1. Kanban sozlash (Pipeline & Stage editor)
Settings → "Voronkalar (Pipelines)" sahifasi:
- **Voronka (Pipeline):** yaratish, nomini o'zgartirish, o'chirish, bir nechta voronka (Sotuv, Qo'llab-quvvatlash, Qayta qo'ng'iroq).
- **Bosqich (Stage/ustun)** har voronka ichida:
  - Ustun qo'shish (CHEKSIZ son — "joy yetarli emas" muammosini hal qiladi).
  - Nomini o'zgartirish, rang tanlash.
  - Tartibni drag-and-drop bilan o'zgartirish.
  - Ustun turi: NORMAL / WON (yutuq) / LOST (yo'qotish).
  - Ustunni o'chirish — ichidagi kartalar boshqa ustunga ko'chiriladi (ogohlantirish bilan), yo'qolmaydi.
- **Real vaqtda:** o'zgarish saqlangach Kanban darhol yangilanadi (Socket.io).
- **Migratsiya xavfsizligi:** ustun o'chirilsa/nomi o'zgarsa, mavjud kartalar yo'qolmaydi.

### 5.2.2. Kanban ko'rinishi (UX)
- Ko'p ustun bo'lsa gorizontal scroll.
- Ustun kengligini moslashtirish yoki kompakt rejim.
- Ustun sarlavhasida: kartalar soni va umumiy budjet.
- Ko'p karta bo'lganda kartalarni yig'ish (collapse).

---

## CLICK-TO-CALL (WebRTC'siz, AMI orqali)

Operator kartadan "Qo'ng'iroq qilish" bossa:
- **AMI Originate** ishlatiladi: FreePBX avval operatorning telefonini (extension) jiringlatadi, operator ko'targach mijoz raqamiga ulaydi.
- Ovoz operatorning alohida telefoni/dasturida bo'ladi (brauzerda emas).
- Qo'ng'iroq CRM'da OUTBOUND sifatida qayd qilinadi (yuqoridagi jurnal mantig'i bilan).
- Bu WebRTC talab qilmaydi — faqat AMI yetarli.

---

## XAVFSIZLIK VA SIFAT
- Multi-tenant: har tenant o'z Kanban, qo'ng'iroqlari, sozlamalarini ko'radi.
- Test: javobsiz qo'ng'iroq saqlanishini, noma'lum raqam "Noma'lum" bilan yaratilishini, ustun qo'shish/o'chirish kartalarni yo'qotmasligini tekshiruvchi testlar.

---

## CLAUDE CODE'GA QANDAY TUSHUNTIRASIZ

Settings module tugab, push bo'lgach:

### 1-qadam — kontekst
```
Settings module is done and pushed. Now read CALL_FIXES_MODULE.md fully. It fixes three things WITHOUT any browser voice/WebRTC: (1) missed/busy/failed calls must be saved — currently they are lost, (2) unknown numbers must be saved as a "Noma'lum" contact, (3) Kanban columns must be fully configurable. Click-to-call uses AMI Originate only (the operator talks on their separate phone, not the browser). There is NO softphone and NO WebRTC in this module. Confirm you understand, then do not code yet.
```

### 2-qadam — goal
```
/goal Call-log, unknown-number, and configurable-Kanban fixes complete per CALL_FIXES_MODULE.md, with NO WebRTC/softphone: (1) every call is saved including MISSED/BUSY/FAILED — the Call row is created when the call starts (RINGING) and updated with final status on hangup via AMI events; missed calls auto-create a callback Task and show a red badge on the Kanban card, with a "missed only" filter and a dashboard KPI. (2) inbound calls from unknown numbers auto-create a Contact named "Noma'lum" with the number and source "inbound_call", linked to the call, editable later, with no duplicate on repeat calls. (3) Kanban is fully configurable in Settings: tenant-admin can create/rename/delete pipelines and add/rename/recolor/reorder/delete stages (unlimited columns) with type NORMAL/WON/LOST; deleting a stage moves its cards elsewhere and never loses them; horizontal scroll, per-column count/budget, collapsible cards; changes reflect in real time via Socket.io. (4) click-to-call works via AMI Originate (rings the operator's extension first, then dials the customer) and is logged as OUTBOUND — no browser audio. `pnpm build` and `pnpm test` pass, including tests that missed calls are saved, unknown numbers become "Noma'lum", and adding/removing a stage preserves cards. Committed as "feat(call-log-unknown-kanban)" and pushed. PROGRESS.md updated. Stop after 80 turns if blocked.
```
