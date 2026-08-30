/**
 * Acoustic eshitish markazi — filial direktoriyasi.
 *
 * Manba: https://acoustic.uz/branches (21 ta filial).
 *
 * Bu modul Inbox shablon javoblari uchun mijozga aytiladigan haqiqiy filial
 * ma'lumotlarini saqlaydi: manzil, telefon, Yandex.Maps havolasi. CRM ichidagi
 * Branch DB jadvali bilan bog'lanmagan — operatorlar mijozga aytadigan
 * to'g'ri matn shu yerda yashaydi.
 *
 * Yangilash: filial qo'shilsa yoki manzil o'zgarsa, faqat shu fayl tahrir
 * qilinadi. Hech qaerda hardcoded "filiallarimiz: ..." yo'q.
 */

export interface AcousticBranch {
  /** Mijoz uchun ko'rinadigan qisqa nom (chip / button label uchun). */
  shortName: string;
  /** Mijoz xabarida ko'rinadigan to'liq nom (masalan, "Chilonzor filialimiz"). */
  displayName: string;
  /** Shahar — Toshkent filiallarini viloyatlardan ajratish uchun. */
  city: string;
  region: "tashkent" | "region";
  /** To'liq ko'cha manzili. */
  address: string;
  /** E.164 formatdagi telefon raqamlar (raqamlar va +). */
  phones: string[];
  /** Yandex.Maps qidiruv URL'i — matn orqali aniqlanadi, koordinata talab
   *  qilinmaydi. Brauzer/ilova manzilni ochadi. */
  mapUrl: string;
}

/** "+998712884444" → "+998 71 288 44 44" — Inbox xabarida o'qish uchun. */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("998") && digits.length === 12) {
    const c = "+998";
    return `${c} ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
  }
  return raw;
}

/** Yandex.Maps text-search URL — koordinata bo'lmasa ham ishlaydi. */
function yandexUrl(address: string): string {
  return `https://yandex.uz/maps/?text=${encodeURIComponent(address)}`;
}

/** All 21 branches from acoustic.uz/branches. */
export const ACOUSTIC_BRANCHES: AcousticBranch[] = [
  // ── Toshkent (11 ta) ────────────────────────────────────────────────
  {
    shortName: "Chilonzor",
    displayName: "Chilonzor filialimiz",
    city: "Toshkent",
    region: "tashkent",
    address: "Chilonzor 7-mavze, 45-uy, 3-xonadon, Toshkent",
    phones: ["+998712884444", "+998909205271"],
    mapUrl: yandexUrl("Acoustic Chilonzor 7-45-3 Toshkent"),
  },
  {
    shortName: "Yunusobod",
    displayName: "Yunusobod filialimiz",
    city: "Toshkent",
    region: "tashkent",
    address: "Yunusobod 2-mavze, 6-uy, Toshkent",
    phones: ["+998945904114"],
    mapUrl: yandexUrl("Acoustic Yunusobod 2-mavze 6 Toshkent"),
  },
  {
    shortName: "Sebzor",
    displayName: "Sebzor filialimiz",
    city: "Toshkent",
    region: "tashkent",
    address: "Sebzor 35V, Olmazor tumani, Toshkent",
    phones: ["+998771514114"],
    mapUrl: yandexUrl("Acoustic Sebzor 35V Olmazor Toshkent"),
  },
  {
    shortName: "Yakkasaroy",
    displayName: "Yakkasaroy filialimiz",
    city: "Toshkent",
    region: "tashkent",
    address: "Yusuf Xos Hojib ko'chasi, 72-uy, Yakkasaroy tumani, Toshkent",
    phones: ["+998712156850"],
    mapUrl: yandexUrl("Acoustic Yusuf Xos Hojib 72 Yakkasaroy Toshkent"),
  },
  {
    shortName: "Toshmi",
    displayName: "Toshmi filialimiz",
    city: "Toshkent",
    region: "tashkent",
    address: "Farobiy ko'chasi, 35-uy, Shayhontohur tumani, Toshkent",
    phones: ["+998998804114"],
    mapUrl: yandexUrl("Acoustic Farobiy 35 Shayhontohur Toshkent"),
  },
  {
    shortName: "Sergeli",
    displayName: "Sergeli filialimiz",
    city: "Toshkent",
    region: "tashkent",
    address: "Sergeli 8-mavze, Shokirariq ko'chasi, Sergeli tumani, Toshkent",
    phones: ["+998903224114"],
    mapUrl: yandexUrl("Acoustic Sergeli 8-mavze Shokirariq Toshkent"),
  },
  {
    shortName: "Qo'yliq",
    displayName: "Qo'yliq filialimiz",
    city: "Toshkent",
    region: "tashkent",
    address: "Farg'ona yo'li, Qo'yliq Center 10B, Yashnobod tumani, Toshkent",
    phones: ["+998903934114"],
    mapUrl: yandexUrl("Acoustic Qo'yliq Center 10B Yashnobod Toshkent"),
  },

  // ── Viloyatlar (14 ta) ──────────────────────────────────────────────
  {
    shortName: "Guliston",
    displayName: "Guliston filialimiz",
    city: "Sirdaryo",
    region: "region",
    address: "Birlashgan ko'chasi, 6B-uy, Guliston shahri, Sirdaryo viloyati",
    phones: ["+998903324114"],
    mapUrl: yandexUrl("Acoustic Birlashgan 6B Guliston Sirdaryo"),
  },
  {
    shortName: "Samarqand",
    displayName: "Samarqand filialimiz",
    city: "Samarqand",
    region: "region",
    address: "Gagarin ko'chasi, 60-uy, Samarqand shahri",
    phones: ["+998994474114"],
    mapUrl: yandexUrl("Acoustic Gagarin 60 Samarqand"),
  },
  {
    shortName: "Navoiy",
    displayName: "Navoiy filialimiz",
    city: "Navoiy",
    region: "region",
    address: "Lev Tolstoy ko'chasi, 1/30-31, Zarafshon MFY, Navoiy shahri",
    phones: ["+998937664114"],
    mapUrl: yandexUrl("Acoustic Lev Tolstoy 1 Zarafshon Navoiy"),
  },
  {
    shortName: "Buxoro",
    displayName: "Buxoro filialimiz",
    city: "Buxoro",
    region: "region",
    address: "Mustaqillik ko'chasi, 40/1-uy, Buxoro shahri",
    phones: ["+998935130049"],
    mapUrl: yandexUrl("Acoustic Mustaqillik 40 Buxoro"),
  },
  {
    shortName: "Qarshi",
    displayName: "Qarshi filialimiz",
    city: "Qarshi",
    region: "region",
    address: "Islom Karimov ko'chasi, 353-uy, Chaqar MFY, Qarshi shahri",
    phones: ["+998908744114"],
    mapUrl: yandexUrl("Acoustic Islom Karimov 353 Chaqar Qarshi"),
  },
  {
    shortName: "Shahrisabz",
    displayName: "Shahrisabz filialimiz",
    city: "Qashqadaryo",
    region: "region",
    address: "340-uy, Teparlik MFY, Shahrisabz shahri, Qashqadaryo viloyati",
    phones: ["+998998040605"],
    mapUrl: yandexUrl("Acoustic Teparlik 340 Shahrisabz Qashqadaryo"),
  },
  {
    shortName: "Termiz",
    displayName: "Termiz filialimiz",
    city: "Surxondaryo",
    region: "region",
    address: "Taraqqiyot ko'chasi, 36A-uy, Termiz shahri, Surxondaryo viloyati",
    phones: ["+998909794114"],
    mapUrl: yandexUrl("Acoustic Taraqqiyot 36A Termiz Surxondaryo"),
  },
  {
    shortName: "Urganch",
    displayName: "Urganch filialimiz",
    city: "Xorazm",
    region: "region",
    address: "Tinchlik ko'chasi, 31-uy, Urganch shahri, Xorazm viloyati",
    phones: ["+998992224114"],
    mapUrl: yandexUrl("Acoustic Tinchlik 31 Urganch Xorazm"),
  },
  {
    shortName: "Nukus",
    displayName: "Nukus filialimiz",
    city: "Nukus",
    region: "region",
    address: "Allayar Dosnazarov ko'chasi, 99/3, Nukus shahri",
    phones: ["+998907094114"],
    mapUrl: yandexUrl("Acoustic Allayar Dosnazarov 99 Nukus"),
  },
  {
    shortName: "Andijon",
    displayName: "Andijon filialimiz",
    city: "Andijon",
    region: "region",
    address: "Alisher Navoiy ko'chasi, 86/88-uy, Andijon shahri",
    phones: ["+998994204114"],
    mapUrl: yandexUrl("Acoustic Alisher Navoiy 86 Andijon"),
  },
  {
    shortName: "Namangan",
    displayName: "Namangan filialimiz",
    city: "Namangan",
    region: "region",
    address: "Boburshoh ko'chasi, 16/4-uy, Namangan shahri",
    phones: ["+998932084114"],
    mapUrl: yandexUrl("Acoustic Boburshoh 16 Namangan"),
  },
  {
    shortName: "Qo'qon",
    displayName: "Qo'qon filialimiz",
    city: "Farg'ona",
    region: "region",
    address: "Yangi Chorsu, 219-uy, Qo'qon shahri",
    phones: ["+998916795334"],
    mapUrl: yandexUrl("Acoustic Yangi Chorsu 219 Qo'qon"),
  },
  {
    shortName: "Farg'ona",
    displayName: "Farg'ona filialimiz",
    city: "Farg'ona",
    region: "region",
    address: "Al-Farg'oniy ko'chasi, 19-uy, Farg'ona shahri",
    phones: ["+998901614114"],
    mapUrl: yandexUrl("Acoustic Al-Farg'oniy 19 Farg'ona"),
  },
  {
    shortName: "Jizzax",
    displayName: "Jizzax filialimiz",
    city: "Jizzax",
    region: "region",
    address: "Shifokorlar ko'chasi, 8A, Toshloq MFY, Jizzax shahri",
    phones: ["+998933654114"],
    mapUrl: yandexUrl("Acoustic Shifokorlar 8A Jizzax"),
  },
];

/** Mijozga yuboriladigan to'liq blok matni — manzil + telefon + xarita. */
export function renderBranchBlock(b: AcousticBranch): string {
  const phones = b.phones.map(formatPhone).join(", ");
  return `${b.displayName}: ${b.address}.\nTelefon: ${phones}\nLokatsiya: ${b.mapUrl}`;
}

/** Toshkent yoki viloyatlardagi filiallar ro'yxati — qisqa qator bilan. */
export function renderRegionList(region: AcousticBranch["region"]): string {
  const list = ACOUSTIC_BRANCHES.filter((b) => b.region === region);
  const title =
    region === "tashkent"
      ? "Toshkentdagi filiallarimiz:"
      : "Viloyatlardagi filiallarimiz:";
  const lines = list.map(
    (b) => `• ${b.shortName} — ${b.address.split(",").slice(0, 2).join(", ")} (${formatPhone(b.phones[0])})`,
  );
  return [title, ...lines].join("\n");
}
