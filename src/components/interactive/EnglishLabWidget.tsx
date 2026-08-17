/**
 * EnglishLabWidget.tsx - Beautiful Interactive English Learning Lab
 * 
 * FEATURES:
 * ✅ Vocabulary Builder with flashcards
 * ✅ Grammar Quiz (parts of speech, tenses)
 * ✅ Word Scramble Game
 * ✅ Synonyms & Antonyms
 * ✅ Sentence Builder
 * ✅ Beautiful animations and responsive design
 *
 * Usage: <EnglishLabWidget subjectColor="#3b82f6" />
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { 
  BookOpen, Volume2, CheckCircle2, XCircle, RotateCcw, 
  Sparkles, Trophy, Lightbulb, ArrowRight, Star,
  Type, MessageSquare, Shuffle, Brain
} from "lucide-react";

// ─── DATA: Vocabulary Words ──────────────────────────────────────────────

const VOCAB_WORDS = [
  { word: "Ephemeral", meaning: "Lasting for a very short time", example: "The ephemeral beauty of cherry blossoms", synonym: "Fleeting", antonym: "Permanent" },
  { word: "Ubiquitous", meaning: "Present everywhere at the same time", example: "Smartphones have become ubiquitous in modern life", synonym: "Omnipresent", antonym: "Rare" },
  { word: "Meticulous", meaning: "Showing great attention to detail", example: "She was meticulous in her research", synonym: "Careful", antonym: "Careless" },
  { word: "Resilient", meaning: "Able to recover quickly from difficulties", example: "Children are remarkably resilient", synonym: "Tough", antonym: "Fragile" },
  { word: "Pragmatic", meaning: "Dealing with things sensibly and realistically", example: "We need a pragmatic approach to this problem", synonym: "Practical", antonym: "Idealistic" },
  { word: "Ambiguous", meaning: "Open to more than one interpretation", example: "The ending of the movie was ambiguous", synonym: "Unclear", antonym: "Clear" },
  { word: "Candid", meaning: "Truthful and straightforward", example: "I appreciate your candid feedback", synonym: "Frank", antonym: "Deceptive" },
  { word: "Eloquent", meaning: "Fluent or persuasive in speaking or writing", example: "She gave an eloquent speech", synonym: "Articulate", antonym: "Inarticulate" },
];

// ─── DATA: Grammar Questions ─────────────────────────────────────────────

const GRAMMAR_QUESTIONS = [
  { question: "Choose the correct form: She ___ to school every day.", options: ["go", "goes", "going", "gone"], correct: 1, explanation: "Third person singular uses 'goes'" },
  { question: "Identify the verb: 'The cat sleeps on the mat.'", options: ["The", "cat", "sleeps", "mat"], correct: 2, explanation: "'sleeps' is the action word (verb)" },
  { question: "Which is a compound sentence?", options: ["I like tea.", "I like tea and she likes coffee.", "Because I was tired.", "Running fast!"], correct: 1, explanation: "Compound sentences join two independent clauses" },
  { question: "Choose the past tense of 'write':", options: ["writed", "wrote", "written", "writing"], correct: 1, explanation: "'Write' is an irregular verb; past tense is 'wrote'" },
  { question: "Identify the adjective: 'The red car is fast.'", options: ["car", "red", "is", "fast"], correct: 1, explanation: "'Red' describes the noun 'car'" },
  { question: "Complete: If it ___, I will stay home.", options: ["rain", "rains", "will rain", "rained"], correct: 0, explanation: "First conditional: present simple after 'if'" },
];

// ─── DATA: Scrambled Words ───────────────────────────────────────────────

const SCRAMBLED_WORDS = [
  { original: "BEAUTIFUL", scrambled: "UITFBAEUL" },
  { original: "KNOWLEDGE", scrambled: "WLEDGENOK" },
  { original: "ADVENTURE", scrambled: "RUTEVEDAN" },
  { original: "LANGUAGE", scrambled: "GUAANELG" },
  { original: "WONDERFUL", scrambled: "DERFLONWO" },
  { original: "CHALLENGE", scrambled: "LEGNHECAL" },
  { original: "DISCOVER", scrambled: "COVISREDR" },
  { original: "PARAGRAPH", scrambled: "RAPAGRAH" },
];

// ─── TAB TYPES ─────────────────────────────────────────────────────────

type TabType = "vocab" | "grammar" | "scramble" | "sentence";

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: "vocab", label: "Vocabulary", icon: <BookOpen className="w-4 h-4" /> },
  { id: "grammar", label: "Grammar", icon: <MessageSquare className="w-4 h-4" /> },
  { id: "scramble", label: "Word Play", icon: <Shuffle className="w-4 h-4" /> },
  { id: "sentence", label: "Builder", icon: <Type className="w-4 h-4" /> },
];

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────

export default function EnglishLabWidget({ subjectColor = "#3b82f6" }: { subjectColor?: string }) {
  const [activeTab, setActiveTab] = useState<TabType>("vocab");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);

  // Shared state for all tabs
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2.5 p-3.5 border-b border-border bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm bg-white/80"
          style={{ backgroundColor: subjectColor + "25" }}>
          <BookOpen className="w-4.5 h-4.5" style={{ color: subjectColor }} />
        </div>
        <div className="flex-1">
          <span className="font-bold text-sm text-foreground">English Learning Lab</span>
          <p className="text-[10px] text-muted-foreground">Interactive vocabulary & grammar</p>
        </div>
        
        {/* Score Display */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/40">
            <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
            <span className="text-xs font-bold text-yellow-700 dark:text-yellow-300">{score}</span>
          </div>
          {streak >= 3 && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-100 dark:bg-orange-900/40 animate-pulse">
              <Sparkles className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-xs font-bold text-orange-700 dark:text-orange-300">{streak}🔥</span>
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-2 bg-muted/30 overflow-x-auto">
        {TABS.map((tab) => (
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
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4 min-h-[350px]">
        {activeTab === "vocab" && (
          <VocabularyTab 
            subjectColor={subjectColor} 
            onCorrect={() => { setScore(s => s + 10); setStreak(s => s + 1); }}
            onWrong={() => setStreak(0)}
          />
        )}
        {activeTab === "grammar" && (
          <GrammarTab 
            subjectColor={subjectColor} 
            onCorrect={() => { setScore(s => s + 15); setStreak(s => s + 1); }}
            onWrong={() => setStreak(0)}
          />
        )}
        {activeTab === "scramble" && (
          <ScrambleTab 
            subjectColor={subjectColor} 
            onCorrect={() => { setScore(s => s + 5); setStreak(s => s + 1); }}
            onWrong={() => setStreak(0)}
          />
        )}
        {activeTab === "sentence" && (
          <SentenceTab 
            subjectColor={subjectColor} 
            onCorrect={() => { setScore(s => s + 20); setStreak(s => s + 1); }}
            onWrong={() => setStreak(0)}
          />
        )}
      </div>
    </div>
  );
}

// ─── VOCABULARY TAB COMPONENT ───────────────────────────────────────────

function VocabularyTab({ 
  subjectColor, 
  onCorrect, 
  onWrong 
}: { 
  subjectColor: string; 
  onCorrect: () => void; 
  onWrong: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);
  const [flipped, setFlipped] = useState(false);
  
  const word = VOCAB_WORDS[currentIndex];
  const isLastWord = currentIndex === VOCAB_WORDS.length - 1;

  const nextWord = () => {
    setShowMeaning(false);
    setFlipped(false);
    if (isLastWord) setCurrentIndex(0);
    else setCurrentIndex(i => i + 1);
  };

  const prevWord = () => {
    setShowMeaning(false);
    setFlipped(false);
    if (currentIndex === 0) setCurrentIndex(VOCAB_WORDS.length - 1);
    else setCurrentIndex(i => i - 1);
  };

  const handleKnow = () => {
    setFlipped(true);
    setShowMeaning(true);
    onCorrect();
  };

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Word {currentIndex + 1} of {VOCAB_WORDS.length}</span>
        <span>{Math.round(((currentIndex + 1) / VOCAB_WORDS.length) * 100)}% complete</span>
      </div>

      {/* Flashcard */}
      <div 
        onClick={() => setFlipped(!flipped)}
        className={`relative w-full min-h-[180px] rounded-2xl p-6 cursor-pointer transition-all duration-500 transform-gpu preserve-3d ${flipped ? 'scale-[1.02]' : ''}`}
        style={{ 
          background: flipped 
            ? `linear-gradient(135deg, ${subjectColor}15, ${subjectColor}05)` 
            : `linear-gradient(135deg, #ffffff, #f8fafc)`
        }}
      >
        {/* Decorative corner */}
        <div className="absolute top-3 right-3 opacity-20">
          <Brain className="w-8 h-8" style={{ color: subjectColor }} />
        </div>

        {!flipped ? (
          /* Front of card - Show word */
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Volume2 className="w-6 h-6 mb-3 text-muted-foreground" />
            <h3 className="text-3xl sm:text-4xl font-bold text-foreground tracking-wide" style={{ fontFamily: 'Georgia, serif' }}>
              {word.word}
            </h3>
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <Lightbulb className="w-3 h-3" /> Tap to reveal
            </p>
          </div>
        ) : (
          /* Back of card - Show details */
          <div className="space-y-3">
            <div className="text-center">
              <h3 className="text-2xl font-bold" style={{ color: subjectColor }}>{word.word}</h3>
            </div>
            
            <div className="space-y-2">
              <p className="text-sm text-foreground"><strong>Meaning:</strong> {word.meaning}</p>
              <p className="text-xs italic text-muted-foreground">"{word.example}"</p>
              
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/30 text-center">
                  <p className="text-[10px] text-green-600 dark:text-green-400">Synonym</p>
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">{word.synonym}</p>
                </div>
                <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-center">
                  <p className="text-[10px] text-red-600 dark:text-red-400">Antonym</p>
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">{word.antonym}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button 
          onClick={(e) => { e.stopPropagation(); prevWord(); }}
          className="flex-1 py-2.5 rounded-xl bg-secondary hover:bg-secondary/70 text-foreground text-sm font-medium transition-all"
        >
          ← Previous
        </button>
        {!showMeaning ? (
          <button 
            onClick={(e) => { e.stopPropagation(); handleKnow(); }}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all shadow-md hover:opacity-90`}
            style={{ backgroundColor: subjectColor }}
          >
            I Know It ✓
          </button>
        ) : (
          <button 
            onClick={(e) => { e.stopPropagation(); nextWord(); }}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all shadow-md hover:opacity-90`}
            style={{ backgroundColor: subjectColor }}
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── GRAMMAR QUIZ COMPONENT ─────────────────────────────────────────────

function GrammarTab({ 
  subjectColor, 
  onCorrect, 
  onWrong 
}: { 
  subjectColor: string; 
  onCorrect: () => void; 
  onWrong: () => void;
}) {
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  const question = GRAMMAR_QUESTIONS[currentQ];
  const isLastQ = currentQ === GRAMMAR_QUESTIONS.length - 1;

  const handleAnswer = (index: number) => {
    if (showResult) return;
    
    setSelected(index);
    setShowResult(true);
    
    if (index === question.correct) {
      onCorrect();
      setCorrectCount(c => c + 1);
    } else {
      onWrong();
    }
  };

  const nextQuestion = () => {
    setSelected(null);
    setShowResult(false);
    if (isLastQ) {
      setCurrentQ(0);
      setCorrectCount(0);
    } else {
      setCurrentQ(q => q + 1);
    }
  };

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Question {currentQ + 1}/{GRAMMAR_QUESTIONS.length}</span>
        <span className="text-xs font-medium" style={{ color: subjectColor }}>✓ {correctCount} correct</span>
      </div>

      {/* Question Card */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border border-border">
        <p className="text-sm sm:text-base font-medium text-foreground leading-relaxed">
          {question.question}
        </p>
      </div>

      {/* Options Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {question.options.map((option, index) => {
          let buttonStyle = "bg-card hover:bg-secondary border-border text-foreground";
          
          if (showResult) {
            if (index === question.correct) {
              buttonStyle = "bg-green-100 dark:bg-green-950/40 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200";
            } else if (index === selected && index !== question.correct) {
              buttonStyle = "bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200";
            } else {
              buttonStyle = "bg-muted/50 border-border text-muted-foreground opacity-60";
            }
          }

          return (
            <button
              key={index}
              onClick={() => handleAnswer(index)}
              disabled={showResult}
              className={`p-3 rounded-xl border text-left text-sm font-medium transition-all ${buttonStyle} ${
                !showResult ? 'hover:scale-[1.02] active:scale-[0.98]' : ''
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-background flex items-center justify-center text-xs font-bold shrink-0">
                  {String.fromCharCode(65 + index)}
                </span>
                {option}
              </span>
              {showResult && index === question.correct && (
                <CheckCircle2 className="w-4 h-4 ml-auto text-green-600 shrink-0" />
              )}
              {showResult && index === selected && index !== question.correct && (
                <XCircle className="w-4 h-4 ml-auto text-red-600 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Explanation */}
      {showResult && (
        <div className={`p-3 rounded-xl border animate-in fade-in slide-in-from-bottom-2 duration-300 ${
          selected === question.correct 
            ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
            : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
        }`}>
          <p className="text-xs font-medium flex items-start gap-2">
            <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" style={{ color: selected === question.correct ? '#16a34a' : '#d97706' }} />
            <span>{question.explanation}</span>
          </p>
        </div>
      )}

      {/* Next Button */}
      {showResult && (
        <button
          onClick={nextQuestion}
          className={`w-full py-3 rounded-xl text-white font-semibold transition-all shadow-md hover:opacity-90 flex items-center justify-center gap-2`}
          style={{ backgroundColor: subjectColor }}
        >
          {isLastQ ? 'Start Over' : 'Next Question'}
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ─── WORD SCRAMBLE COMPONENT ─────────────────────────────────────────────

function ScrambleTab({ 
  subjectColor, 
  onCorrect, 
  onWrong 
}: { 
  subjectColor: string; 
  onCorrect: () => void; 
  onWrong: () => void;
}) {
  const [currentWord, setCurrentWord] = useState(0);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);

  const wordData = SCRAMBLED_WORDS[currentWord];
  const isLastWord = currentWord === SCRAMBLED_WORDS.length - 1;

  const checkAnswer = () => {
    if (input.toUpperCase() === wordData.original) {
      setResult("correct");
      onCorrect();
    } else {
      setResult("wrong");
      onWrong();
    }
  };

  const showHint = () => {
    if (!input) {
      setInput(wordData.original[0]);
      setHintsUsed(h => h + 1);
    }
  };

  const nextWord = () => {
    setInput("");
    setResult(null);
    if (isLastWord) setCurrentWord(0);
    else setCurrentWord(w => w + 1);
  };

  // Auto-check on enter
  useEffect(() => {
    if (input.length >= wordData.original.length && !result) {
      checkAnswer();
    }
  }, [input]);

  return (
    <div className="space-y-4">
      {/* Word Display */}
      <div className="text-center p-6 rounded-xl bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border border-dashed border-purple-200 dark:border-purple-800">
        <Shuffle className="w-8 h-8 mx-auto mb-3 text-purple-500 animate-bounce" />
        <p className="text-2xl sm:text-3xl font-mono font-bold tracking-[0.3em] text-foreground select-none">
          {wordData.scrambled}
        </p>
        <p className="text-xs text-muted-foreground mt-2">Unscramble this word!</p>
      </div>

      {/* Input Area */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Your Answer</label>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && input && checkAnswer()}
            placeholder="Type your answer..."
            maxLength={wordData.original.length}
            className="flex-1 px-4 py-3 rounded-xl bg-background border border-border text-lg font-mono font-bold tracking-wider text-center uppercase focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
            disabled={!!result}
          />
          {!result && (
            <button
              onClick={checkAnswer}
              disabled={!input}
              className="px-5 py-3 rounded-xl text-white font-semibold disabled:opacity-50 transition-all"
              style={{ backgroundColor: subjectColor }}
            >
              Check
            </button>
          )}
        </div>
      </div>

      {/* Result Feedback */}
      {result && (
        <div className={`p-4 rounded-xl text-center animate-in zoom-in duration-300 ${
          result === "correct" 
            ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' 
            : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
        }`}>
          {result === "correct" ? (
            <>
              <Trophy className="w-10 h-10 mx-auto mb-2 text-yellow-500" />
              <p className="text-lg font-bold text-green-800 dark:text-green-200">🎉 Correct!</p>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">{wordData.original}</p>
            </>
          ) : (
            <>
              <XCircle className="w-10 h-10 mx-auto mb-2 text-red-500" />
              <p className="text-lg font-bold text-red-800 dark:text-red-200">Not quite!</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                The answer was: <strong>{wordData.original}</strong>
              </p>
            </>
          )}
          
          <button
            onClick={nextWord}
            className={`mt-3 px-6 py-2 rounded-xl text-white font-semibold transition-all`}
            style={{ backgroundColor: subjectColor }}
          >
            {isLastWord ? 'Start Over' : 'Next Word →'}
          </button>
        </div>
      )}

      {/* Hint Button */}
      {!result && (
        <button
          onClick={showHint}
          className="w-full py-2 rounded-xl bg-amber-50 dark:amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-sm font-medium hover:bg-amber-100 dark:hover:amber-900/40 transition-colors flex items-center justify-center gap-2"
        >
          <Lightbulb className="w-4 h-4" /> Show First Letter ({hintsUsed} used)
        </button>
      )}

      {/* Stats */}
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Word {currentWord + 1} of {SCRAMBLED_WORDS.length}</span>
        <span>Hints used: {hintsUsed}</span>
      </div>
    </div>
  );
}

// ─── SENTENCE BUILDER COMPONENT ──────────────────────────────────────────

function SentenceTab({ 
  subjectColor, 
  onCorrect, 
  onWrong 
}: { 
  subjectColor: string; 
  onCorrect: () => void; 
  onWrong: () => void;
}) {
  const sentences = [
    { words: ["The", "quick", "brown", "fox", "jumps", "over", "lazy", "dog"], correct: "The quick brown fox jumps over lazy dog" },
    { words: ["She", "reads", "books", "every", "day"], correct: "She reads books every day" },
    { words: ["My", "brother", "plays", "football", "well"], correct: "My brother plays football well" },
    { words: ["We", "went", "to", "the", "park", "yesterday"], correct: "We went to the park yesterday" },
  ];

  const [currentSentence, setCurrentSentence] = useState(0);
  const [shuffledWords, setShuffledWords] = useState<string[]>([]);
  const [userOrder, setUserOrder] = useState<string[]>([]);

  const sentenceData = sentences[currentSentence];

  // Initialize shuffled words when sentence changes
  useEffect(() => {
    const shuffled = [...sentenceData.words].sort(() => Math.random() - 0.5);
    setShuffledWords(shuffled);
    setUserOrder([]);
  }, [currentSentence]);

  const addToUserOrder = (word: string) => {
    setUserOrder([...userOrder, word]);
    setShuffledWords(shuffledWords.filter(w => w !== word));
  };

  const removeFromUserOrder = (word: string) => {
    setUserOrder(userOrder.filter(w => w !== word));
    setShuffledWords([word, ...shuffledWords]);
  };

  const checkSentence = () => {
    const userSentence = userOrder.join(" ");
    if (userSentence === sentenceData.correct) {
      onCorrect();
    } else {
      onWrong();
    }
  };

  const resetSentence = () => {
    if (currentSentence < sentences.length - 1) {
      setCurrentSentence(s => s + 1);
    } else {
      setCurrentSentence(0);
    }
  };

  const isCorrect = userOrder.join(" ") === sentenceData.correct;

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <p className="text-xs text-muted-foreground text-center">
        Tap words in order to build the correct sentence
      </p>

      {/* User's Sentence Area */}
      <div className="min-h-[70px] p-4 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-wrap gap-2 content-center">
        {userOrder.length === 0 ? (
          <p className="text-sm text-muted-foreground w-full text-center">Tap words below to build sentence...</p>
        ) : (
          userOrder.map((word, index) => (
            <button
              key={`${word}-${index}`}
              onClick={() => removeFromUserOrder(word)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-white shadow-sm hover:shadow-md transition-all animate-in fade-in slide-in-from-bottom-1 duration-200"
              style={{ backgroundColor: subjectColor }}
            >
              {word}
            </button>
          ))
        )}
      </div>

      {/* Available Words */}
      <div className="flex flex-wrap gap-2 justify-center">
        {shuffledWords.map((word) => (
          <button
            key={word}
            onClick={() => addToUserOrder(word)}
            className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 border border-border text-sm font-medium text-foreground transition-all hover:scale-105 active:scale-95"
          >
            {word}
          </button>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={resetSentence}
          className="flex-1 py-2.5 rounded-xl bg-secondary hover:bg-secondary/70 text-foreground text-sm font-medium transition-all flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" /> Skip
        </button>
        <button
          onClick={checkSentence}
          disabled={userOrder.length === 0 || userOrder.length !== sentenceData.words.length}
          className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
          style={{ backgroundColor: subjectColor }}
        >
          <CheckCircle2 className="w-4 h-4" /> Check
        </button>
      </div>

      {/* Result */}
      {isCorrect && userOrder.length > 0 && (
        <div className="p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-center animate-in fade-in slide-in-from-top-2 duration-300">
          <p className="text-sm font-bold text-green-800 dark:text-green-200 flex items-center justify-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" /> Perfect! ✓
          </p>
        </div>
      )}
    </div>
  );
}
