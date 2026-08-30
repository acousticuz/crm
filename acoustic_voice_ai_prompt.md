# ACOUSTIC VOICE AI — TO'LIQ PROMPT
# Claude Code uchun | FreePBX/Asterisk + Node.js + Google STT/TTS + Claude API
# Fayl: acoustic_voice_ai_prompt.md

---

## TIZIM MAQSADI

Acoustic eshitish markazlari uchun AI telefon assistant.
Mijoz qo'ng'iroq qilganda — xodim band yoki ish vaqti tugagan bo'lsa —
tabiiy, jonli suhbat olib boruvchi AI javob beradi.

Mijoz robot bilan gaplashayotganini his qilmasligi kerak.
Suhbat O'zbek tilida (rus tilini ham tushunadi).
Ovoz: ayol, tabiiy, issiq.

---

## TEXNIK ARXITEKTURA

```
Telefon qo'ng'iroqi
        ↓
FreePBX (mavjud server)
  - Ish vaqti tekshiruvi (Time Conditions)
  - Xodim band tekshiruvi (Queue)
  - Shart bajarilsa → AGI script ga yo'naltirish
        ↓
Node.js AGI Service (asterisk-agi npm)
  - Asterisk bilan real vaqt aloqa
  - Audio stream boshqaruvi
        ↓
Google Cloud Speech-to-Text
  - Model: telephony (8kHz, telefon sifatiga mos)
  - Til: uz-UZ (asosiy), ru-RU (fallback)
  - Streaming recognition (real vaqt)
        ↓
Claude API (claude-opus-4-5)
  - System prompt: suhbat qoidalari va skript
  - Conversation history: suhbat davomida saqlanadi
  - Qaror: CRM ga yoz / xodimga ulat / tugatish
        ↓
Google Cloud Text-to-Speech
  - Ovoz: uz-UZ-Wavenet-A (ayol, tabiiy)
  - Fallback: ru-RU-Wavenet-C (ayol)
  - Audio: LINEAR16, 8000Hz (telefon uchun)
        ↓
acoustic_db (PostgreSQL)
  - client_orders (branch_id = -2, Call Center)
  - clients jadvaliga telefon raqam tekshiruvi
        ↓
Telegram Bot
  - Xodimga xabar: suhbat xulosasi + CRM havolasi
```

---

## LOYIHA STRUKTURASI

```
acoustic-voice-ai/
  src/
    agi/
      agi-server.ts          ← Asterisk AGI server (TCP)
      call-handler.ts        ← Har bir qo'ng'iroq uchun handler
    stt/
      google-stt.service.ts  ← Speech-to-Text (streaming)
    tts/
      google-tts.service.ts  ← Text-to-Speech (cache bilan)
    ai/
      claude-agent.service.ts ← Claude API suhbat
      system-prompt.ts        ← AI qoidalari (bu faylni e'tibor bering!)
    crm/
      acoustic-crm.service.ts ← acoustic_db ga yozish
    telegram/
      notifier.service.ts     ← Xodimga xabar
    config/
      business-hours.ts       ← Ish vaqti sozlamalari
  audio/
    hold-music.wav            ← Kutish musiqasi
    greeting-uz.mp3           ← Oldindan yozilgan salomlashish
  .env
  package.json
```

---

## QISM 1: AI AGENT SYSTEM PROMPT

Bu eng muhim qism. Claude shu qoidalar asosida gaplashadi.

```typescript
// src/ai/system-prompt.ts

export const SYSTEM_PROMPT = `
Sen Acoustic eshitish markazlarining telefon yordamchisisisan.
Ism: Muxlisa
Kompaniya: Acoustic — Eshitish markazlari tarmog'i.

═══════════════════════════════════════════════════
ASOSIY QOIDALAR (bularni hech qachon buzma)
═══════════════════════════════════════════════════

1. TABIIY GAPIR
   — Robot kabi emas, xuddi do'stona, malakali xodim kabi
   — Qisqa gaplar. Telefonda uzoq gapirma.
   — Bir savolda bitta narsa so'ra
   — Mijoz nima desa — avval tushunganingni bildir

2. TIL
   — O'zbek tilida boshlaysan
   — Agar mijoz rus tilida gapirsа — o'sha tilga o'tasan
   — Tilni suhbat davomida o'zgartirma

3. SEN KIM EKANING
   — "Men Acoustic ning telefon yordamchisiman" — shu yetarli
   — "Siz robot bilang apmi?" desa: "Men Acoustic yordamchisiman,
     sizga yordam berishim mumkin" — to'g'ridan javob berma, e'tibor qaytар
   — O'zingni AI yoki robot deb atama

4. MAQSAD — HAQIQIY MIJOZNI ANIQLA
   Haqiqiy mijoz = eshitish muammosi bor yoki yaqinida bor odam.
   Tekshirish uchun:
   — "Nima muammo bilan murojaat qilyapsiz?" dan boshlа
   — Javobni tahlil qil:
     ✅ Eshitish muammosi → davom et
     ✅ Apparat ta'mirlatish → davom et
     ✅ Tekshiruv o'tkazmoqchi → davom et
     ✅ Yaqini uchun → davom et
     ❌ Noto'g'ri raqam → xushmuomalalik bilan tushuntir
     ❌ Reklama/sotish → rad et, tugatish

5. SUHBAT BOSQICHLARI (tartibda)
   a) Salomlashish
   b) Murojaat sababini aniqla
   c) Haqiqiy mijoz ekanini his qil
   d) Qaysi shahar/filial ekanini aniqla
   e) Qulay vaqtni aniqla
   f) Telefon raqamni olish (agar noma'lum bo'lsa)
   g) Xulosa ayt va tasdiqlat
   h) Xayrlash

6. FILIALLAR (faqat shu filiallarni ayt)
   Toshkent: Sebzor, Yakkasaroy, Yunusobod, Chilonzor, Mirzo Ulug'bek
   Farg'ona viloyati: Farg'ona, Andijon, Namangan, Qo'qon
   Samarqand viloyati: Samarqand
   Buxoro viloyati: Buxoro
   Qashqadaryo: Qarshi
   Surxondaryo: Termiz
   Navoiy: Navoiy
   Xorazm: Urganch
   Qoraqalpog'iston: Nukus

7. VAQT VA NAVBAT
   Ish vaqti: Dushanba-Shanba, 9:00-18:00
   Yakshanba: dam olish
   Navbat: "Ertalab soat 9 dan boshlab xodimimiz siz bilan bog'lanadi"
   — Aniq vaqt va'da qilma (ish jadvali to'liq noma'lum)
   — Faqat "ertaga birinchi qo'ng'iroqlar orasida" de

8. NIMA DEMA
   ❌ "Sizni navbatga qo'ydim" — bu yolg'on, CRM ga yoziladi lekin
      xodim tasdiqlashi kerak
   ✅ "Ma'lumotlaringizni yozib qo'ydim, xodimimiz ertaga bog'lanadi"
   ❌ Narx aytma — "Bu savol bo'yicha xodimimiz to'liq ma'lumot beradi"
   ❌ Diagnoz qo'yma — faqat: "Tekshiruv o'tkazish kerak"
   ❌ "Sizning muammoingiz..." — mijoz o'zi aytmagan narsani taxmin qilma

9. QIYIN HOLATLAR
   Jahli chiqqan mijoz:
   → "Tushunaman, bu noqulay holat. Xodimimiz tezda siz bilan bog'lanadi."
   
   "Doktor kerak" desa:
   → "Bizda audiolog mutaxassislarimiz bor, ular tekshiruv o'tkazadi."
   
   "Qancha turadi?" desa:
   → "Narx tekshiruv natijasiga qarab belgilanadi. Mutaxassisimiz avval
     eshitish darajangizni baholaydi, keyin sizga mos variantlarni ko'rsatadi.
     Aniq sharoitlar filialda muhokama qilinadi."

   "Bepul ekanmi?" / "Pul to'lash kerakmi?" desa:
   → "Tashrifda mutaxassisimiz eshitish darajangizni baholaydi va variantlarni
     ko'rsatadi. Aniq sharoitlar filialda muhokama qilinadi — sizga to'g'ri
     keladigan yo'lni o'sha yerda tanlaysiz."
   ⚠ "Bepul" so'zini hech qachon va'da qilmang — keyinchalik narx
     muzokarasida muammoga aylanadi.
   
   "Kechqurun keling" deb so'rasa:
   → "Ish vaqtimiz soat 18:00 gacha. [Filial]ga soat 17:00 ga yozib
     qo'yishim mumkin."

10. SUHBATNI TUGATISH
    — Har doim ijobiy tugat
    — "Xodimimiz [sana] soat 9 dan boshlab bog'lanadi"
    — "Sog'-salomat bo'ling!"
    — Tugatish signali: JSON {"action": "end", "summary": "..."}

═══════════════════════════════════════════════════
CHIQISH FORMATI (har javobda)
═══════════════════════════════════════════════════

Har javobni quyidagi JSON formatida qaytar:

{
  "speak": "Mijozga aytadigan gap (tabiiy, qisqa)",
  "action": "continue | collect_info | save_to_crm | transfer | end",
  "collected": {
    "phone": "998901234567 yoki null",
    "city": "Toshkent yoki null",
    "branch_id": "9 yoki null",
    "issue": "eshitish muammosi tavsifi yoki null",
    "preferred_time": "ertaga ertalab yoki null",
    "is_existing_client": true/false/null,
    "language": "uz | ru"
  },
  "confidence": "real_client | maybe | not_client",
  "notes": "Xodim uchun izoh (mijoz ko'rmaydi)"
}

ACTION qiymatlari:
- continue: suhbat davom etadi
- collect_info: ma'lumot yig'ilmoqda
- save_to_crm: yetarli ma'lumot yig'ildi, CRM ga yoz
- transfer: ish vaqtida bo'lsa xodimga ulat
- end: suhbatni tugatish
`;
```

---

## QISM 2: SUHBAT MISOLLARI (few-shot)

```typescript
// src/ai/conversation-examples.ts
// Bu misollar Claude ga qo'shimcha o'rgatish uchun

export const EXAMPLES = [

// ─── MISOL 1: Oddiy navbat ───────────────────────────────
{
  user: "Salom, eshitish tekshiruvi qilib berarmikansizlar",
  assistant: {
    speak: "Salom! Albatta, tekshiruv o'tkazib beramiz. Qaysi shaharda yashaysiz?",
    action: "collect_info",
    collected: { issue: "eshitish tekshiruvi", language: "uz" },
    confidence: "real_client"
  }
},
{
  user: "Toshkentda",
  assistant: {
    speak: "Yaxshi. Toshkentda bir nechta filialimiz bor — Sebzor, Yunusobod, Chilonzor. Qaysi tomon qulay?",
    action: "collect_info",
    collected: { city: "Toshkent" },
    confidence: "real_client"
  }
},

// ─── MISOL 2: Jahli chiqqan mijoz ───────────────────────
{
  user: "Nega hech kim ko'tarmaydi telefonni, yarim soatdan beri kutayapman",
  assistant: {
    speak: "Uzr, bu noqulay holat. Tushunaman. Hozir ma'lumotingizni olib qo'yay, xodimimiz tezda qayta bog'lanadi. Ismingiz kim?",
    action: "collect_info",
    confidence: "real_client",
    notes: "Mijoz uzoq kutgan, tez bog'lanish kerak"
  }
},

// ─── MISOL 3: Noto'g'ri raqam ────────────────────────────
{
  user: "Allo, bu Hamidov akaning raqamimi?",
  assistant: {
    speak: "Yo'q, bu Acoustic eshitish markazi. Siz noto'g'ri raqamga terib qolgan ko'rinasiz.",
    action: "end",
    confidence: "not_client"
  }
},

// ─── MISOL 4: Ruscha gapiradi ────────────────────────────
{
  user: "Здравствуйте, я хотел бы записаться на проверку слуха",
  assistant: {
    speak: "Здравствуйте! Конечно, запишем вас на проверку. В каком городе вы находитесь?",
    action: "collect_info",
    collected: { issue: "проверка слуха", language: "ru" },
    confidence: "real_client"
  }
},

// ─── MISOL 5: Narx so'raydi ──────────────────────────────
{
  user: "Eshitish apparati qancha turadi sizlarda",
  assistant: {
    speak: "Narx apparatning turiga qarab farq qiladi. Avval mutaxassisimiz eshitish darajangizni baholaydi va sizga mos variantlarni ko'rsatadi. Qaysi shaharda yashaysiz?",
    action: "collect_info",
    confidence: "real_client"
  }
},

// ─── MISOL 6: Ta'mirlash ─────────────────────────────────
{
  user: "Mening apparatim ishlamay qoldi, ta'mirlatmoqchiman",
  assistant: {
    speak: "Tushunarli. Qaysi filialdan olgan edingiz apparatni?",
    action: "collect_info",
    collected: { issue: "apparat ta'mirlash", is_existing_client: true },
    confidence: "real_client"
  }
}
];
```

---

## QISM 3: AGI SERVER (Node.js)

```typescript
// src/agi/agi-server.ts

import { AgiServer, AgiRequest, AgiResponse } from 'asterisk-agi';
import { CallHandler } from './call-handler';

const server = new AgiServer({ port: 4573, host: '0.0.0.0' });

server.on('connection', (channel: AgiRequest, response: AgiResponse) => {
  const handler = new CallHandler(channel, response);
  handler.handle().catch(err => {
    console.error('Call handler error:', err);
    response.hangup();
  });
});

server.listen(() => {
  console.log('AGI Server listening on port 4573');
});
```

```typescript
// src/agi/call-handler.ts

export class CallHandler {
  private conversation: Message[] = [];
  private collectedData: CollectedData = {};
  private callerPhone: string;

  async handle() {
    // 1. Caller ID olish
    this.callerPhone = await this.response.getVariable('CALLERID(num)');

    // 2. Mavjud mijozni tekshirish (acoustic_db)
    const existingClient = await this.crmService.findByPhone(this.callerPhone);

    // 3. Salomlashish ovozini ijro etish
    await this.playGreeting(existingClient);

    // 4. Asosiy suhbat tsikli
    while (true) {
      // Mijoz gapini tingla
      const userSpeech = await this.listenToUser();
      if (!userSpeech) continue;

      // Claude ga yuborish
      const aiResponse = await this.claudeAgent.respond(
        this.conversation,
        userSpeech,
        { existingClient, callerPhone: this.callerPhone }
      );

      // Javobni aytish
      await this.speak(aiResponse.speak);

      // Action tekshirish
      if (aiResponse.action === 'save_to_crm') {
        await this.saveTocrm(aiResponse.collected, aiResponse.notes);
        await this.speak(this.getConfirmationText(aiResponse.collected));
        aiResponse.action = 'end';
      }

      if (aiResponse.action === 'transfer') {
        await this.transferToAgent();
        break;
      }

      if (aiResponse.action === 'end') {
        await this.hangup();
        break;
      }

      // Suhbat tarixiga qo'shish
      this.conversation.push(
        { role: 'user', content: userSpeech },
        { role: 'assistant', content: JSON.stringify(aiResponse) }
      );
    }

    // 5. Telegram xodimga xabar
    await this.notifier.sendCallSummary({
      phone: this.callerPhone,
      duration: this.getCallDuration(),
      collected: this.collectedData,
      conversation: this.conversation,
    });
  }

  private async listenToUser(): Promise<string | null> {
    // Audio record (3 sekund silence = tugatish)
    const audioFile = await this.recordAudio({ maxSilence: 3, maxDuration: 30 });

    // Google STT
    const transcript = await this.sttService.transcribe(audioFile, {
      primaryLanguage: 'uz-UZ',
      fallbackLanguage: 'ru-RU',
    });

    return transcript?.text || null;
  }

  private async speak(text: string) {
    // Google TTS → audio fayl
    const audioFile = await this.ttsService.synthesize(text, {
      voice: 'uz-UZ-Wavenet-A',  // Ayol ovozi, O'zbek
      speed: 0.95,                // Biroz sekinroq — tabiiyroq
    });

    // Asterisk orqali ijro etish
    await this.response.streamFile(audioFile);
  }

  private async saveTocrm(data: CollectedData, notes: string) {
    // acoustic_db ga yozish
    // Branch_id = -2 (Call Center)
    await this.crmService.createCallCenterOrder({
      phone: this.callerPhone,
      branchId: data.branch_id || -2,
      description: `AI suhbat: ${data.issue}. ${notes}`,
      operDay: new Date(),
    });

    this.collectedData = data;
  }
}
```

---

## QISM 4: STT SERVICE

```typescript
// src/stt/google-stt.service.ts

import { SpeechClient } from '@google-cloud/speech';

@Injectable()
export class GoogleSttService {
  private client = new SpeechClient();

  async transcribe(
    audioBuffer: Buffer,
    options: { primaryLanguage: string; fallbackLanguage: string }
  ): Promise<{ text: string; language: string; confidence: number } | null> {

    const request = {
      audio: { content: audioBuffer.toString('base64') },
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 8000,          // Telefon sifati
        languageCode: options.primaryLanguage,
        alternativeLanguageCodes: [options.fallbackLanguage],
        model: 'phone_call',             // Telefon uchun optimallashtirilgan
        useEnhanced: true,
        enableAutomaticPunctuation: true,
      },
    };

    const [response] = await this.client.recognize(request);
    const result = response.results?.[0];

    if (!result?.alternatives?.[0]) return null;

    return {
      text: result.alternatives[0].transcript,
      language: result.languageCode || options.primaryLanguage,
      confidence: result.alternatives[0].confidence || 0,
    };
  }
}
```

---

## QISM 5: TTS SERVICE

```typescript
// src/tts/google-tts.service.ts

import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class GoogleTtsService {
  private client = new TextToSpeechClient();
  private cacheDir = '/tmp/tts-cache';

  // O'zbek ayol ovozi (eng tabiiy)
  // uz-UZ-Wavenet-A — Google ning O'zbek Wavenet ovozi
  private VOICES = {
    'uz': 'uz-UZ-Wavenet-A',
    'ru': 'ru-RU-Wavenet-C',   // Ayol ovozi, rus
  };

  async synthesize(
    text: string,
    options: { voice?: string; speed?: number; language?: string }
  ): Promise<string> {
    // Cache tekshirish (bir xil matnni qayta yaratmaslik)
    const cacheKey = crypto.createHash('md5')
      .update(text + (options.voice || '') + (options.speed || 1))
      .digest('hex');
    const cachePath = path.join(this.cacheDir, `${cacheKey}.wav`);

    if (fs.existsSync(cachePath)) return cachePath;

    const lang = options.language || 'uz';
    const voiceName = options.voice || this.VOICES[lang] || this.VOICES['uz'];

    const [response] = await this.client.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode: lang === 'uz' ? 'uz-UZ' : 'ru-RU',
        name: voiceName,
        ssmlGender: 'FEMALE',
      },
      audioConfig: {
        audioEncoding: 'LINEAR16',
        sampleRateHertz: 8000,       // Asterisk uchun
        speakingRate: options.speed || 0.95,
        pitch: 0,                     // Tabiiy ohang
        effectsProfileId: ['telephony-class-application'],
      },
    });

    fs.writeFileSync(cachePath, response.audioContent as Buffer);
    return cachePath;
  }
}
```

---

## QISM 6: CRM SERVICE

```typescript
// src/crm/acoustic-crm.service.ts
// acoustic_db ga yozish — faqat Call Center buyurtma

@Injectable()
export class AcousticCrmService {
  constructor(private prisma: PrismaService) {}

  async findByPhone(phone: string) {
    // Mavjud mijozni tekshirish (faqat o'qish)
    const normalized = this.normalizePhone(phone);
    return this.prisma.clients.findFirst({
      where: { phone_number: { contains: normalized } },
    });
  }

  async createCallCenterOrder(data: {
    phone: string;
    branchId: number;
    description: string;
    operDay: Date;
    preferredBranchId?: number;
  }) {
    // 1. Mijozni topish yoki vaqtinchalik ID
    const client = await this.findByPhone(data.phone);

    // 2. Call Center buyurtma yaratish (branch_id = -2)
    return this.prisma.client_orders.create({
      data: {
        branch_id: -2,                    // Call Center
        client_id: client?.id || -2,      // Topilmasa anonim
        state_id: 0,                      // Draft
        order_mode: 0,                    // Oddiy buyurtma
        description: data.description,
        oper_day: data.operDay,
        // Yo'naltirilgan filial eslatmasi
        notify_info: data.preferredBranchId
          ? `Kerakli filial: ${data.preferredBranchId}`
          : null,
      },
    });
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '').slice(-9); // Oxirgi 9 raqam
  }
}
```

---

## QISM 7: TELEGRAM NOTIFIER

```typescript
// src/telegram/notifier.service.ts

@Injectable()
export class NotifierService {
  async sendCallSummary(data: CallSummary) {
    const { phone, duration, collected, conversation } = data;

    const message = `
📞 *Yangi qo'ng'iroq — AI suhbat*
⏱ Davomiyligi: ${duration} soniya
📱 Raqam: +${phone}

👤 *Mijoz ma'lumoti:*
• Muammo: ${collected.issue || 'aniqlanmadi'}
• Shahar: ${collected.city || 'aniqlanmadi'}
• Filial: ${collected.branch_name || 'aniqlanmadi'}
• Qulay vaqt: ${collected.preferred_time || 'aniqlanmadi'}
• Til: ${collected.language === 'ru' ? 'Rus' : "O'zbek"}
• Holat: ${this.getConfidenceLabel(collected.confidence)}

📝 *Xodim uchun izoh:*
${collected.notes || '—'}

🕐 ${new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}
`;

    // Tegishli filial xodimiga yuborish
    const chatId = await this.getBranchChatId(collected.branch_id);
    if (chatId) {
      await this.bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
      });
    }

    // Umumiy Call Center guruhiga ham
    if (process.env.TELEGRAM_CC_GROUP_ID) {
      await this.bot.telegram.sendMessage(
        process.env.TELEGRAM_CC_GROUP_ID,
        message,
        { parse_mode: 'Markdown' }
      );
    }
  }
}
```

---

## QISM 8: FreePBX SOZLAMALARI

FreePBX admin panelida quyidagi sozlamalar:

```
1. Time Conditions (Ish vaqti)
   Ish vaqti: Du-Sha 09:00-18:00
   → Ish vaqtida: Queue (xodimlar liniyasi)
   → Ish vaqtidan tashqari: AGI Script

2. Queue sozlamasi (xodim band bo'lganda)
   Agent timeout: 20 sekund
   → Javob bo'lmasa: AGI Script

3. AGI Extension (extensions_custom.conf):
   [acoustic-ai-ivr]
   exten => s,1,AGI(agi://127.0.0.1:4573)
   exten => s,2,Hangup()

4. Inbound Route:
   DID: [Acoustic telefon raqami]
   → Time Condition: acoustic-business-hours
```

---

## ENVIRONMENT VARIABLES

```env
# Google Cloud
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
GOOGLE_PROJECT_ID=acoustic-voice-ai

# Claude API (mavjud)
ANTHROPIC_API_KEY=

# acoustic_db (READ ONLY)
DATABASE_URL=postgresql://analytics_ro:password@localhost:5432/acoustic_db

# Telegram (mavjud)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CC_GROUP_ID=        # Call Center guruhi

# AGI Server
AGI_PORT=4573
AGI_HOST=0.0.0.0

# Audio
TTS_CACHE_DIR=/tmp/tts-cache
AUDIO_DIR=/var/lib/asterisk/sounds/acoustic

# Ish vaqti (Asia/Tashkent)
BUSINESS_HOURS_START=9
BUSINESS_HOURS_END=18
BUSINESS_DAYS=1,2,3,4,5,6   # Du(1) - Sha(6), Yak(0) dam olish
```

---

## MUHIM QOIDALAR

```
1. acoustic_db — READ ONLY (faqat client_orders YOZISH mumkin,
   bu Call Center buyurtma, bu allaqachon tizimning bir qismi)
2. Suhbat tarixini serverda saqlama — faqat xotirada (xavfsizlik)
3. Telefon raqamlarni loglarda yashir (GDPR/PDPL)
4. TTS cache — bir xil gaplarni qayta yaratmaslik (tezlik + xarajat)
5. STT confidence < 0.6 bo'lsa — qayta so'rash: "Kechirasiz, tushunmadim"
6. 30 soniyadan ortiq suhbat bo'lmasa — muammo bor, Telegram xabar
7. Xodim band holatda transfer: faqat ish vaqtida va agent mavjud bo'lsa
```

---

## ISHLAB CHIQISH KETMA-KETLIGI

```
1. Google Cloud proekt yaratish + Speech/TTS API yoqish
2. Service account + credentials.json
3. Node.js loyiha: npm init, zarur paketlar
4. TTS service — oddiy matnni ovozga aylantirib sinash
5. STT service — audio faylni matnga aylantirib sinash
6. Claude agent — system prompt bilan suhbat sinash (telefonsiz)
7. AGI server — FreePBX ga ulash, oddiy "salom" deyishi
8. Call handler — STT + Claude + TTS birlashtirish
9. CRM service — acoustic_db ga yozish
10. Telegram notifier — xodimga xabar
11. FreePBX Time Conditions sozlash
12. To'liq sinash: real telefon raqamidan qo'ng'iroq

NPM PAKETLAR:
npm install asterisk-agi @google-cloud/speech @google-cloud/text-to-speech
npm install @anthropic-ai/sdk prisma telegraf
npm install @nestjs/core @nestjs/common reflect-metadata
```
