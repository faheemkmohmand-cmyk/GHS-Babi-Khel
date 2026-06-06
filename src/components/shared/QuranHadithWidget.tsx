/**
 * QuranHadithWidget.tsx
 * Three tabs: Verse of the Day · Hadith of the Day · 99 Names of Allah
 * APIs: alquran.cloud (verse + translation, free, no key)
 *       hadithapi.com  — has CORS issues, so we use a curated offline
 *       collection of authentic hadiths (guaranteed to always work)
 * 99 Names: fully offline, no API needed
 */

import { useState, useEffect, useRef } from "react";
import { m } from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VerseData {
  arabic: string;
  translation: string;
  surah: string;
  ayah: number;
  surahNumber: number;
}

interface HadithData {
  text: string;
  narrator: string;
  source: string;
  grade?: string;
}

interface AllaName {
  number: number;
  arabic: string;
  transliteration: string;
  meaning: string;
  benefit: string;
}

type WidgetTab = "verse" | "hadith" | "names";

// ─── 99 Names of Allah ────────────────────────────────────────────────────────

const ALLAH_NAMES: AllaName[] = [
  { number: 1,  arabic: "ٱللَّٰه",         transliteration: "Allah",         meaning: "The Greatest Name",           benefit: "The name that encompasses all divine attributes" },
  { number: 2,  arabic: "ٱلرَّحْمَٰن",      transliteration: "Ar-Rahman",     meaning: "The Most Gracious",           benefit: "Recite for mercy and compassion in all affairs" },
  { number: 3,  arabic: "ٱلرَّحِيم",        transliteration: "Ar-Raheem",     meaning: "The Most Merciful",           benefit: "Brings divine mercy and forgiveness" },
  { number: 4,  arabic: "ٱلْمَلِك",         transliteration: "Al-Malik",      meaning: "The King",                    benefit: "Recite for authority and dignity" },
  { number: 5,  arabic: "ٱلْقُدُّوس",       transliteration: "Al-Quddus",     meaning: "The Most Holy",               benefit: "Purifies the heart and soul" },
  { number: 6,  arabic: "ٱلسَّلَام",        transliteration: "As-Salam",      meaning: "The Source of Peace",         benefit: "Brings peace and safety" },
  { number: 7,  arabic: "ٱلْمُؤْمِن",       transliteration: "Al-Mu'min",     meaning: "The Guardian of Faith",       benefit: "Grants security and removes fear" },
  { number: 8,  arabic: "ٱلْمُهَيْمِن",     transliteration: "Al-Muhaymin",   meaning: "The Protector",               benefit: "Grants divine protection and watchfulness" },
  { number: 9,  arabic: "ٱلْعَزِيز",        transliteration: "Al-Aziz",       meaning: "The Almighty",                benefit: "Grants strength and dignity" },
  { number: 10, arabic: "ٱلْجَبَّار",       transliteration: "Al-Jabbar",     meaning: "The Compeller",               benefit: "Heals the broken-hearted" },
  { number: 11, arabic: "ٱلْمُتَكَبِّر",    transliteration: "Al-Mutakabbir", meaning: "The Majestic",                benefit: "Instills humility and greatness" },
  { number: 12, arabic: "ٱلْخَالِق",        transliteration: "Al-Khaliq",     meaning: "The Creator",                 benefit: "Recite for creative inspiration" },
  { number: 13, arabic: "ٱلْبَارِئ",        transliteration: "Al-Bari'",      meaning: "The Evolver",                 benefit: "Recite for healing and well-being" },
  { number: 14, arabic: "ٱلْمُصَوِّر",      transliteration: "Al-Musawwir",   meaning: "The Fashioner of Forms",      benefit: "Recite for those seeking children" },
  { number: 15, arabic: "ٱلْغَفَّار",       transliteration: "Al-Ghaffar",    meaning: "The Ever-Forgiving",          benefit: "Seek forgiveness and relief from sins" },
  { number: 16, arabic: "ٱلْقَهَّار",       transliteration: "Al-Qahhar",     meaning: "The All-Prevailing",          benefit: "Overcomes worldly attachments" },
  { number: 17, arabic: "ٱلْوَهَّاب",       transliteration: "Al-Wahhab",     meaning: "The Bestower of Gifts",       benefit: "Recite for abundance and gifts" },
  { number: 18, arabic: "ٱلرَّزَّاق",       transliteration: "Ar-Razzaq",     meaning: "The Provider",                benefit: "Recite for sustenance and provision" },
  { number: 19, arabic: "ٱلْفَتَّاح",       transliteration: "Al-Fattah",     meaning: "The Opener",                  benefit: "Opens doors of success and mercy" },
  { number: 20, arabic: "ٱلْعَلِيم",        transliteration: "Al-'Alim",      meaning: "The All-Knowing",             benefit: "Increases knowledge and understanding" },
  { number: 21, arabic: "ٱلْقَابِض",        transliteration: "Al-Qabid",      meaning: "The Withholder",              benefit: "Trust in divine wisdom in times of hardship" },
  { number: 22, arabic: "ٱلْبَاسِط",        transliteration: "Al-Basit",      meaning: "The Extender",                benefit: "Recite for expansion of provision" },
  { number: 23, arabic: "ٱلْخَافِض",        transliteration: "Al-Khafid",     meaning: "The Abaser",                  benefit: "Protection from oppressors" },
  { number: 24, arabic: "ٱلرَّافِع",        transliteration: "Ar-Rafi'",      meaning: "The Exalter",                 benefit: "Elevates one's rank and status" },
  { number: 25, arabic: "ٱلْمُعِزّ",        transliteration: "Al-Mu'izz",     meaning: "The Honourer",                benefit: "Grants honour and dignity" },
  { number: 26, arabic: "ٱلْمُذِلّ",        transliteration: "Al-Mudhill",    meaning: "The Humiliator",              benefit: "Protection from enemies" },
  { number: 27, arabic: "ٱلسَّمِيع",        transliteration: "As-Sami'",      meaning: "The All-Hearing",             benefit: "All prayers and supplications are heard" },
  { number: 28, arabic: "ٱلْبَصِير",        transliteration: "Al-Basir",      meaning: "The All-Seeing",              benefit: "Sharpens insight and vision" },
  { number: 29, arabic: "ٱلْحَكَم",         transliteration: "Al-Hakam",      meaning: "The Judge",                   benefit: "Justice and fair resolution" },
  { number: 30, arabic: "ٱلْعَدْل",         transliteration: "Al-'Adl",       meaning: "The Utterly Just",            benefit: "Recite for justice and fairness" },
  { number: 31, arabic: "ٱللَّطِيف",        transliteration: "Al-Latif",      meaning: "The Subtle One",              benefit: "Divine subtlety in all matters" },
  { number: 32, arabic: "ٱلْخَبِير",        transliteration: "Al-Khabir",     meaning: "The All-Aware",               benefit: "Divine awareness of all hidden matters" },
  { number: 33, arabic: "ٱلْحَلِيم",        transliteration: "Al-Halim",      meaning: "The Forbearing",              benefit: "Grants patience and forbearance" },
  { number: 34, arabic: "ٱلْعَظِيم",        transliteration: "Al-'Azim",      meaning: "The Magnificent",             benefit: "Remembrance of Allah's greatness" },
  { number: 35, arabic: "ٱلْغَفُور",        transliteration: "Al-Ghafur",     meaning: "The Forgiving",               benefit: "Wipes away sins and brings peace" },
  { number: 36, arabic: "ٱلشَّكُور",        transliteration: "Ash-Shakur",    meaning: "The Appreciative",            benefit: "Gratitude multiplies blessings" },
  { number: 37, arabic: "ٱلْعَلِيّ",        transliteration: "Al-'Ali",       meaning: "The Most High",               benefit: "Elevates the believer spiritually" },
  { number: 38, arabic: "ٱلْكَبِير",        transliteration: "Al-Kabir",      meaning: "The Most Great",              benefit: "Recite to understand Allah's greatness" },
  { number: 39, arabic: "ٱلْحَفِيظ",        transliteration: "Al-Hafiz",      meaning: "The Preserver",               benefit: "Protects from harm and danger" },
  { number: 40, arabic: "ٱلْمُقِيت",        transliteration: "Al-Muqit",      meaning: "The Nourisher",               benefit: "Provides nourishment for body and soul" },
  { number: 41, arabic: "ٱلْحَسِيب",        transliteration: "Al-Hasib",      meaning: "The Reckoner",                benefit: "Sufficient as a guardian and protector" },
  { number: 42, arabic: "ٱلْجَلِيل",        transliteration: "Al-Jalil",      meaning: "The Majestic",                benefit: "Instills reverence and awe of Allah" },
  { number: 43, arabic: "ٱلْكَرِيم",        transliteration: "Al-Karim",      meaning: "The Most Generous",           benefit: "Recite for generosity and nobility" },
  { number: 44, arabic: "ٱلرَّقِيب",        transliteration: "Ar-Raqib",      meaning: "The Watchful",                benefit: "Builds God-consciousness (taqwa)" },
  { number: 45, arabic: "ٱلْمُجِيب",        transliteration: "Al-Mujib",      meaning: "The Responsive",              benefit: "Answers all sincere prayers" },
  { number: 46, arabic: "ٱلْوَاسِع",        transliteration: "Al-Wasi'",      meaning: "The All-Encompassing",        benefit: "Expands provision and blessings" },
  { number: 47, arabic: "ٱلْحَكِيم",        transliteration: "Al-Hakim",      meaning: "The All-Wise",                benefit: "Brings wisdom in decisions" },
  { number: 48, arabic: "ٱلْوَدُود",        transliteration: "Al-Wadud",      meaning: "The Most Loving",             benefit: "Increases love and affection" },
  { number: 49, arabic: "ٱلْمَجِيد",        transliteration: "Al-Majid",      meaning: "The Most Glorious",           benefit: "Brings glory and honour" },
  { number: 50, arabic: "ٱلْبَاعِث",        transliteration: "Al-Ba'ith",     meaning: "The Resurrector",             benefit: "Awakens the heart and conscience" },
  { number: 51, arabic: "ٱلشَّهِيد",        transliteration: "Ash-Shahid",    meaning: "The Witness",                 benefit: "Everything is witnessed by Allah" },
  { number: 52, arabic: "ٱلْحَقّ",          transliteration: "Al-Haqq",       meaning: "The Absolute Truth",          benefit: "Recite to know the truth in all matters" },
  { number: 53, arabic: "ٱلْوَكِيل",        transliteration: "Al-Wakil",      meaning: "The Trustee",                 benefit: "Place full trust in Allah's care" },
  { number: 54, arabic: "ٱلْقَوِيّ",        transliteration: "Al-Qawiyy",     meaning: "The All-Powerful",            benefit: "Grants inner strength" },
  { number: 55, arabic: "ٱلْمَتِين",        transliteration: "Al-Matin",      meaning: "The Firm",                    benefit: "Recite for steadfastness and resolve" },
  { number: 56, arabic: "ٱلْوَلِيّ",        transliteration: "Al-Waliyy",     meaning: "The Protecting Friend",       benefit: "Recite for divine friendship and support" },
  { number: 57, arabic: "ٱلْحَمِيد",        transliteration: "Al-Hamid",      meaning: "The Praiseworthy",            benefit: "All praise belongs to Allah alone" },
  { number: 58, arabic: "ٱلْمُحْصِي",       transliteration: "Al-Muhsi",      meaning: "The All-Enumerating",        benefit: "Nothing escapes Allah's count" },
  { number: 59, arabic: "ٱلْمُبْدِئ",       transliteration: "Al-Mubdi'",     meaning: "The Originator",              benefit: "Recite for new beginnings" },
  { number: 60, arabic: "ٱلْمُعِيد",        transliteration: "Al-Mu'id",      meaning: "The Restorer",                benefit: "Trust in Allah's power to restore" },
  { number: 61, arabic: "ٱلْمُحْيِي",       transliteration: "Al-Muhyi",      meaning: "The Giver of Life",           benefit: "Recite for healing and vitality" },
  { number: 62, arabic: "ٱلْمُمِيت",        transliteration: "Al-Mumit",      meaning: "The Taker of Life",           benefit: "Remembrance of mortality increases gratitude" },
  { number: 63, arabic: "ٱلْحَيّ",          transliteration: "Al-Hayy",       meaning: "The Ever-Living",             benefit: "Recite for life and vitality" },
  { number: 64, arabic: "ٱلْقَيُّوم",       transliteration: "Al-Qayyum",     meaning: "The Self-Subsisting",         benefit: "The sustainer of all existence" },
  { number: 65, arabic: "ٱلْوَاجِد",        transliteration: "Al-Wajid",      meaning: "The Finder",                  benefit: "Recite to find what is lost" },
  { number: 66, arabic: "ٱلْمَاجِد",        transliteration: "Al-Majid",      meaning: "The Most Noble",              benefit: "Recite for nobility and honour" },
  { number: 67, arabic: "ٱلْوَاحِد",        transliteration: "Al-Wahid",      meaning: "The One",                     benefit: "Recite to strengthen Tawhid (oneness)" },
  { number: 68, arabic: "ٱلْأَحَد",         transliteration: "Al-Ahad",       meaning: "The Unique",                  benefit: "The absolute uniqueness of Allah" },
  { number: 69, arabic: "ٱلصَّمَد",         transliteration: "As-Samad",      meaning: "The Eternal",                 benefit: "Allah is needed by all, needs none" },
  { number: 70, arabic: "ٱلْقَادِر",        transliteration: "Al-Qadir",      meaning: "The All-Powerful",            benefit: "Recite for capability and strength" },
  { number: 71, arabic: "ٱلْمُقْتَدِر",     transliteration: "Al-Muqtadir",   meaning: "The Powerful",                benefit: "Recite for greater power and resolve" },
  { number: 72, arabic: "ٱلْمُقَدِّم",      transliteration: "Al-Muqaddim",   meaning: "The Expediter",               benefit: "Recite to advance important matters" },
  { number: 73, arabic: "ٱلْمُؤَخِّر",      transliteration: "Al-Mu'akhkhir", meaning: "The Delayer",                 benefit: "Trust in divine timing" },
  { number: 74, arabic: "ٱلْأَوَّل",        transliteration: "Al-Awwal",      meaning: "The First",                   benefit: "Recite for blessings at the start of any task" },
  { number: 75, arabic: "ٱلْآخِر",          transliteration: "Al-Akhir",      meaning: "The Last",                    benefit: "Recite when facing the end of things" },
  { number: 76, arabic: "ٱلظَّاهِر",        transliteration: "Az-Zahir",      meaning: "The Manifest",                benefit: "Reveals divine signs in the world" },
  { number: 77, arabic: "ٱلْبَاطِن",        transliteration: "Al-Batin",      meaning: "The Hidden",                  benefit: "Knowledge of all inner realities" },
  { number: 78, arabic: "ٱلْوَالِي",        transliteration: "Al-Wali",       meaning: "The Governor",                benefit: "Recite for divine governance of affairs" },
  { number: 79, arabic: "ٱلْمُتَعَالِي",    transliteration: "Al-Muta'ali",   meaning: "The Most Exalted",            benefit: "Transcends all understanding" },
  { number: 80, arabic: "ٱلْبَرّ",          transliteration: "Al-Barr",       meaning: "The Source of All Goodness",  benefit: "Recite for goodness and kindness" },
  { number: 81, arabic: "ٱلتَّوَّاب",       transliteration: "At-Tawwab",     meaning: "The Ever-Returning",          benefit: "Accept repentance and return to Allah" },
  { number: 82, arabic: "ٱلْمُنْتَقِم",     transliteration: "Al-Muntaqim",   meaning: "The Avenger",                 benefit: "Justice against oppression" },
  { number: 83, arabic: "ٱلْعَفُوّ",        transliteration: "Al-'Afuww",     meaning: "The Pardoner",                benefit: "Recite for complete pardon of sins" },
  { number: 84, arabic: "ٱلرَّءُوف",        transliteration: "Ar-Ra'uf",      meaning: "The Most Kind",               benefit: "Recite for gentleness and mercy" },
  { number: 85, arabic: "مَالِكُ ٱلْمُلْك", transliteration: "Malik-ul-Mulk", meaning: "The Eternal Owner of Sovereignty", benefit: "Recite for authority and leadership" },
  { number: 86, arabic: "ذُو ٱلْجَلَال",    transliteration: "Dhul-Jalali",   meaning: "Lord of Majesty and Bounty",  benefit: "Recite for magnificence and blessings" },
  { number: 87, arabic: "ٱلْمُقْسِط",       transliteration: "Al-Muqsit",     meaning: "The Just",                    benefit: "Recite for equity and fairness" },
  { number: 88, arabic: "ٱلْجَامِع",        transliteration: "Al-Jami'",      meaning: "The Gatherer",                benefit: "Recite to bring things together" },
  { number: 89, arabic: "ٱلْغَنِيّ",        transliteration: "Al-Ghani",      meaning: "The Self-Sufficient",         benefit: "Recite to rid the heart of dependence on creation" },
  { number: 90, arabic: "ٱلْمُغْنِي",       transliteration: "Al-Mughni",     meaning: "The Enricher",                benefit: "Recite for sufficiency and wealth" },
  { number: 91, arabic: "ٱلْمَانِع",        transliteration: "Al-Mani'",      meaning: "The Withholder",              benefit: "Protects from harmful things" },
  { number: 92, arabic: "ٱلضَّارّ",         transliteration: "Ad-Darr",       meaning: "The Distresser",              benefit: "Nothing harms except by Allah's will" },
  { number: 93, arabic: "ٱلنَّافِع",        transliteration: "An-Nafi'",      meaning: "The Benefactor",              benefit: "Recite for benefit and goodness" },
  { number: 94, arabic: "ٱلنُّور",          transliteration: "An-Nur",        meaning: "The Light",                   benefit: "Illuminates the heart and mind" },
  { number: 95, arabic: "ٱلْهَادِي",        transliteration: "Al-Hadi",       meaning: "The Guide",                   benefit: "Recite for guidance in all affairs" },
  { number: 96, arabic: "ٱلْبَدِيع",        transliteration: "Al-Badi'",      meaning: "The Incomparable",            benefit: "Marvel at Allah's unique creation" },
  { number: 97, arabic: "ٱلْبَاقِي",        transliteration: "Al-Baqi",       meaning: "The Everlasting",             benefit: "Recite to remember eternal life" },
  { number: 98, arabic: "ٱلْوَارِث",        transliteration: "Al-Warith",     meaning: "The Inheritor",               benefit: "Allah is the ultimate inheritor of all" },
  { number: 99, arabic: "ٱلرَّشِيد",        transliteration: "Ar-Rashid",     meaning: "The Guide to the Right Path", benefit: "Recite for righteousness and right guidance" },
];

// ─── Curated offline Hadiths (authentic, sourced from Bukhari/Muslim/Tirmidhi) ─
const HADITHS: HadithData[] = [
  { text: "The best of you are those who learn the Quran and teach it.", narrator: "Uthman ibn Affan (RA)", source: "Sahih al-Bukhari", grade: "Sahih" },
  { text: "Seek knowledge from the cradle to the grave.", narrator: "Prophet Muhammad ﷺ", source: "Hadith Literature", grade: "Well-known" },
  { text: "None of you will have faith until he loves for his brother what he loves for himself.", narrator: "Anas ibn Malik (RA)", source: "Sahih al-Bukhari", grade: "Sahih" },
  { text: "The strong man is not the one who overcomes people by his strength, but the one who controls himself while in anger.", narrator: "Abu Hurayrah (RA)", source: "Sahih al-Bukhari", grade: "Sahih" },
  { text: "Whoever does not show mercy to people, Allah will not show mercy to him.", narrator: "Jarir ibn Abdullah (RA)", source: "Sahih al-Bukhari", grade: "Sahih" },
  { text: "Make things easy and do not make them difficult; calm people and do not drive them away.", narrator: "Anas ibn Malik (RA)", source: "Sahih al-Bukhari", grade: "Sahih" },
  { text: "The best of people are those who are most beneficial to others.", narrator: "Jabir ibn Abdullah (RA)", source: "Al-Mu'jam al-Awsat", grade: "Hasan" },
  { text: "Remove harm from the road, for it is charity.", narrator: "Abu Hurayrah (RA)", source: "Sahih Muslim", grade: "Sahih" },
  { text: "Whoever believes in Allah and the Last Day, let him speak good or remain silent.", narrator: "Abu Hurayrah (RA)", source: "Sahih al-Bukhari", grade: "Sahih" },
  { text: "The world is a prison for the believer and a paradise for the disbeliever.", narrator: "Abu Hurayrah (RA)", source: "Sahih Muslim", grade: "Sahih" },
  { text: "Kindness is not found in anything but that it adds to its beauty, and it is not withdrawn from anything but it makes it defective.", narrator: "Aisha (RA)", source: "Sahih Muslim", grade: "Sahih" },
  { text: "Take benefit of five before five: your youth before your old age, your health before your sickness, your wealth before your poverty, your free time before your preoccupation, and your life before your death.", narrator: "Ibn Abbas (RA)", source: "Shu'ab al-Iman", grade: "Sahih" },
  { text: "Feed the hungry, visit the sick, and free the captive.", narrator: "Abu Musa al-Ash'ari (RA)", source: "Sahih al-Bukhari", grade: "Sahih" },
  { text: "Verily, actions are by intentions, and every person will have only what they intended.", narrator: "Umar ibn al-Khattab (RA)", source: "Sahih al-Bukhari", grade: "Sahih" },
  { text: "The religion is sincerity. The companions asked: To whom? He replied: To Allah, His Book, His Messenger, the leaders of the Muslims and their common folk.", narrator: "Tamim al-Dari (RA)", source: "Sahih Muslim", grade: "Sahih" },
  { text: "Part of the perfection of someone's Islam is his leaving alone what does not concern him.", narrator: "Abu Hurayrah (RA)", source: "Jami' at-Tirmidhi", grade: "Hasan" },
  { text: "Smile at your brother, for it is charity.", narrator: "Abu Dharr (RA)", source: "Jami' at-Tirmidhi", grade: "Sahih" },
  { text: "Allah does not look at your appearance or your wealth, but He looks at your hearts and your deeds.", narrator: "Abu Hurayrah (RA)", source: "Sahih Muslim", grade: "Sahih" },
  { text: "Whoever shows the way to something good will be rewarded equally to the one who does it.", narrator: "Abu Mas'ud al-Ansari (RA)", source: "Sahih Muslim", grade: "Sahih" },
  { text: "Do not belittle any good deed, even if it is just greeting your brother with a cheerful face.", narrator: "Abu Dharr (RA)", source: "Sahih Muslim", grade: "Sahih" },
  { text: "A Muslim is the one from whose tongue and hand other Muslims are safe.", narrator: "Abdullah ibn Amr (RA)", source: "Sahih al-Bukhari", grade: "Sahih" },
  { text: "Richness is not having many possessions, but richness is being content with oneself.", narrator: "Abu Hurayrah (RA)", source: "Sahih al-Bukhari", grade: "Sahih" },
  { text: "The best charity is to give to one who is in need while you yourself are in a state of need.", narrator: "Abu Hurayrah (RA)", source: "Sunan Abi Dawud", grade: "Sahih" },
  { text: "Cleanliness is half of faith.", narrator: "Abu Malik al-Ash'ari (RA)", source: "Sahih Muslim", grade: "Sahih" },
  { text: "Whoever of you sees an evil, let him change it with his hand. If he is unable, then with his tongue. If he is unable, then with his heart — and this is the weakest of faith.", narrator: "Abu Sa'id al-Khudri (RA)", source: "Sahih Muslim", grade: "Sahih" },
  { text: "The most beloved of deeds to Allah are those that are most consistent, even if it is small.", narrator: "Aisha (RA)", source: "Sahih al-Bukhari", grade: "Sahih" },
  { text: "Speak the truth even if it is bitter.", narrator: "Abu Dharr (RA)", source: "Ibn Hibban", grade: "Sahih" },
  { text: "Every act of kindness is charity.", narrator: "Jabir ibn Abdullah (RA)", source: "Sahih al-Bukhari", grade: "Sahih" },
  { text: "He who does not show mercy to our young ones and does not acknowledge the right of our elders is not from us.", narrator: "Abdullah ibn Amr (RA)", source: "Sunan Abi Dawud", grade: "Sahih" },
  { text: "Protect yourself from the fire even if it is by giving half a date in charity.", narrator: "Adi ibn Hatim (RA)", source: "Sahih al-Bukhari", grade: "Sahih" },
];

// ─── Helper: day-based index ─────────────────────────────────────────────────
function dayIndex(arrayLength: number): number {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Number(new Date()) - Number(start)) / 86400000);
  return dayOfYear % arrayLength;
}

// ─── Spinner ─────────────────────────────────────────────────────────────────
const Spinner = () => (
  <div className="flex items-center justify-center py-8">
    <div className="w-7 h-7 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

// ─── Verse Tab ───────────────────────────────────────────────────────────────
function VerseTab() {
  const [verse, setVerse] = useState<VerseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Pick a surah:ayah combo based on day of year — cycles through Quran steadily
    const dayOfYear = Math.floor((Number(new Date()) - Number(new Date(new Date().getFullYear(), 0, 0))) / 86400000);
    // Map to a real ayah number (1–6236 total ayahs)
    const ayahNumber = (dayOfYear * 17) % 6236 + 1; // prime step for spread

    fetch(`https://api.alquran.cloud/v1/ayah/${ayahNumber}/editions/quran-simple,en.sahih`)
      .then(r => r.json())
      .then(data => {
        if (data.code !== 200 || !data.data) throw new Error("bad response");
        const arabic = data.data[0];
        const english = data.data[1];
        setVerse({
          arabic: arabic.text,
          translation: english.text,
          surah: arabic.surah.englishName,
          ayah: arabic.numberInSurah,
          surahNumber: arabic.surah.number,
        });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  if (error) {
    // Offline fallback: a beautiful well-known verse
    return (
      <div className="space-y-5">
        <div className="text-center">
          <span className="text-xs font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full">
            Surah Al-Baqarah · Ayah 286
          </span>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-2xl p-5 text-center border border-emerald-100 dark:border-emerald-900/50">
          <p className="text-2xl leading-loose font-arabic text-emerald-900 dark:text-emerald-100" style={{ fontFamily: "'Amiri', 'Scheherazade New', serif", lineHeight: "2.2" }}>
            لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا
          </p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-sm text-foreground leading-relaxed text-center italic">
            "Allah does not burden a soul beyond that it can bear."
          </p>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          Connect to internet for today's verse · Quran 2:286
        </p>
      </div>
    );
  }

  if (!verse) return null;

  return (
    <div className="space-y-4">
      {/* Badge */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-xs font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 rounded-full">
          Surah {verse.surah} · Ayah {verse.ayah}
        </span>
        <span className="text-xs bg-secondary text-muted-foreground px-2.5 py-1 rounded-full">
          {verse.surahNumber}:{verse.ayah}
        </span>
      </div>

      {/* Arabic */}
      <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-cyan-950/30 rounded-2xl p-6 border border-emerald-200/60 dark:border-emerald-800/40">
        <p
          className="text-right text-xl leading-loose text-emerald-900 dark:text-emerald-100"
          dir="rtl"
          style={{ fontFamily: "'Amiri', 'Scheherazade New', 'Noto Naskh Arabic', serif", lineHeight: "2.4", fontSize: "1.4rem" }}
        >
          {verse.arabic}
        </p>
      </div>

      {/* Translation */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-start gap-2">
          <span className="text-emerald-500 text-lg shrink-0 mt-0.5">❝</span>
          <p className="text-sm text-foreground leading-relaxed italic">{verse.translation}</p>
          <span className="text-emerald-500 text-lg shrink-0 mt-auto">❞</span>
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground">
        📖 Quran · Sahih International Translation · alquran.cloud
      </p>
    </div>
  );
}

// ─── Hadith Tab ───────────────────────────────────────────────────────────────
function HadithTab() {
  const hadith = HADITHS[dayIndex(HADITHS.length)];

  return (
    <div className="space-y-4">
      {/* Grade badge */}
      <div className="flex items-center justify-center gap-2">
        {hadith.grade && (
          <span className="text-xs font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-3 py-1.5 rounded-full">
            ✓ {hadith.grade}
          </span>
        )}
        <span className="text-xs bg-secondary text-muted-foreground px-2.5 py-1 rounded-full">
          {hadith.source}
        </span>
      </div>

      {/* Hadith text */}
      <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-yellow-950/30 rounded-2xl p-6 border border-amber-200/60 dark:border-amber-800/40">
        <div className="flex items-start gap-3">
          <span className="text-3xl text-amber-500 shrink-0 leading-none mt-1">❝</span>
          <p className="text-base text-amber-900 dark:text-amber-100 leading-relaxed font-medium">
            {hadith.text}
          </p>
        </div>
      </div>

      {/* Narrator */}
      <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
          <span className="text-lg">🕌</span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">Narrated by</p>
          <p className="text-sm font-bold text-foreground">{hadith.narrator}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-muted-foreground font-medium">Source</p>
          <p className="text-xs font-semibold text-foreground">{hadith.source}</p>
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground">
        📚 Authentic Hadith · Updated daily
      </p>
    </div>
  );
}

// ─── 99 Names Tab ─────────────────────────────────────────────────────────────
function NamesTab() {
  const [selected, setSelected] = useState<AllaName | null>(null);
  const [search, setSearch] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);

  const filtered = search.trim().length > 0
    ? ALLAH_NAMES.filter(n =>
        n.transliteration.toLowerCase().includes(search.toLowerCase()) ||
        n.meaning.toLowerCase().includes(search.toLowerCase()) ||
        n.arabic.includes(search) ||
        String(n.number).includes(search)
      )
    : ALLAH_NAMES;

  // Close modal on outside click
  useEffect(() => {
    if (!selected) return;
    const handler = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) setSelected(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selected]);

  const bgColors = [
    "from-emerald-500 to-teal-500",
    "from-teal-500 to-cyan-500",
    "from-cyan-500 to-blue-500",
    "from-blue-500 to-indigo-500",
    "from-indigo-500 to-violet-500",
    "from-violet-500 to-purple-500",
    "from-purple-500 to-pink-500",
    "from-pink-500 to-rose-500",
    "from-rose-500 to-orange-500",
    "from-orange-500 to-amber-500",
  ];

  return (
    <div className="space-y-3">
      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Search by name or meaning…"
        className="w-full bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-emerald-500/40"
      />

      <p className="text-[11px] text-muted-foreground text-center">
        Showing {filtered.length} of 99 Names · Tap any name for details
      </p>

      {/* Grid */}
      <div className="grid grid-cols-3 gap-2 max-h-[360px] overflow-y-auto pr-1">
        {filtered.map(name => (
          <button
            key={name.number}
            onClick={() => setSelected(name)}
            className={`bg-gradient-to-br ${bgColors[name.number % bgColors.length]} rounded-xl p-3 text-white text-center shadow-sm hover:shadow-md hover:scale-105 transition-all duration-200 active:scale-95`}
          >
            <p className="text-xs font-bold opacity-70 mb-0.5">#{name.number}</p>
            <p className="text-base font-bold leading-tight" style={{ fontFamily: "'Amiri', serif" }}>
              {name.arabic}
            </p>
            <p className="text-[10px] opacity-85 mt-0.5 font-medium leading-tight">
              {name.transliteration}
            </p>
          </button>
        ))}
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setSelected(null)}>
          <div
            ref={modalRef}
            className="bg-card border border-border rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`bg-gradient-to-br ${bgColors[selected.number % bgColors.length]} p-6 text-white text-center`}>
              <p className="text-sm font-bold opacity-80 mb-1">Name #{selected.number} of 99</p>
              <p
                className="text-4xl font-bold leading-tight mb-2"
                style={{ fontFamily: "'Amiri', 'Scheherazade New', serif", lineHeight: "1.6" }}
              >
                {selected.arabic}
              </p>
              <p className="text-lg font-bold">{selected.transliteration}</p>
            </div>
            {/* Body */}
            <div className="p-5 space-y-3">
              <div className="bg-secondary rounded-xl p-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Meaning</p>
                <p className="text-sm font-semibold text-foreground">{selected.meaning}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/50 rounded-xl p-3">
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">✨ Benefit & Significance</p>
                <p className="text-sm text-foreground leading-relaxed">{selected.benefit}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="w-full bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl py-2.5 text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────────────
export default function QuranHadithWidget() {
  const [tab, setTab] = useState<WidgetTab>("verse");

  const tabs: { id: WidgetTab; label: string; emoji: string; color: string }[] = [
    { id: "verse",  label: "Verse",  emoji: "📖", color: "emerald" },
    { id: "hadith", label: "Hadith", emoji: "🕌", color: "amber"   },
    { id: "names",  label: "99 Names", emoji: "✨", color: "violet" },
  ];

  const headerGradients: Record<WidgetTab, string> = {
    verse:  "from-emerald-600 via-teal-600 to-cyan-600",
    hadith: "from-amber-600 via-orange-600 to-yellow-600",
    names:  "from-violet-600 via-purple-600 to-indigo-600",
  };

  return (
    <m.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      className="bg-card border border-border rounded-3xl overflow-hidden shadow-card"
    >
      {/* Header */}
      <div className={`bg-gradient-to-r ${headerGradients[tab]} px-5 py-4 transition-all duration-500`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <span className="text-xl">{tab === "verse" ? "📖" : tab === "hadith" ? "🕌" : "✨"}</span>
          </div>
          <div>
            <p className="text-white font-black text-base leading-tight">
              {tab === "verse"  && "Verse of the Day"}
              {tab === "hadith" && "Hadith of the Day"}
              {tab === "names"  && "99 Names of Allah"}
            </p>
            <p className="text-white/70 text-[11px] mt-0.5">
              {tab === "verse"  && "Daily Quran reflection with translation"}
              {tab === "hadith" && "Authentic narrations of the Prophet ﷺ"}
              {tab === "names"  && "Al-Asma ul-Husna — Tap any name to explore"}
            </p>
          </div>
          {/* Date badge */}
          <span className="ml-auto text-[10px] bg-white/20 text-white border border-white/25 px-2.5 py-1 rounded-full font-bold shrink-0">
            {new Date().toLocaleDateString("en-US", { day: "numeric", month: "short" })}
          </span>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 px-4 pt-4 pb-2">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
              tab === t.id
                ? t.id === "verse"  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 shadow-sm"
                : t.id === "hadith" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 shadow-sm"
                :                     "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            <span>{t.emoji}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 pb-5">
        {tab === "verse"  && <VerseTab />}
        {tab === "hadith" && <HadithTab />}
        {tab === "names"  && <NamesTab />}
      </div>
    </m.div>
  );
}
