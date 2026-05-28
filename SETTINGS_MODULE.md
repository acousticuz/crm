# SETTINGS_MODULE.md — Sozlamalar va integratsiyalar bo'limi

> Bu CLAUDE.md ga qo'shimcha modul spetsifikatsiyasi. Claude Code'ga beriladigan yangi milestone. CLAUDE.md ning 5-bo'limiga "5.11 — Sozlamalar va integratsiyalar" sifatida qo'shing yoki alohida bering.

---

## MAQSAD

Super-admin va tenant-admin uchun **Sozlamalar (Settings)** bo'limi. Bu yerda har bir kompaniya o'z integratsiyalarini ulaydi: FreePBX, SMS xizmati, Telegram bot, Omnichannel inbox (Instagram/Facebook). Har integratsiya: ulash → test qilish → holatni ko'rish → uzish.

---

## 5.11.1. Sozlamalar tuzilishi (kim nimani sozlaydi)

**Super-admin (platforma darajasi):**
- Tenantlarni boshqarish (yaratish, faollashtirish, to'xtatish)
- Default STT va LLM provayderlari (platforma bo'yicha)
- Tizim limitlari (har tenant uchun: maks. foydalanuvchi, maks. qo'ng'iroq/oy)
- Billing/tarif (kelajak uchun joy qoldiriladi)

**Tenant-admin (kompaniya darajasi) — bu asosiy qism:**
- Profil: kompaniya nomi, til, filiallar
- Foydalanuvchilar va rollar (allaqachon M1 da bor — shu yerga link)
- **Integratsiyalar** (quyida batafsil)
- QA skriptlari, pipeline/teglar (allaqachon boshqa modullarda — shu yerga link)

---

## 5.11.2. Integratsiyalar bo'limi (Tenant-admin)

Frontend: chap menyuda "Sozlamalar" → "Integratsiyalar" sahifasi. Har integratsiya alohida karta sifatida ko'rinadi: nom, holat belgisi (ulangan ✓ / ulanmagan / xato), "Sozlash" tugmasi. Bosilganda forma ochiladi.

Har integratsiya uchun umumiy naqsh (pattern):
- **Forma:** ulanish maydonlari (host, token, kalit va h.k.)
- **"Tekshirish" (Test) tugmasi:** ma'lumotlarni saqlamasdan ulanishni sinab ko'radi, natija (muvaffaqiyat/xato) ko'rsatadi.
- **"Saqlash" tugmasi:** sozlamani saqlaydi (sirlar shifrlangan holda — quyida).
- **Holat ko'rsatkichi:** oxirgi tekshiruv natijasi va vaqti.
- **"Uzish" tugmasi:** integratsiyani o'chiradi (ma'lumotni emas, ulanishni).

### A. FreePBX (telefoniya)
Maydonlar: AMI host (IP), AMI port (default 5038), AMI username, AMI secret, CDR ulanish (DB yoki API), yozuv fayllar manbasi (papka yo'li / FTP / URL).
- Test: AMI ga ulanib, `CoreStatus` so'rovini yuboradi, javob kelsa muvaffaqiyat.
- Saqlangach: telephony-worker shu tenant uchun ulanishni boshlaydi.

### B. SMS xizmati
Maydonlar: provayder tanlovi (Eskiz.uz / Play Mobile), API kaliti / login+parol (provayderga qarab), yuboruvchi nomi (sender/nickname).
- Test: provayder API'siga balans yoki auth so'rovini yuboradi.
- Saqlangach: SMS modul (M5) shu sozlamani ishlatadi.

### C. Telegram bot
Maydonlar: bot token (BotFather'dan), webhook URL (avtomatik yoki qo'lda), maqsad (supervayzer bildirishnomalari / mijoz xabarlari).
- Test: `getMe` so'rovini yuborib bot ma'lumotini oladi.
- Saqlangach: webhook o'rnatiladi; triggerlar Telegram orqali bildirishnoma yubora oladi.

### D. Omnichannel inbox (Instagram / Facebook)
Maydonlar: Facebook Page / Instagram Business hisob ulanishi (OAuth orqali — quyidagi xavfsizlik qoidasiga qara), Page access token, webhook tasdiqlash.
- **Muhim:** Akkaunt ulash OAuth orqali — foydalanuvchi o'zi Facebook'da ruxsat beradi. Tizim parol so'ramaydi.
- Test: ulangan sahifa ma'lumotini oladi (sahifa nomi, ID).
- Saqlangach: DM va comment'lar inbox'ga keladi (M10).

---

## 5.11.3. XAVFSIZLIK QOIDALARI (majburiy)

1. **Sirlarni shifrlash:** AMI secret, API kalit, bot token, access token — bazaga **shifrlangan** holda saqlanadi (masalan, AES-256-GCM, kalit `.env` dagi `ENCRYPTION_KEY` dan). Hech qachon ochiq matnda saqlanmaydi.
2. **Frontendga sirlar qaytarilmaydi:** sozlama o'qilganda, sirlar maskalanadi (masalan, `••••••1234` — faqat oxirgi 4 belgi). To'liq sir hech qachon API javobida qaytarilmaydi.
3. **Faqat tenant-admin:** integratsiya sozlamalariga faqat TENANT_ADMIN (va o'z tenant'i uchun) kira oladi. RBAC guard bilan majburlanadi.
4. **Audit:** har integratsiya o'zgarishi AuditLog ga yoziladi (kim, qachon, qaysi integratsiya — sirlarsiz).
5. **Multi-tenant:** har tenant faqat o'z integratsiyalarini ko'radi va o'zgartiradi.
6. **OAuth (Inbox/Telegram):** akkaunt ulash OAuth/token orqali. Tizim hech qachon foydalanuvchi parolini so'ramaydi yoki saqlamaydi.
7. **Test natijasi sirlarni oshkor qilmaydi:** test xatosi umumiy bo'lsin ("ulanish muvaffaqiyatsiz"), ichki sir/token chiqmasin.

---

## 5.11.4. Ma'lumotlar modeli qo'shimchasi

Yangi entiti:
- **Integration** — tenantId, type(enum: FREEPBX | SMS | TELEGRAM | INBOX), provider?, config(Json — sirlar shifrlangan), status(enum: CONNECTED | DISCONNECTED | ERROR), lastTestedAt, lastTestResult(Json)

Eslatma: `config` ichidagi sirlar ilova darajasida shifrlanadi (Prisma'ga yozishdan oldin), o'qishda deshifrlanadi (faqat backend ichida ishlatish uchun, frontendga maskalangan holda).

---

## CLAUDE CODE UCHUN /goal BUYRUG'I

Avval kontekstni o'qitish uchun:
```
Read SETTINGS_MODULE.md fully. This adds a Settings + Integrations module to the existing project. Confirm you understand the structure (super-admin vs tenant-admin), the four integrations (FreePBX, SMS, Telegram bot, Omnichannel inbox), and especially the security rules in 5.11.3. Do not code yet.
```

So'ng goal:
```
/goal Settings + Integrations module complete per SETTINGS_MODULE.md: a Settings section with super-admin (tenant management, default STT/LLM providers, system limits) and tenant-admin areas; an Integrations page where tenant-admin connects FreePBX (AMI host/port/user/secret + CDR + recordings source), SMS (Eskiz/Play with API key + sender), Telegram bot (token + webhook), and Omnichannel inbox (Instagram/Facebook via OAuth); each integration has Test, Save, status indicator, and Disconnect; an Integration entity stores config with secrets encrypted (AES-256-GCM via ENCRYPTION_KEY); secrets are never returned to frontend (masked, last 4 chars only); only TENANT_ADMIN can access, enforced by RBAC; every change is audit-logged without secrets; each integration's Test verifies connection (FreePBX CoreStatus, SMS balance/auth, Telegram getMe, inbox page info). `pnpm build` and `pnpm test` pass, including a test proving secrets are encrypted at rest and masked in API responses. Committed as "feat(settings-integrations)" and pushed. PROGRESS.md updated. Stop after 70 turns if blocked.
```
