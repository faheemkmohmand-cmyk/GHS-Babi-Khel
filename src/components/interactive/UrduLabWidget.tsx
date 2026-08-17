/**
 * UrduLabWidget.tsx - Beautiful Interactive Urdu Learning Lab
 * 
 * FEATURES:
 * ✅ Vocabulary Builder (Urdu + Roman Urdu)
 * ✅ Poetry & Sher-o-Shaayari
 * ✅ Proverbs (Kahawatein)
 * ✅ Sentence Building (Jumla Banana)
 * ✅ Word Meanings (Lughat)
 * ✅ Beautiful RTL support & animations
 *
 * Usage: <UrduLabWidget subjectColor="#16a34a" />
 */
import { useState, useEffect } from "react";
import { 
  BookOpen, Volume2, CheckCircle2, XCircle, RotateCcw, 
  Sparkles, Trophy, Lightbulb, ArrowRight, Star,
  Heart, PenTool, MessageCircle, Languages
} from "lucide-react";

// ─── DATA: Urdu Vocabulary ──────────────────────────────────────────────

const URDU_VOCAB = [
  { urdu: "محبت", roman: "Mohabbat", meaning: "Love", example: "محبت ایک بہترین احساس ہے" },
  { urdu: "امید", roman: "Umeed", meaning: "Hope", example: "امید زندگی کی روشنی ہے" },
  { urdu: "حسین", roman: "Haseen", meaning: "Beautiful", example: "فطرت بڑی حسین ہے" },
  { urdu: "شجاعت", roman: "Shujaat", meaning: "Bravery", example: "شجاعت مردوں کا ثانی ہے" },
  { urdu: "علم", roman: "Ilm", meaning: "Knowledge", example: "علم روشنی ہے" },
  { urdu: "صبر", roman: "Sabr", meaning: "Patience", example: "صبر میں پھل شیرینی ہے" },
  { urdu: "دوست", roman: "Dost", meaning: "Friend", example: "دوست وقتِ مشکل میں کام آتا ہے" },
  { urdu: "خواب", roman: "Khwaab", meaning: "Dream", example: "خواب پورے کرنے کی کوشش جاری رکھو" },
];

// ─── DATA: Urdu Poetry (Sher) ─────────────────────────────────────────

const URDU_POETRY = [
  {
    sher: "ہم پریشان ہیں ، تمہارے afsos سے",
    poet: "Mirza Ghalib",
    translation: "We are troubled by your regrets",
    theme: "Love"
  },
  {
    sher: "دل سے جو بات نکلے ، دل پر لگ جائے",
    poet: "Bahadur Shah Zafar",
    translation: "Words from the heart touch the heart",
    theme: "Poetry"
  },
  {
    sher: "منزل کا پتہ دیں مجھے ، راستے نہیں دیکھے جاتے",
    poet: "Allama Iqbal",
    translation: "Show me the destination, I don't look at paths",
    theme: "Motivation"
  },
  {
    sher: "آباد ہو اگر میری محبت میں تیرے نام سے",
    poet: "Parveen Shakir",
    translation: "May my love flourish with your name",
    theme: "Romance"
  },
  {
    sher: "زندگی ہو تو عالمی مثلِ چمن ہو",
    poet: "Faiz Ahmed Faiz",
    translation: "If there is life, let it be like a garden",
    theme: "Life"
  },
  {
    sher: "چندھی ہوئی رات میں ستارے جلتے رہے",
    poet: "Ahmed Faraz",
    translation: "Stars keep shining in cloudy nights",
    theme: "Hope"
  },
];

// ─── DATA: Urdu Proverbs (Kahawatein) ──────────────────────────────────

const URDU_PROVERBS = [
  { proverb: "کتے بھونکتے ہیں، کاروان گزرتا رہا", meaning: "Ignore criticism and continue your work", usage: "When someone criticizes your efforts" },
  { proverb: "ہاتھی داؤں جیسے", meaning: "Empty vessels make more noise", usage: "For people who talk a lot but do little" },
  { proverb: "نا اُولیں دوسرے نہ تیسرے", meaning: "Third time's the charm / persistence pays off", usage: "When trying something repeatedly" },
  { proverb: "درنٹے کی موت امیر کے گھر", meaning: "A donkey dies in a rich man's house (unexpected fortune)", usage: "Unexpected good luck" },
  { proverb: "جیسی کرنی ویسا بھرنی", meaning: "As you sow, so shall you reap", usage: "Consequences of actions" },
  { proverb: "آہستہ آہستے صبح ہوگی", meaning: "Slowly slowly the morning will come (patience)", usage: "Encouraging patience" },
];

// ─── DATA: Sentence Building ───────────────────────────────────────────

const SENTENCE_PUZZLES = [
  { words: ["میرا", "نام", "علی", "ہے"], correct: "میرا نام علی ہے" },
  { words: ["آج", "موسم", "خوباں", "ہے"], correct: "آج موسم خوباں ہے" },
  { words: ["وہ", "اسکول", "جاتا", "ہے"], correct: "وہ اسکول جاتا ہے" },
  { words: ["ہم", "پڑھائی", "کرتے", "ہیں"], correct: "ہم پڑھائی کرتے ہیں" },
  { words: ["یہ", "کتاب", "بہت", "اچھی", "ہے"], correct: "یہ کتاب بہت اچھی ہے" },
];

// ─── TAB TYPES ─────────────────────────────────────────────────────────

type UrduTabType = "vocab" | "poetry" | "proverbs" | "sentence";

const URDU_TABS: { id: UrduTabType; label: string; icon: React.ReactNode; emoji: string }[] = [
  { id: "vocab", label: "Lughat", icon: <Languages className="w-4 h-4" />, emoji: "📖" },
  { id: "poetry", label: "Shaayari", icon: <PenTool className="w-4 h-4" />, emoji: "🖋️" },
  { id: "proverbs", label: "Kehwar", icon: <MessageCircle className="w-4 h-4" />, emoji: "💬" },
  { id: "sentence", label: "Jumla", icon: <BookOpen className="w-4 h-4" />, emoji: "✍️" },
];

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────

export default function UrduLabWidget({ subjectColor = "#16a34a" }: { subjectColor?: string }) {
  const [activeTab, setActiveTab] = useState<UrduTabType>("vocab");
  const [score, setScore] = useState(0);
  const [favorites, setFavorites] = useState<number[]>([]);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Header - Green Theme for Urdu */}
      <div className="flex items-center gap-2.5 p-3.5 border-b border-border bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/20">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm bg-white/80"
          style={{ backgroundColor: subjectColor + "25" }}>
          <span className="text-lg">اردو</span>
        </div>
        <div className="flex-1">
          <span className="font-bold text-sm text-foreground">اردو لبیریٹری</span>
          <p className="text-[10px] text-muted-foreground">Interactive Urdu Learning Lab</p>
        </div>
        
        {/* Score */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/40">
          <Star className="w-3.5 h-3.5 text-green-500 fill-green-500" />
          <span className="text-xs font-bold text-green-700 dark:text-green-300">{score}</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-2 bg-muted/30 overflow-x-auto">
        {URDU_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? "text-white shadow-md scale-105"
                : "bg-card hover:bg-secondary text-muted-foreground hover:text-foreground"
            }`}
            style={activeTab === tab.id ? { backgroundColor: subjectColor } : {}}
          >
            <span>{tab.emoji}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4 min-h-[350px]" dir="rtl">
        {activeTab === "vocab" && (
          <VocabTab 
            subjectColor={subjectColor} 
            onCorrect={() => setScore(s => s + 10)}
            favorites={favorites}
            setFavorites={setFavorites}
          />
        )}
        {activeTab === "poetry" && (
          <PoetryTab 
            subjectColor={subjectColor} 
            onFavorite={() => setScore(s => s + 5)}
            favorites={favorites}
            setFavorites={setFavorites}
          />
        )}
        {activeTab === "proverbs" && (
          <ProverbsTab 
            subjectColor={subjectColor} 
            onCorrect={() => setScore(s => s + 10)}
          />
        )}
        {activeTab === "sentence" && (
          <SentenceTab 
            subjectColor={subjectColor} 
            onCorrect={() => setScore(s => s + 15)}
          />
        )}
      </div>
    </div>
  );
}

// ─── VOCABULARY TAB ────────────────────────────────────────────────────

function VocabTab({ 
  subjectColor, 
  onCorrect,
  favorites,
  setFavorites
}: { 
  subjectColor: string;
  onCorrect: () => void;
  favorites: number[];
  setFavorites: React.Dispatch<React.SetStateAction<number[]>>;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);

  const word = URDU_VOCAB[currentIndex];
  const isFav = favorites.includes(currentIndex);

  const toggleFavorite = () => {
    if (isFav) {
      setFavorites(f => f.filter(i => i !== currentIndex));
    } else {
      setFavorites(f => [...f, currentIndex]);
      onCorrect();
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Progress */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground" dir="ltr">
        <span>Word {currentIndex + 1} of {URDU_VOCAB.length}</span>
        <button onClick={toggleFavorite} className={`p-1 rounded-full ${isFav ? 'text-red-500' : 'text-gray-300'}`}>
          <Heart className={`w-5 h-5 ${isFav ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* Flashcard */}
      <div 
        onClick={() => setShowMeaning(!showMeaning)}
        className={`relative w-full min-h-[180px] rounded-2xl p-6 cursor-pointer transition-all duration-500 ${
          showMeaning ? 'scale-[1.02]' : ''
        }`}
        style={{ 
          background: showMeaning 
            ? `linear-gradient(135deg, ${subjectColor}15, ${subjectColor}05)` 
            : `linear-gradient(135deg, #ffffff, #f0fdf4)`
        }}
      >
        {!showMeaning ? (
          /* Show Urdu word */
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Volume2 className="w-6 h-6 mb-3 text-muted-foreground" />
            <h3 className="text-4xl font-bold text-foreground" style={{ fontFamily: 'Noto Nastaliq Urdu, serif' }}>
              {word.urdu}
            </h3>
            <p className="text-sm text-muted-foreground mt-2 italic">{word.roman}</p>
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <Lightbulb className="w-3 h-3" /> ٹیپ کریں
            </p>
          </div>
        ) : (
          /* Show details */
          <div className="space-y-3 text-right">
            <h3 className="text-3xl font-bold text-center" style={{ color: subjectColor, fontFamily: 'Noto Nastaliq Urdu, serif' }}>
              {word.urdu}
            </h3>
            
            <div className="space-y-2 text-right">
              <p className="text-base"><strong>معنی:</strong> {word.meaning}</p>
              <p className="text-sm italic text-muted-foreground">"{word.example}"</p>
              <p className="text-xs text-muted-foreground"><strong>Roman:</strong> {word.roman}</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-2" dir="ltr">
        <button 
          onClick={() => { setShowMeaning(false); setCurrentIndex(i => i > 0 ? i - 1 : URDU_VOCAB.length - 1); }}
          className="flex-1 py-2.5 rounded-xl bg-secondary hover:bg-secondary/70 text-foreground text-sm font-medium"
        >
          ← Previous
        </button>
        <button 
          onClick={() => { setShowMeaning(false); setCurrentIndex(i => i < URDU_VOCAB.length - 1 ? i + 1 : 0); }}
          className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold shadow-md`}
          style={{ backgroundColor: subjectColor }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ─── POETRY TAB ──────────────────────────────────────────────────────────

function PoetryTab({ 
  subjectColor, 
  onFavorite,
  favorites,
  setFavorites
}: { 
  subjectColor: string;
  onFavorite: () => void;
  favorites: number[];
  setFavorites: React.Dispatch<React.SetStateAction<number[]>>;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);

  const poem = URDU_POETRY[currentIndex];
  const isFav = favorites.includes(currentIndex + 100); // Offset to differentiate from vocab

  return (
    <div className="space-y-4" dir="rtl">
      {/* Poem Card */}
      <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 dark:from-purple-950/20 dark:via-pink-950/20 dark:to-rose-950/20 border border-purple-200 dark:border-purple-800">
        {/* Decorative elements */}
        <div className="absolute top-2 left-2 opacity-10">
          <PenTool className="w-12 h-12 text-purple-500" />
        </div>
        
        {/* Theme badge */}
        <div className="inline-block px-2 py-1 rounded-full bg-white/60 backdrop-blur-sm text-[10px] font-medium text-purple-600 mb-3">
          {poem.theme}
        </div>

        {/* The Sher (Verse) */}
        <p className="text-xl sm:text-2xl leading-relaxed font-bold text-foreground mb-4" 
           style={{ fontFamily: 'Noto Nastaliq Urdu, serif', direction: 'rtl' }}>
          {poem.sher}
        </p>

        {/* Poet name */}
        <p className="text-sm text-muted-foreground text-left" dir="ltr">
          — {poet}
        </p>

        {/* Favorite button */}
        <button
          onClick={() => {
            if (!isFav) onFavorite();
            setFavorites(f => f.includes(currentIndex + 100) 
              ? f.filter(i => i !== currentIndex + 100) 
              : [...f, currentIndex + 100]
            );
          }}
          className={`absolute bottom-3 right-3 p-2 rounded-full transition-colors ${
            isFav ? 'bg-red-100 text-red-500' : 'bg-white/60 text-gray-400'
          }`}
        >
          <Heart className={`w-5 h-5 ${isFav ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* Translation Toggle */}
      <button
        onClick={() => setShowTranslation(!showTranslation)}
        className="w-full py-2.5 rounded-xl bg-secondary hover:bg-secondary/70 text-foreground text-sm font-medium flex items-center justify-center gap-2"
      >
        <Languages className="w-4 h-4" />
        {showTranslation ? 'Hide Translation' : 'Show English Translation'}
      </button>

      {/* Translation */}
      {showTranslation && (
        <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 animate-in fade-in slide-in-from-top-2 duration-300">
          <p className="text-sm text-blue-800 dark:text-blue-200 italic text-center">
            "{poem.translation}"
          </p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-2" dir="ltr">
        <button 
          onClick={() => { setShowTranslation(false); setCurrentIndex(i => i > 0 ? i - 1 : URDU_POETRY.length - 1); }}
          className="flex-1 py-2 rounded-xl bg-secondary hover:bg-secondary/70 text-foreground text-sm"
        >
          ◀ Previous
        </button>
        <button 
          onClick={() => { setShowTranslation(false); setCurrentIndex(i => i < URDU_POETRY.length - 1 ? i + 1 : 0); }}
          className="flex-1 py-2 rounded-xl text-white text-sm font-semibold shadow-md"
          style={{ backgroundColor: subjectColor }}
        >
          Next ▶
        </button>
      </div>
      
      <p className="text-[10px] text-muted-foreground text-center" dir="ltr">
        Sher {currentIndex + 1} of {URDU_POETRY.length}
      </p>
    </div>
  );
}

// ─── PROVERBS TAB ───────────────────────────────────────────────────────

function ProverbsTab({ 
  subjectColor, 
  onCorrect 
}: { 
  subjectColor: string;
  onCorrect: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);
  const [guessed, setGuessed] = useState(false);

  const proverb = URDU_PROVERBS[currentIndex];

  const handleGuess = () => {
    setGuessed(true);
    setShowMeaning(true);
    onCorrect();
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Proverb Card */}
      <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200 dark:border-amber-800">
        <div className="absolute top-2 right-2 opacity-10">
          <MessageCircle className="w-12 h-12 text-amber-500" />
        </div>

        <p className="text-xl sm:text-2xl leading-relaxed font-bold text-foreground text-center" 
           style={{ fontFamily: 'Noto Nastaliq Urdu, serif' }}>
          {proverb.proverb}
        </p>
      </div>

      {/* Guess Button */}
      {!showMeaning && (
        <button
          onClick={handleGuess}
          className={`w-full py-3 rounded-xl text-white font-semibold shadow-md flex items-center justify-center gap-2`}
          style={{ backgroundColor: subjectColor }}
        >
          <Lightbulb className="w-5 h-5" />
          معنی دیکھیں (See Meaning)
        </button>
      )}

      {/* Meaning Display */}
      {showMeaning && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
            <h4 className="text-sm font-bold text-green-800 dark:text-green-200 mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> معنی (Meaning)
            </h4>
            <p className="text-sm text-green-700 dark:text-green-300">{proverb.meaning}</p>
          </div>
          
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <h4 className="text-sm font-bold text-blue-800 dark:text-blue-200 mb-2">استعمال (Usage)</h4>
            <p className="text-sm text-blue-700 dark:text-blue-300">{proverb.usage}</p>
          </div>
        </div>
      )}

      {/* Next Button */}
      {showMeaning && (
        <button
          onClick={() => { 
            setShowMeaning(false); 
            setGuessed(false); 
            setCurrentIndex(i => i < URDU_PROVERBS.length - 1 ? i + 1 : 0); 
          }}
          className={`w-full py-2.5 rounded-xl text-white text-sm font-semibold shadow-md`}
          style={{ backgroundColor: subjectColor }}
        >
          اگلا محاورہ → (Next Proverb)
        </button>
      )}

      <p className="text-[10px] text-muted-foreground text-center" dir="ltr">
        Kehwar {currentIndex + 1} of {URDU_PROVERBS.length}
      </p>
    </div>
  );
}

// ─── SENTENCE BUILDING TAB ──────────────────────────────────────────────

function SentenceTab({ 
  subjectColor, 
  onCorrect 
}: { 
  subjectColor: string;
  onCorrect: () => void;
}) {
  const [currentPuzzle, setCurrentPuzzle] = useState(0);
  const [shuffledWords, setShuffledWords] = useState<string[]>([]);
  const [userOrder, setUserOrder] = useState<string[]>([]);
  const [result, setResult] = useState<"correct" | null>(null);

  const puzzle = SENTENCE_PUZZLES[currentPuzzle];

  // Initialize
  useEffect(() => {
    const shuffled = [...puzzle.words].sort(() => Math.random() - 0.5);
    setShuffledWords(shuffled);
    setUserOrder([]);
    setResult(null);
  }, [currentPuzzle]);

  const addWord = (word: string) => {
    setUserOrder([...userOrder, word]);
    setShuffledWords(shuffledWords.filter(w => w !== word));
  };

  const removeWord = (word: string) => {
    setUserOrder(userOrder.filter(w => w !== word));
    setShuffledWords([word, ...shuffledWords]);
  };

  const checkSentence = () => {
    if (userOrder.join(" ") === puzzle.correct) {
      setResult("correct");
      onCorrect();
    } else {
      setResult(null); // Try again
    }
  };

  const nextPuzzle = () => {
    if (currentPuzzle < SENTENCE_PUZZLES.length - 1) {
      setCurrentPuzzle(p => p + 1);
    } else {
      setCurrentPuzzle(0);
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Instructions */}
      <p className="text-xs text-muted-foreground text-center">
        الفاظ درست ترتیب میں رکھیں (Arrange words in correct order)
      </p>

      {/* User's sentence area */}
      <div className="min-h-[70px] p-4 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-wrap gap-2 content-center">
        {userOrder.length === 0 ? (
          <p className="text-sm text-muted-foreground w-full text-center">یہاں کلک کریں...</p>
        ) : (
          userOrder.map((word, index) => (
            <button
              key={`${word}-${index}`}
              onClick={() => removeWord(word)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-white shadow-sm transition-all animate-in fade-in"
              style={{ backgroundColor: subjectColor }}
            >
              {word}
            </button>
          ))
        )}
      </div>

      {/* Available words */}
      <div className="flex flex-wrap gap-2 justify-center" dir="rtl">
        {shuffledWords.map((word) => (
          <button
            key={word}
            onClick={() => addWord(word)}
            className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-sm font-medium text-foreground transition-all hover:scale-105"
          >
            {word}
          </button>
        ))}
      </div>

      {/* Check button */}
      <button
        onClick={checkSentence}
        disabled={userOrder.length !== puzzle.words.length}
        className={`w-full py-3 rounded-xl text-white font-semibold shadow-md disabled:opacity-50 flex items-center justify-center gap-2`}
        style={{ backgroundColor: subjectColor }}
      >
        <CheckCircle2 className="w-5 h-5" />
        چیک کریں (Check)
      </button>

      {/* Success message */}
      {result === "correct" && (
        <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-center animate-in zoom-in duration-300">
          <Trophy className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
          <p className="text-lg font-bold text-green-800 dark:text-green-200">شاباش! 🎉</p>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">{puzzle.correct}</p>
          
          <button
            onClick={nextPuzzle}
            className="mt-3 px-6 py-2 rounded-xl text-white font-semibold"
            style={{ backgroundColor: subjectColor }}
          >
            اگلا (Next) →
          </button>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center" dir="ltr">
        Jumla {currentPuzzle + 1} of {SENTENCE_PUZZLES.length}
      </p>
    </div>
  );
}
