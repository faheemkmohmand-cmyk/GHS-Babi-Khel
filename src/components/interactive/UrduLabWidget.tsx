/**
 * UrduLabWidget.tsx - AI-Powered Dynamic Urdu Learning Lab
 * 
 * Features:
 * - 📖 لغت (Lughat) - Comprehensive vocabulary builder
 * - 🎭 شاعری (Shayari) - Poetry appreciation & analysis
 * - 💬 کہاوتیں (Kehwar) - Proverbs & their meanings
 * - ✍️ جملہ بنائیں (Jumla) - Sentence building exercises
 * - 🎯 محاورے (Muhavare) - Idioms with usage examples
 * - 📚 قواعد (Qawaid) - Grammar rules & practice
 * 
 * Beautiful RTL support with Nastaliq-inspired typography
 */

import { useState, useMemo, useCallback } from "react";
import { 
  BookOpen, CheckCircle2, XCircle, RotateCcw, Volume2, 
  Lightbulb, Trophy, Target, Sparkles, PenTool, Brain,
  ArrowRight, RefreshCw, Star, Zap, GraduationCap,
  MessageSquare, Heart, Quote, Languages, Award
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────

type LabTab = "lughat" | "shayari" | "kehwar" | "jumla" | "muhavare" | "qawaid";

interface LughatEntry {
  word: string;
  urduWord: string;
  meaning: string;
  meaningUrdu: string;
  partOfSpeech: string;
  partOfSpeechUrdu: string;
  example: string;
  exampleUrdu: string;
  synonyms: string[];
  difficulty: "آسان" | "متوسط" | "مشکل";
}

interface ShayariEntry {
  poet: string;
  poetNameUrdu: string;
  sher: string;
  translation: string;
  explanation: string;
  theme: string;
}

interface KehwarEntry {
  proverb: string;
  meaning: string;
  usage: string;
  origin?: string;
}

interface JumlaExercise {
  id: number;
  type: "complete" | "correct" | "transform" | "tense";
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
}

interface MuhavraEntry {
  muhavara: string;
  meaning: string;
  example: string;
  englishEquivalent?: string;
}

// ─── COMPREHENSIVE DATA STORES ─────────────────────────────────────

const LUGHAT_BANK: LughatEntry[] = [
  {
    word: "Ilm",
    urduWord: "علم",
    meaning: "Knowledge; learning; education",
    meaningUrdu: "دانائی، سیکھنا، تعلیم",
    partOfSpeech: "Noun",
    partOfSpeechUrdu: "اسم",
    example: "Ilm bohot ahem hai.",
    exampleUrdu: "علم بہت اہم ہے۔",
    synonyms: ["Ma'lumat", "Danai", "Taleem"],
    difficulty: "آسان"
  },
  {
    word: "Mohabbat",
    urduWord: "محبت",
    meaning: "Love; affection; fondness",
    meaningUrdu: "پیار، عشق، لگاؤ",
    partOfSpeech: "Noun",
    partOfSpeechUrdu: "اسم",
    example: "Walidon ki mohabbat be-misal hai.",
    exampleUrdu: "والدین کی محبت بے مثال ہے۔",
    synonyms: ["Pyar", "Ishq", "Lagao"],
    difficulty: "آسان"
  },
  {
    word: "Himat",
    urduWord: "حوصلہ",
    meaning: "Courage; bravery; determination",
    meaningUrdu: "بہادری، ہمت، عزم",
    partOfSpeech: "Noun",
    partOfSpeechUrdu: "اسم",
    example: "Himat-e-buland rakho.",
    exampleUrdu: "حوصلہ بلند رکھو۔",
    synonyms: ["Bahadiri", "Azm", "Jurrat"],
    difficulty: "متوسط"
  },
  {
    word: "Koshish",
    urduWord: "کوشش",
    meaning: "Effort; attempt; endeavor",
    meaningUrdu: "کوشش، جدوجہد، کرم",
    partOfSpeech: "Noun",
    partOfSpeechUrdu: "اسم",
    example: "Koshish karo, kamyabi milegi.",
    exampleUrdu: "کوشش کرو، کامیابی ملے گی۔",
    synonyms: ["Jadd-o-Jehd", "Saat", "Koshish"],
    difficulty: "آسان"
  },
  {
    word: "Taqdeer",
    urduWord: "تقدیر",
    meaning: "Destiny; fate; fortune",
    meaningUrdu: "قدر، نصیب، تقدير",
    partOfSpeech: "Noun",
    partOfSpeechUrdu: "اسم",
    example: "Taqdeer apne haath banaati hai.",
    exampleUrdu: "تقدیر اپنے ہاتھ بناتی ہے۔",
    synonyms: ["Naseeb", "Qadr", "Fate"],
    difficulty: "متوسط"
  },
  {
    word: "Izzat",
    urduWord: "عزت",
    meaning: "Respect; honor; dignity",
    meaningUrdu: "احترام، وقار، حرمت",
    partOfSpeech: "Noun",
    partOfSpeechUrdu: "اسم",
    example: "Buzurgon ki izzat karo.",
    exampleUrdu: "بزرگوں کی عزت کرو۔",
    synonyms: ["Ahteram", "Waqar", "Haramt"],
    difficulty: "آسان"
  },
  {
    word: "Amal",
    urduWord: "عمل",
    meaning: "Action; deed; practice",
    meaningUrdu: "عمل، کام، کرنا",
    partOfSpeech: "Noun",
    partOfSpeechUrdu: "اسم",
    example: "Achay amal karo.",
    exampleUrdu: "اچھے عمل کرو۔",
    synonyms: ["Kam", "Fe'l", "Kirdar"],
    difficulty: "آسان"
  },
  {
    word: "Sukoon",
    urduWord: "سکون",
    meaning: "Peace; tranquility; calmness",
    meaningUrdu: "aman، چین، سکون",
    partOfSpeech: "Noun",
    partOfSpeechUrdu: "اسم",
    example: "Dil ko sukoon mila.",
    exampleUrdu: "دل کو سکون ملا۔",
    synonyms: ["Aman", "Chain", "Rahat"],
    difficulty: "متوسط"
  }
];

const SHAYARI_COLLECTION: ShayariEntry[] = [
  {
    poet: "Allama Iqbal",
    poetNameUrdu: "علامہ اقبال",
    sher: "خودی کو کر بلند اتنا کہ ہر تقدیر سے پہلے\nخدا بندے سے خود پوچھے بتا رہا ہے میری تقدیر",
    translation: "Elevate your self so much that before every destiny,\nGod Himself asks His servant, 'Tell me, what is your destiny?'",
    explanation: "This famous verse emphasizes self-belief and personal empowerment. Iqbal encourages us to develop our potential so greatly that even divine destiny seeks our input.",
    theme: "Self-Empowerment / Khudi"
  },
  {
    poet: "Mirza Ghalib",
    poetNameUrdu: "مرزا غالب",
    sher: "دوست بوئے دنگ اس آدم سے جسے شاعر کہتے ہیں\nمیرے شبوں کا دیا اور میرے سویرے کا چراغ",
    translation: "My friend, beware of this man whom they call a poet—\nThe lamp of my nights and the lantern of my mornings!",
    explanation: "Ghalib humorously warns his friend about poets, calling himself both night's lamp and morning's lantern—suggesting he's always burning with poetic passion.",
    theme: "Poetry / Humor"
  },
  {
    poet: "Faiz Ahmed Faiz",
    poetNameUrdu: "فیض احمد فیض",
    sher: "بول کہ لب آزاد ہیں تیرے\nبول زبان اب تک تازہ ہے تیری",
    translation: "Speak, for your lips are free;\nSpeak, your tongue is still your own.",
    explanation: "Faiz's iconic call to speak truth to power. Written during times of censorship, it urges people to use their voice while they still have the freedom to do so.",
    theme: "Freedom / Resistance"
  },
  {
    poet: "Ahmad Faraz",
    poetNameUrdu: "احمد فراز",
    sher: "اب کہ رہے ہو کھود کر گھر میں اپنے کوئی بات بنتے تو بنا تھا تمہارے گھر میں",
    translation: "Now that you're digging for faults in me,\nWhy didn't you build something when you were in my home?",
    explanation: "Faraz's sharp response to criticism from someone who should have contributed positively instead of finding faults. A lesson in constructive vs destructive behavior.",
    theme: "Relationships / Wisdom"
  },
  {
    poet: "Parveen Shakir",
    poetNameUrdu: "پروین شاکر",
    sher: "کہنی ہے مجھے آج کہاں سے شروع کروں\nتمہاری کہانی تو یہ ہے کہ ختم نہیں ہوتی",
    translation: "I wonder where to begin telling your story—\nFor your tale is one that never ends.",
    explanation: "Parveen Shakir's romantic expression of endless love. The beloved's story is so vast that words cannot contain it—a testament to profound affection.",
    theme: "Romance / Love"
  },
  {
    poet: "Jaun Elia",
    poetNameUrdu: "جون ایلیا",
    sher: "میں نے بڑی مشکل سے پایا ہے محبوب کو\nپھر بھی دل نہیں مانتا کہ وہ میرا نہیں",
    translation: "With great difficulty did I find my beloved,\nYet my heart still refuses that she is not mine.",
    explanation: "Elia's poignant expression of unrequited love—the heart's stubborn denial of reality despite all evidence. Captures the pain of love not returned.",
    theme: "Unrequited Love / Pain"
  }
];

const KEHWAR_COLLECTION: KehwarEntry[] = [
  {
    proverb: "کتاب دوست بہترین دوست ہے",
    meaning: "A book is the best friend",
    usage: "جب تم اکیلے محسوس کرتے ہو، کتاب پڑھو—کتاب دوست بہترین دوست ہے۔",
    origin: "Traditional wisdom about knowledge"
  },
  {
    proverb: "جھوٹا دن برقت نہیں ٹکتا",
    meaning: "A liar doesn't live long / Truth always prevails",
    usage: "سچائی کا راستہ چننا ہے کہ جھوٹا دن برقت نہیں ٹکتا۔",
    origin: "Ancient Punjabi-Urdu wisdom"
  },
  {
    proverb: "دیر آید درست آید",
    meaning: "Better late than never",
    usage: "تم آج آئے، خیر ہے—دیر آید درست آید۔",
    origin: "Persian-origin proverb common in Urdu"
  },
  {
    proverb: "نادان دوست سے دانا دشمن بہتر",
    meaning: "A wise enemy is better than a foolish friend",
    usage: "اس شخص سے دور رہو جو غلط راستے پر لے جائے—نادان دوست سے دانا دشمن بہتر۔",
    origin: "Classical wisdom literature"
  },
  {
    proverb: "ہاتھ کنگن سے آرائی ہے",
    meaning: "One must make effort to achieve goals",
    usage: "کامیابی خود حاصل نہیں ہوتی، محنت کرنی پڑتی ہے—ہاتھ کنگن سے آرائی ہے۔",
    origin: "Folk saying emphasizing hard work"
  },
  {
    proverb: "اولاق عقل بعد عمل",
    meaning: "First understanding, then action",
    usage: "کسی کام کو شروع کرنے سے پہلے سوچ لیں—اولاق عقل بعد عمل۔",
    origin: "Islamic philosophical tradition"
  }
];

const JUMLA_EXERCISES: JumlaExercise[] = [
  {
    id: 1,
    type: "complete",
    question: "جملے کو مکمل کریں: وہ _____ میں پڑھتا ہے۔",
    options: ["سکول", "گھر", "کتاب", "دوست"],
    correctAnswer: "سکول",
    explanation: "'سکول' درست جواب ہے کیونکہ وہاں پڑھا جاتا ہے۔"
  },
  {
    id: 2,
    type: "correct",
    question: "درست جملہ منتخب کریں:",
    options: ["میرے گھر چار دیوار ہے۔", "میرے گھر میں چار دیواریں ہیں۔", "میرے گھر چار دیواریں ہے۔", "میرے گھر میں چار دیوار ہیں۔"],
    correctAnswer: "میرے گھر میں چار دیواریں ہیں۔",
    explanation: "جملے میں 'میں' پیش کی جاتی ہے اور 'دیواریں' (جمع) کے ساتھ 'ہیں' آتا ہے۔"
  },
  {
    id: 3,
    type: "transform",
    question: "فعل حال سے ماضی میں تبدیل کریں: 'وہ کھیل رہا ہے۔'",
    options: ["وہ کھیلے گا۔", "وہ کھیل رہا تھا۔", "وہ کھیلے گا۔", "وہ کھیلتا ہے۔"],
    correctAnswer: "وہ کھیل رہا تھا۔",
    explanation: "حال کا جملہ ماضی میں 'رہا تھا' سے بدلتا ہے۔"
  },
  {
    id: 4,
    type: "tense",
    question: "یہ کونسا وقت ہے؟ 'میرے باپ نے کھانا کھایا۔'",
    options: ["حال", "ماضی مستقبل", "ماضی", "مستقبل"],
    correctAnswer: "ماضی",
    explanation: "'نے' اور 'یا' ماضی کی نشانیاں ہیں۔"
  },
  {
    id: 5,
    type: "complete",
    question: "خالی جگہ بھریں: آج _____ کا دن ہے۔",
    options: ["جمعہ", "ہفتہ", "اتوار", "پہل"],
    correctAnswer: "جمعہ",
    explanation: "دن کے نام استعمال ہوتے ہیں۔"
  },
  {
    id: 6,
    type: "correct",
    question: "غلطی درست کریں: 'مجھے کتاب چاہیے۔'",
    options: ["مجھے کتاب چاہیے۔ (صحیح)", "مجھ کو کتاب چاہیے۔", "میرے کو کتاب چاہیے۔", "مجھ کتاب چاہیے۔"],
    correctAnswer: "مجھے کتاب چاہیے۔ (صحیح)",
    explanation: "'مجھے' + 'چاہیے' درست ترکیب ہے۔"
  }
];

const MUHAVARA_COLLECTION: MuhavraEntry[] = [
  {
    muhavara: "آگ لگانا",
    meaning: "To provoke or incite someone",
    example: "تمہاری باتوں سے مجھے آگ لگی۔",
    englishEquivalent: "To add fuel to fire"
  },
  {
    muhavara: "پانی پانی ہونا",
    meaning: "To be extremely thirsty or eager",
    example: "مجھے علم کی پیاس ہے، دل پانی پانی ہو رہا ہے۔",
    englishEquivalent: "To be dying for something"
  },
  {
    muhavara: "دل بہلانا",
    meaning: "To console or comfort someone",
    example: "مجھے دل بہلاؤ، میں بہت اداس ہوں۔",
    englishEquivalent: "To cheer up"
  },
  {
    muhavara: "آنکھیں دکھنا",
    meaning: "To show off or be arrogant",
    example: "نئی گاڑی لے کر آنکھیں دکھا رہا ہے۔",
    englishEquivalent: "To show off / To put on airs"
  },
  {
    muhavara: "باٹھ سے batna",
    meaning: "To avoid work or responsibility",
    example: "کام سے باٹھ سے باتھ رہا ہے۔",
    englishEquivalent: "To shirk work"
  },
  {
    muhavara: "سر چڑھانا",
    meaning: "To annoy or irritate someone",
    example: "بچوں کی شور سے سر چڑھ گیا۔",
    englishEquivalent: "To get on someone's nerves"
  },
  {
    muhavara: "دل جینا",
    meaning: "To live happily or enjoy life",
    example: "دوستوں کے ساتھ دل جینا۔",
    englishEquivalent: "To enjoy life to the fullest"
  },
  {
    muhavara: "ہاتھ پیلنا",
    meaning: "To be empty-handed or fail",
    explanation: "محنتی کامیاب ہوتا ہے۔",
    englishEquivalent: "To come away empty-handed"
  }
];

const QAWAAD_RULES = [
  {
    title: "اسم (Noun)",
    titleUrdu: "اسم",
    rule: "وہ لفظ جو کسی شخص، جگہ، یا چیز کا نام بتائے",
    examples: ["لاہور", "محمد", "کتاب", "سکول"],
    color: "#3b82f6"
  },
  {
    title: "فعل (Verb)",
    titleUrdu: "فعل",
    rule: "وہ لفظ جو کسی کام کے کرنے یا ہونے کی حالت بتائے",
    examples: ["جانا", "کھانا", "لکھنا", "پڑھنا"],
    color: "#10b981"
  },
  {
    title: "صفت (Adjective)",
    titleUrdu: "صفت",
    rule: "وہ لفظ جو کسی اسم کی کیفیت یا صفات بیان کرے",
    examples: ["اچھا", "بڑا", "نیلا", "خوبصورت"],
    color: "#f59e0b"
  },
  {
    title: "ضمیر (Pronoun)",
    titleUrdu: "ضمیر",
    rule: "وہ لفظ جو اسم کی جگہ استعمال ہو",
    examples: ["ميں", "تو", "وہ", "ہم"],
    color: "#8b5cf6"
  },
  {
    title: "حرف جار (Preposition)",
    titleUrdu: "حرف جار",
    rule: "وہ لفظ جو کسی اسم سے پہلے آکر رشتہ ظاہر کرے",
    examples: ["کا", "کی", "ميں", "سے", "کو", "پر"],
    color: "#ef4444"
  },
  {
    title: "رابط (Conjunction)",
    titleUrdu: "رابط",
    rule: "وہ لفظ جو دو جملوں یا الفاظ کو جوڑے",
    examples: ["اور", "لیکن", "کہ", "یا", "که"],
    color: "#06b6d4"
  }
];

// ─── TAB CONFIGURATION ─────────────────────────────────────────────

const LAB_TABS: { id: LabTab; label: string; labelUrdu: string; icon: typeof BookOpen; color: string }[] = [
  { id: "lughat", label: "Vocabulary", labelUrdu: "لغت", icon: BookOpen, color: "#16a34a" },
  { id: "shayari", label: "Poetry", labelUrdu: "شاعری", icon: Heart, color: "#dc2626" },
  { id: "kehwar", label: "Proverbs", labelUrdu: "کہاوتیں", icon: Quote, color: "#ea580c" },
  { id: "jumla", label: "Sentences", labelUrdu: "جملے", icon: PenTool, color: "#7c3aed" },
  { id: "muhavare", label: "Idioms", labelUrdu: "محاورے", icon: MessageSquare, color: "#0891b2" },
  { id: "qawaid", label: "Grammar", labelUrdu: "قواعد", icon: Languages, color: "#4f46e5" },
];

// ─── MAIN COMPONENT ────────────────────────────────────────────────

interface UrduLabWidgetProps {
  subjectColor?: string;
  chapterTitle?: string;
}

export default function UrduLabWidget({ subjectColor = "#16a34a", chapterTitle }: UrduLabWidgetProps) {
  const [activeTab, setActiveTab] = useState<LabTab>("lughat");
  
  // Lughat state
  const [lughatIndex, setLughatIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);
  
  // Shayari state
  const [shayariIndex, setShayariIndex] = useState(0);
  
  // Jumla (Grammar) state
  const [jumlaState, setJumlaState] = useState<{ currentQ: number; score: number; answered: boolean; selectedAnswer: string | null }>({
    currentQ: 0, score: 0, answered: false, selectedAnswer: null
  });
  
  // Muhavare state
  const [muhavraIndex, setMuhavraIndex] = useState(0);

  const currentLughat = LUGHAT_BANK[lughatIndex % LUGHAT_BANK.length];
  const currentShayari = SHAYARI_COLLECTION[shayariIndex % SHAYARI_COLLECTION.length];
  const currentMuhavra = MUHAVARA_COLLECTION[muhavraIndex % MUHAVARA_COLLECTION.length];

  // ─── HANDLERS ────────────────────────────────────────────────────

  const handleJumlaAnswer = useCallback((answer: string) => {
    if (jumlaState.answered) return;
    const isCorrect = answer === JUMLA_EXERCISES[jumlaState.currentQ].correctAnswer;
    setJumlaState(prev => ({
      ...prev,
      answered: true,
      selectedAnswer: answer,
      score: isCorrect ? prev.score + 1 : prev.score
    }));
  }, [jumlaState]);

  const nextJumlaQuestion = useCallback(() => {
    setJumlaState(prev => ({
      ...prev,
      currentQ: (prev.currentQ + 1) % JUMLA_EXERCISES.length,
      answered: false,
      selectedAnswer: null
    }));
  }, []);

  // ─── RENDER HELPERS ──────────────────────────────────────────────

  const renderLughat = () => (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${((lughatIndex + 1) / LUGHAT_BANK.length) * 100}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-gray-500">{lughatIndex + 1}/{LUGHAT_BANK.length}</span>
      </div>

      {/* Main Card */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl p-6 border border-green-200 dark:border-green-800 text-center">
        {/* Word Display */}
        <div className="mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white dark:bg-gray-800 rounded-full text-xs font-medium text-green-600 dark:text-green-400 shadow-sm mb-3">
            <Sparkles className="w-3 h-3" /> {currentLughat.partOfSpeechUrdu}
          </div>
          
          {/* Urdu Word - Large */}
          <h3 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-2" style={{ fontFamily: "'Noto Nastaliq Urdu', serif", direction: 'rtl' }}>
            {currentLughat.urduWord}
          </h3>
          
          {/* Roman */}
          <p className="text-lg text-gray-600 dark:text-gray-400 italic">{currentLughat.word}</p>

          {/* Difficulty */}
          <div className="mt-2 flex justify-center gap-1">
            {["آسان", "متوسط", "مشکل"].map((level, i) => (
              <span key={level} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                currentLughat.difficulty === level
                  ? i === 0 ? 'bg-green-200 text-green-700' : i === 1 ? 'bg-yellow-200 text-yellow-700' : 'bg-red-200 text-red-700'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
              }`}>
                {level}
              </span>
            ))}
          </div>
        </div>

        {/* Meaning Toggle */}
        {!showMeaning ? (
          <button 
            onClick={() => setShowMeaning(true)}
            className="w-full mt-4 py-3 bg-white dark:bg-gray-800 rounded-xl text-sm font-semibold text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            معنی دیکھیں →
          </button>
        ) : (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 text-left" style={{ direction: 'rtl' }}>
            {/* Meanings */}
            <div className="bg-white/80 dark:bg-gray-800/80 rounded-xl p-4">
              <h4 className="font-bold text-sm text-green-700 dark:text-green-400 mb-2 flex items-center gap-2" style={{ direction: 'ltr' }}>
                <Lightbulb className="w-4 h-4" /> معنی (Meaning)
              </h4>
              <p className="text-base text-gray-800 dark:text-gray-200 leading-relaxed">{currentLughat.meaningUrdu}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 italic" style={{ direction: 'ltr' }}>({currentLughat.meaning})</p>
            </div>

            {/* Example */}
            <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 border-r-4 border-green-400">
              <p className="text-xs text-gray-500 mb-1 font-medium" style={{ direction: 'ltr' }}>مثال:</p>
              <p className="text-base text-gray-800 dark:text-gray-300 leading-relaxed">{currentLughat.exampleUrdu}</p>
            </div>

            {/* Synonyms */}
            <div className="bg-green-100/50 dark:bg-green-900/30 rounded-xl p-3">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-2" style={{ direction: 'ltr' }}>🔄 مترادفات (Synonyms):</p>
              <div className="flex flex-wrap gap-2 justify-end">
                {currentLughat.synonyms.map((syn) => (
                  <span key={syn} className="px-3 py-1 bg-white dark:bg-gray-800 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">
                    {syn}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => { setLughatIndex((prev) => (prev - 1 + LUGHAT_BANK.length) % LUGHAT_BANK.length); setShowMeaning(false); }}
          disabled={lughatIndex === 0}
          className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 disabled:opacity-40 text-sm font-medium transition-all"
        >
          ← پچھلا
        </button>
        
        <div className="flex gap-1.5">
          {LUGHAT_BANK.slice(0, Math.min(LUGHAT_BANK.length, 8)).map((_, i) => (
            <button
              key={i}
              onClick={() => { setLughatIndex(i); setShowMeaning(false); }}
              className={`w-2 h-2 rounded-full transition-all ${i === lughatIndex ? 'scale-150' : ''}`}
              style={{ backgroundColor: i === lughatIndex ? subjectColor : '#d1d5db' }}
            />
          ))}
        </div>

        <button
          onClick={() => { setLughatIndex((prev) => (prev + 1) % LUGHAT_BANK.length); setShowMeaning(false); }}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-all shadow-md hover:shadow-lg"
          style={{ backgroundColor: subjectColor }}
        >
          اگلا →
        </button>
      </div>
    </div>
  );

  const renderShayari = () => (
    <div className="space-y-4">
      {/* Poet Selector */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {SHAYARI_COLLECTION.map((sher, i) => (
          <button
            key={i}
            onClick={() => setShayariIndex(i)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              i === shayariIndex
                ? 'text-white shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
            }`}
            style={i === shayariIndex ? { backgroundColor: '#dc2626' } : {}}
          >
            {sher.poetNameUrdu.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Sher Card */}
      <div className="bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 rounded-2xl p-6 border border-red-200 dark:border-red-800">
        {/* Poet Info */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
            <Heart className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h4 className="font-bold text-gray-900 dark:text-white" style={{ direction: 'rtl' }}>{currentShayari.poetNameUrdu}</h4>
            <p className="text-xs text-gray-500">{currentShayari.poet}</p>
          </div>
          <span className="ml-auto px-2.5 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-full text-[10px] font-bold uppercase">
            {currentShayari.theme}
          </span>
        </div>

        {/* The Sher (Poetry) */}
        <div className="bg-white/70 dark:bg-gray-800/70 rounded-xl p-5 mb-4 border-l-4 border-red-400">
          <p className="text-xl md:text-2xl leading-loose text-gray-900 dark:text-white font-medium" 
             style={{ fontFamily: "'Noto Nastaliq Urdu', serif", direction: 'rtl', lineHeight: '2.2' }}>
            {currentShayari.sher}
          </p>
        </div>

        {/* Translation */}
        <div className="space-y-3">
          <details className="group">
            <summary className="cursor-pointer text-sm font-semibold text-red-600 dark:text-red-400 flex items-center gap-2 list-none">
              <ArrowRight className="w-4 h-4 group-open:rotate-90 transition-transform" />
              English Translation
            </summary>
            <p className="mt-2 pl-6 text-sm text-gray-600 dark:text-gray-400 italic leading-relaxed">
              {currentShayari.translation}
            </p>
          </details>

          <details className="group">
            <summary className="cursor-pointer text-sm font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-2 list-none">
              <Lightbulb className="w-4 h-4 group-open:rotate-90 transition-transform" />
              Explanation / تشریح
            </summary>
            <p className="mt-2 pl-6 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              {currentShayari.explanation}
            </p>
          </details>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setShayariIndex((prev) => (prev - 1 + SHAYARI_COLLECTION.length) % SHAYARI_COLLECTION.length)}
          className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 text-sm font-medium"
        >
          ← پچھلا شعر
        </button>
        <button
          onClick={() => setShayariIndex((prev) => (prev + 1) % SHAYARI_COLLECTION.length)}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: '#dc2626' }}
        >
          اگلا شعر →
        </button>
      </div>
    </div>
  );

  const renderKehwar = () => (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <Quote className="w-8 h-8 text-orange-500 mx-auto mb-2" />
        <h4 className="font-bold text-gray-900 dark:text-white">کہاوتیں اور محاورے</h4>
        <p className="text-xs text-gray-500">Pakistani Wisdom & Proverbs</p>
      </div>

      <div className="grid gap-3">
        {KEHWAR_COLLECTION.map((kehwar, i) => (
          <div 
            key={i} 
            className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-orange-100 dark:border-orange-900 hover:shadow-md transition-all"
          >
            <p className="text-lg font-bold text-gray-900 dark:text-white mb-2 text-right leading-relaxed" 
               style={{ fontFamily: "'Noto Nastaliq Urdu', serif", direction: 'rtl' }}>
              "{kehwar.proverb}"
            </p>
            
            <div className="border-t border-gray-100 dark:border-gray-700 pt-3 mt-2 space-y-2">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500">معنی (Meaning):</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{kehwar.meaning}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-2">
                <MessageSquare className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-gray-500">استعمال (Usage):</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 text-right" style={{ direction: 'rtl' }}>{kehwar.usage}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderJumla = () => {
    const q = JUMLA_EXERCISES[jumlaState.currentQ];
    const isCorrect = jumlaState.selectedAnswer === q.correctAnswer;

    return (
      <div className="space-y-4">
        {/* Score Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-violet-500 to-purple-500 rounded-xl p-4 text-white">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            <span className="font-bold">نتیجہ</span>
          </div>
          <span className="text-2xl font-black">{jumlaState.score}/{JUMLA_EXERCISES.length}</span>
          <div className="text-xs opacity-80">
            سوال {jumlaState.currentQ + 1} از {JUMLA_EXERCISES.length}
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          {/* Question Type Badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full text-xs font-semibold mb-3">
            <Target className="w-3 h-3" /> {q.type.toUpperCase()}
          </div>

          <h4 className="text-base font-bold text-gray-900 dark:text-white mb-4 leading-relaxed text-right" 
             style={{ direction: 'rtl' }}>
            {q.question}
          </h4>

          {/* Options */}
          <div className="space-y-2.5">
            {q.options?.map((option, i) => {
              let optionStyle = "border-gray-200 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20";
              
              if (jumlaState.answered) {
                if (option === q.correctAnswer) {
                  optionStyle = "border-green-400 bg-green-50 dark:bg-green-900/30";
                } else if (option === jumlaState.selectedAnswer && option !== q.correctAnswer) {
                  optionStyle = "border-red-400 bg-red-50 dark:bg-red-900/30";
                } else {
                  optionStyle = "opacity-50";
                }
              }

              return (
                <button
                  key={i}
                  onClick={() => handleJumlaAnswer(option)}
                  disabled={jumlaState.answered}
                  className={`w-full text-right px-4 py-3 rounded-xl border-2 transition-all flex items-center gap-3 ${optionStyle}`}
                  style={{ direction: 'rtl' }}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                    jumlaState.answered && option === q.correctAnswer
                      ? "bg-green-500 text-white"
                      : jumlaState.answered && option === jumlaState.selectedAnswer && option !== q.correctAnswer
                        ? "bg-red-500 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                  }`}>
                    {i + 1}
                  </span>
                  <span className={`text-sm font-medium ${jumlaState.answered && option === q.correctAnswer ? 'text-green-700 dark:text-green-300' : 'text-gray-700 dark:text-gray-300'}`}>
                    {option}
                  </span>
                  {jumlaState.answered && option === q.correctAnswer && (
                    <CheckCircle2 className="w-5 h-5 text-green-500 ml-auto shrink-0" />
                  )}
                  {jumlaState.answered && option === jumlaState.selectedAnswer && option !== q.correctAnswer && (
                    <XCircle className="w-5 h-5 text-red-500 ml-auto shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Explanation */}
          {jumlaState.answered && (
            <div className={`mt-4 p-4 rounded-xl ${isCorrect ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'}`}>
              <div className="flex items-start gap-2" style={{ direction: 'rtl' }}>
                {isCorrect ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <Lightbulb className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`font-semibold text-sm ${isCorrect ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                    {isCorrect ? '✅ صحیح!' : '📚 تشریح'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1" style={{ direction: 'rtl' }}>{q.explanation}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Next Button */}
        {jumlaState.answered && (
          <button
            onClick={nextJumlaQuestion}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
          >
            اگلا سوال <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  const renderMuhavare = () => (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-500">{muhavraIndex + 1}/{MUHAVARA_COLLECTION.length}</span>
        <span className="text-xs text-cyan-600 dark:text-cyan-400 font-medium">محاورہ #{muhavraIndex + 1}</span>
      </div>

      {/* Main Card */}
      <div className="bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-900/20 dark:to-sky-900/20 rounded-2xl p-6 border border-cyan-200 dark:border-cyan-800 text-center">
        {/* Muhavra Display */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 mb-4 inline-block w-full">
          <p className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2" 
             style={{ fontFamily: "'Noto Nastaliq Urdu', serif", direction: 'rtl' }}>
            {currentMuhavra.muhavara}
          </p>
          
          {currentMuhavra.englishEquivalent && (
            <p className="text-sm text-cyan-600 dark:text-cyan-400 italic">
              ({currentMuhavra.englishEquivalent})
            </p>
          )}
        </div>

        {/* Meaning */}
        <div className="bg-white/80 dark:bg-gray-800/80 rounded-xl p-4 text-left">
          <h5 className="font-bold text-sm text-cyan-700 dark:text-cyan-400 mb-2 flex items-center gap-2">
            <Lightbulb className="w-4 h-4" /> معنی (Meaning)
          </h5>
          <p className="text-gray-700 dark:text-gray-300">{currentMuhavra.meaning}</p>
        </div>

        {/* Example Usage */}
        <div className="mt-4 bg-cyan-100/50 dark:bg-cyan-900/30 rounded-xl p-4 border-r-4 border-cyan-400">
          <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-1 font-medium">مثال (Example):</p>
          <p className="text-base text-gray-800 dark:text-gray-200 text-right leading-relaxed" 
             style={{ direction: 'rtl', fontFamily: "'Noto Nastaliq Urdu', serif" }}>
            {currentMuhavra.example}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setMuhavraIndex((prev) => (prev - 1 + MUHAVARA_COLLECTION.length) % MUHAVARA_COLLECTION.length)}
          className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 text-sm font-medium"
        >
          ← پچھلا
        </button>
        <button
          onClick={() => setMuhavraIndex((prev) => (prev + 1) % MUHAVARA_COLLECTION.length)}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: '#0891b2' }}
        >
          اگلا →
        </button>
      </div>

      {/* All Muhavare Grid Preview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        {MUHAVARA_COLLECTION.map((m, i) => (
          <button
            key={i}
            onClick={() => setMuhavraIndex(i)}
            className={`p-2 rounded-lg text-xs font-medium transition-all truncate ${
              i === muhavraIndex
                ? 'bg-cyan-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            }`}
            style={{ direction: 'rtl' }}
          >
            {m.muhavara}
          </button>
        ))}
      </div>
    </div>
  );

  const renderQawaid = () => (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <Languages className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
        <h4 className="font-bold text-gray-900 dark:text-white">اردو قواعد</h4>
        <p className="text-xs text-gray-500">Urdu Grammar Rules</p>
      </div>

      <div className="grid gap-3">
        {QAWAAD_RULES.map((rule, i) => (
          <div 
            key={i} 
            className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all"
          >
            {/* Header */}
            <div 
              className="p-4 flex items-center gap-3"
              style={{ backgroundColor: rule.color + '15' }}
            >
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
                style={{ backgroundColor: rule.color }}
              >
                {i + 1}
              </div>
              <div>
                <h5 className="font-bold text-gray-900 dark:text-white">{rule.title}</h5>
                <p className="text-sm text-gray-600 dark:text-gray-400" style={{ direction: 'rtl' }}>{rule.titleUrdu}</p>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 pt-3 space-y-3">
              {/* Rule Definition */}
              <p className="text-sm text-gray-700 dark:text-gray-300 text-right leading-relaxed" style={{ direction: 'rtl' }}>
                {rule.rule}
              </p>

              {/* Examples */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">مثالیں (Examples):</p>
                <div className="flex flex-wrap gap-2 justify-end">
                  {rule.examples.map((ex, ei) => (
                    <span 
                      key={ei}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium text-right"
                      style={{ 
                        backgroundColor: rule.color + '20',
                        color: rule.color,
                        direction: 'rtl',
                        fontFamily: "'Noto Nastaliq Urdu', serif"
                      }}
                    >
                      {ex}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Quiz CTA */}
      <button 
        onClick={() => setActiveTab("jumla")}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
      >
        <Award className="w-5 h-5" /> Grammar Quiz کھیلیں
      </button>
    </div>
  );

  // ─── MAIN RENDER ──────────────────────────────────────────────────

  return (
    <div className="urdu-lab-widget">
      {/* Tab Navigation */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
        {LAB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === tab.id
                ? "text-white shadow-md scale-105"
                : "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
            style={activeTab === tab.id ? { backgroundColor: tab.color } : {}}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
            <span className="text-[10px] opacity-75 hidden sm:inline">{tab.labelUrdu}</span>
          </button>
        ))}
      </div>

      {/* Active Tab Content */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {activeTab === "lughat" && renderLughat()}
        {activeTab === "shayari" && renderShayari()}
        {activeTab === "kehwar" && renderKehwar()}
        {activeTab === "jumla" && renderJumla()}
        {activeTab === "muhavare" && renderMuhavare()}
        {activeTab === "qawaid" && renderQawaid()}
      </div>
    </div>
  );
}
