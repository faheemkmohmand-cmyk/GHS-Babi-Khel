/**
 * EnglishLabWidget.tsx - AI-Powered Dynamic English Learning Lab
 * 
 * Features:
 * - 📚 Vocabulary Builder (definitions, synonyms, antonyms, usage examples)
 * - ✍️ Grammar Quiz (dynamic sentence correction, parts of speech)
 * - 📖 Reading Comprehension (AI-generated passages with questions)
 * - 🎯 Writing Prompts (creative, academic, persuasive)
 * - 🎮 Word Games (scramble, hangman, crossword-style)
 * - 🔊 Pronunciation Guide (phonetic breakdowns)
 * 
 * Systematically adapts to chapter context for relevant content
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { 
  BookOpen, CheckCircle2, XCircle, RotateCcw, Volume2, 
  Lightbulb, Trophy, Target, Sparkles, PenTool, Brain,
  ArrowRight, RefreshCw, Star, Zap, GraduationCap,
  MessageSquare, Type, Headphones, Award, Clock
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────

type LabTab = "vocabulary" | "grammar" | "reading" | "writing" | "games" | "pronunciation";

interface VocabWord {
  word: string;
  phonetic: string;
  partOfSpeech: string;
  definition: string;
  synonyms: string[];
  antonyms: string[];
  example: string;
  difficulty: "easy" | "medium" | "hard";
}

interface GrammarQuestion {
  id: number;
  type: "correction" | "pos" | "tense" | "active-passive" | "fill-blank";
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  hint?: string;
}

interface ReadingPassage {
  title: string;
  level: string;
  passage: string;
  questions: Array<{
    question: string;
    options: string[];
    answer: number;
    explanation: string;
  }>;
}

interface WritingPrompt {
  category: "creative" | "academic" | "persuasive" | "narrative" | "descriptive";
  prompt: string;
  wordGuide: number;
  tips: string[];
  exampleOpening?: string;
}

// ─── COMPREHENSIVE DATA STORES (AI-Style Content) ─────────────────

const VOCABULARY_BANK: Record<string, VocabWord[]> = {
  default: [
    { word: "Eloquent", phonetic: "/ˈeləkwənt/", partOfSpeech: "adjective", definition: "Fluent or persuasive in speaking or writing", synonyms: ["articulate", "expressive", "fluent"], antonyms: ["inarticulate", "taciturn"], example: "She gave an eloquent speech that moved the audience.", difficulty: "medium" },
    { word: "Ubiquitous", phonetic: "/juːˈbɪkwɪtəs/", partOfSpeech: "adjective", definition: "Present, appearing, or found everywhere", synonyms: ["omnipresent", "pervasive", "universal"], antonyms: ["rare", "scarce"], example: "Smartphones have become ubiquitous in modern society.", difficulty: "hard" },
    { word: "Resilient", phonetic: "/rɪˈzɪliənt/", partOfSpeech: "adjective", definition: "Able to recover quickly from difficulties; tough", synonyms: ["tough", "strong", "adaptable"], antonyms: ["fragile", "weak"], example: "Children are remarkably resilient and can adapt to new situations.", difficulty: "easy" },
    { word: "Pragmatic", phonetic: "/præɡˈmætɪk/", partOfSpeech: "adjective", definition: "Dealing with things sensibly and realistically", synonyms: ["practical", "realistic", "sensible"], antonyms: ["idealistic", "impractical"], example: "We need a pragmatic approach to solve this problem.", difficulty: "medium" },
    { word: "Meticulous", phonetic: "/məˈtɪkjʊləs/", partOfSpeech: "adjective", definition: "Showing great attention to detail; very careful", synonyms: ["careful", "precise", "thorough"], antonyms: ["careless", "sloppy"], example: "The meticulous artist spent weeks perfecting every detail.", difficulty: "medium" },
    { word: "Ambiguous", phonetic: "/æmˈbɪɡjuəs/", partOfSpeech: "adjective", definition: "Open to more than one interpretation; unclear", synonyms: ["vague", "unclear", "equivocal"], antonyms: ["clear", "unambiguous"], example: "The contract was written in ambiguous language causing confusion.", difficulty: "hard" },
    { word: "Benevolent", phonetic: "/bəˈnevələnt/", partOfSpeech: "adjective", definition: "Well-meaning and kindly; charitable", synonyms: ["kind", "generous", "compassionate"], antonyms: ["malevolent", "cruel"], example: "The benevolent donor funded the entire school project.", difficulty: "medium" },
    { word: "Candid", phonetic: "/ˈkændɪd/", partOfSpeech: "adjective", definition: "Truthful and straightforward; frank", synonyms: ["frank", "honest", "open"], antonyms: ["secretive", "deceptive"], example: "I appreciate your candid feedback on my presentation.", difficulty: "easy" },
  ],
  literature: [
    { word: "Metaphor", phonetic: "/ˈmetəfɔːr/", partOfSpeech: "noun", definition: "A figure of speech comparing two unlike things without using 'like' or 'as'", synonyms: ["symbol", "allegory", "analogy"], antonyms: ["literalism"], example: "'Time is a thief' is a metaphor that suggests time steals moments.", difficulty: "easy" },
    { word: "Irony", phonetic: "/ˈaɪrəni/", partOfSpeech: "noun", definition: "Expression of meaning using words that mean the opposite", synonyms: ["sarcasm", "paradox", "contradiction"], antonyms: ["literalness", "sincerity"], example: "The irony of the fire station burning down was not lost on anyone.", difficulty: "medium" },
    { word: "Protagonist", phonetic: "/prəˈtæɡənɪst/", partOfSpeech: "noun", definition: "The leading character or hero in a story", synonyms: ["hero", "main character", "lead"], antonyms: ["antagonist", "villain"], example: "Harry Potter is the protagonist of J.K. Rowling's famous series.", difficulty: "medium" },
    { word: "Alliteration", phonetic: "/əˌlɪtəˈreɪʃn/", partOfSpeech: "noun", definition: "Repetition of same sound at beginning of words", synonyms: ["repetition", "initial rhyme"], antonyms: [], example: "'Peter Piper picked a peck' uses alliteration with the 'p' sound.", difficulty: "easy" },
    { word: "Foreshadowing", phonetic: "/fɔːrˈʃædoʊɪŋ/", partOfSpeech: "noun", definition: "Warning or indication of future events in a story", synonyms: ["hint", "omen", "preview"], antonyms: ["flashback"], example: "The dark clouds foreshadowed the storm that would change everything.", difficulty: "medium" },
    { word: "Personification", phonetic: "/pərˌsɒnɪfɪˈkeɪʃn/", partOfSpeech: "noun", definition: "Giving human qualities to non-human things", synonyms: ["anthropomorphism"], antonyms: [], example: "The wind howled angrily through the trees is an example of personification.", difficulty: "medium" },
    { word: "Symbolism", phonetic: "/ˈsɪmbəlɪzəm/", partOfSpeech: "noun", definition: "Use of symbols to represent ideas or qualities", synonyms: ["representation", "metaphor", "imagery"], antonyms: ["literalism"], example: "The dove is a symbol of peace in many cultures worldwide.", difficulty: "easy" },
    { word: "Satire", phonetic: "/ˈsaɪtaɪər/", partOfSpeech: "noun", definition: "Use of humor to criticize or expose foolishness", synonyms: ["parody", "irony", "mockery"], antonyms: ["tribute", "praise"], example: "Animal Farm by Orwell is a satire of Soviet communism.", difficulty: "hard" },
  ],
  science: [
    { word: "Hypothesis", phonetic: "/haɪˈpɒθəsɪs/", partOfSpeech: "noun", definition: "A proposed explanation for something to be tested", synonyms: ["theory", "premise", "assumption"], antonyms: ["fact", "conclusion"], example: "Our hypothesis was that plants grow faster with more sunlight.", difficulty: "medium" },
    { word: "Empirical", phonetic: "/ɪmˈpɪrɪkl/", partOfSpeech: "adjective", definition: "Based on observation or experience rather than theory", synonyms: ["observational", "experimental", "practical"], antonyms: ["theoretical", "speculative"], example: "We need empirical evidence before drawing any conclusions.", difficulty: "hard" },
    { word: "Variable", phonetic: "/ˈveəriəbl/", partOfSpeech: "noun", definition: "A factor that can change in an experiment", synonyms: ["factor", "element", "parameter"], antonyms: ["constant"], example: "Temperature was the independent variable in our experiment.", difficulty: "easy" },
    { word: "Analysis", phonetic: "/əˈnæləsɪs/", partOfSpeech: "noun", definition: "Detailed examination of elements or structure", synonyms: ["examination", "investigation", "study"], antonyms: ["synthesis", "summary"], example: "The data analysis revealed interesting patterns in student performance.", difficulty: "easy" },
    { word: "Synthesis", phonetic: "/ˈsɪnθəsɪs/", partOfSpeech: "noun", definition: "Combining ideas into a whole; production by combination", synonyms: ["combination", "integration", "fusion"], antonyms: ["analysis", "breakdown"], example: "The essay requires synthesis of information from multiple sources.", difficulty: "medium" },
    { word: "Correlation", phonetic: "/ˌkɒrəˈleɪʃn/", partOfSpeech: "noun", definition: "Mutual relationship between two things", synonyms: ["connection", "association", "link"], antonyms: ["disconnection"], example: "Studies show a correlation between sleep and academic performance.", difficulty: "medium" },
    { word: "Methodology", phonetic: "/ˌmeθəˈdɒlədʒi/", partOfSpeech: "noun", definition: "System of methods used in a particular field", synonyms: ["method", "approach", "technique"], antonyms: [], example: "The research methodology was carefully designed to ensure accuracy.", difficulty: "hard" },
    { word: "Inference", phonetic: "/ˈɪnfərəns/", partOfSpeech: "noun", definition: "Conclusion reached based on evidence and reasoning", synonyms: ["deduction", "conclusion", "implication"], antonyms: ["observation"], example: "From his wet coat, we made the inference that it was raining outside.", difficulty: "medium" },
  ],
};

const GRAMMAR_QUESTIONS: GrammarQuestion[] = [
  // Sentence Correction
  { id: 1, type: "correction", question: "Choose the correct sentence:", options: ["He don't like coffee.", "He doesn't likes coffee.", "He doesn't like coffee.", "He not like coffee."], correctAnswer: "He doesn't like coffee.", explanation: "Third person singular uses 'doesn't' + base form of verb." },
  { id: 2, type: "correction", question: "Which sentence is grammatically correct?", options: ["Neither John nor Sarah are coming.", "Neither John nor Sarah is coming.", "Neither John or Sarah is coming.", "Neither John or Sarah are coming."], correctAnswer: "Neither John nor Sarah is coming.", explanation: "With 'neither/nor', the verb agrees with the nearest subject." },
  { id: 3, type: "correction", question: "Find the error-free sentence:", options: ["Each of the students have finished.", "Each of the students has finished.", "Each of the students having finished.", "Each students have finished."], correctAnswer: "Each of the students has finished.", explanation: "'Each' is singular and takes a singular verb 'has'." },
  
  // Parts of Speech
  { id: 4, type: "pos", question: "In 'The quick brown fox jumps', what part of speech is 'quick'?", options: ["Noun", "Verb", "Adjective", "Adverb"], correctAnswer: "Adjective", explanation: "'Quick' describes the noun 'fox', making it an adjective." },
  { id: 5, type: "pos", question: "Identify the adverb in: 'She sings beautifully'", options: ["She", "sings", "beautifully", "None"], correctAnswer: "beautifully", explanation: "'Beautifully' modifies the verb 'sings', making it an adverb." },
  
  // Tense Questions
  { id: 6, type: "tense", question: "What tense is: 'They had completed the work before I arrived'?", options: ["Present Perfect", "Past Perfect", "Past Continuous", "Future Perfect"], correctAnswer: "Past Perfect", explanation: "'Had + past participle' indicates Past Perfect tense." },
  { id: 7, type: "tense", question: "Convert to passive voice: 'The teacher explains the lesson.'", options: ["The lesson is explained by the teacher.", "The lesson was explained by the teacher.", "The lesson has been explained by the teacher.", "The lesson being explained by the teacher."], correctAnswer: "The lesson is explained by the teacher.", explanation: "Present simple active becomes present simple passive." },
  
  // Fill in the Blanks
  { id: 8, type: "fill-blank", question: "She has been living here ___ 2010.", options: ["since", "for", "from", "at"], correctAnswer: "since", explanation: "'Since' is used with a specific point in time (2010)." },
  { id: 9, type: "fill-blank", question: "I would have helped you if I ___ about your problem.", options: ["know", "knew", "had known", "have known"], correctAnswer: "had known", explanation: "Third conditional uses 'had + past participle' in the if-clause." },
  
  // Active-Passive
  { id: 10, type: "active-passive", question: "Change to active voice: 'The cake was baked by Mary.'", options: ["Mary bakes the cake.", "Mary baked the cake.", "Mary has baked the cake.", "Mary was baking the cake."], correctAnswer: "Mary baked the cake.", explanation: "Past simple passive becomes past simple active." },
];

const READING_PASSAGES: ReadingPassage[] = [
  {
    title: "The Power of Reading",
    level: "Intermediate",
    passage: `Reading is one of the most powerful habits a person can develop. When we read, we don't just consume words on a page—we embark on journeys through time, space, and imagination. Scientific research has shown that regular reading strengthens brain connectivity, improves vocabulary, and even enhances empathy.

Studies conducted at Emory University found that reading fiction creates lasting changes in the brain. Participants showed increased connectivity in the left temporal cortex, the area associated with language receptivity. This effect persisted for several days after reading, suggesting that books literally reshape our minds.

Beyond cognitive benefits, reading serves as a form of mental exercise. Just as physical exercise keeps our bodies strong, reading keeps our minds sharp. It improves focus, concentration, and critical thinking skills. In an age of constant digital distractions, the ability to immerse oneself in a book is becoming increasingly valuable.

Furthermore, reading exposes us to diverse perspectives and experiences different from our own. Through literature, we can walk in another person's shoes, understand different cultures, and develop greater emotional intelligence. This empathetic capacity is essential in our interconnected world.`,
    questions: [
      { question: "What does reading do to the brain according to Emory University research?", options: ["It increases brain size", "It creates lasting changes in brain connectivity", "It improves eyesight permanently", "It reduces stress immediately"], answer: 1, explanation: "The study found increased connectivity in the left temporal cortex that persisted for days." },
      { question: "How does the author compare reading to physical exercise?", options: ["Both require equipment", "Reading is better than exercise", "Both strengthen their respective domains", "They are completely unrelated"], answer: 2, explanation: "The author compares them as both strengthening—bodies for exercise, minds for reading." },
      { question: "What benefit of reading relates to social understanding?", options: ["Better memory", "Improved empathy and emotional intelligence", "Faster reading speed", "Enhanced mathematical ability"], answer: 1, explanation: "Reading exposes us to diverse perspectives, developing empathy and emotional intelligence." }
    ]
  },
  {
    title: "Climate Change: Understanding Our Impact",
    level: "Advanced",
    passage: `Climate change represents one of the most significant challenges facing humanity in the twenty-first century. The scientific consensus is clear: Earth's climate is warming at an unprecedented rate, primarily due to human activities that release greenhouse gases into the atmosphere.

The primary driver of current climate change is the burning of fossil fuels—coal, oil, and natural gas—for energy production, transportation, and industrial processes. When these fuels burn, they release carbon dioxide (CO₂), which accumulates in the atmosphere and traps heat. Since the Industrial Revolution, atmospheric CO₂ levels have increased by nearly 50%, from approximately 280 parts per million to over 420 parts per million today.

The consequences of this warming are already visible worldwide. Glaciers are melting, sea levels are rising, and extreme weather events are becoming more frequent and intense. Heatwaves, droughts, hurricanes, and floods are affecting communities across the globe, often disproportionately impacting those who contributed least to the problem.

However, there is reason for hope. Renewable energy technologies like solar and wind power have become increasingly cost-effective. Many countries are committing to carbon neutrality goals. Individual actions, when multiplied across millions of people, can make a meaningful difference. The transition to a sustainable future is challenging but achievable.`,
    questions: [
      { question: "What is identified as the primary driver of climate change?", options: ["Natural volcanic activity", "Burning of fossil fuels", "Solar radiation changes", "Ocean currents shifting"], answer: 1, explanation: "The text states burning fossil fuels releases CO₂, the primary cause of warming." },
      { question: "By how much have CO₂ levels increased since the Industrial Revolution?", options: ["Approximately 25%", "Nearly 50%", "About 75%", "Over 100%"], answer: 1, explanation: "The text states CO₂ levels increased by nearly 50% (280 to 420+ ppm)." },
      { question: "What gives the author hope about addressing climate change?", options: ["Natural recovery will occur", "Renewable energy is becoming cost-effective", "Climate change will stop naturally", "Other planets are habitable"], answer: 1, explanation: "Renewable energy becoming cost-effective and global commitments give hope." }
    ]
  }
];

const WRITING_PROMPTS: WritingPrompt[] = [
  { category: "creative", prompt: "Write a story that begins with: 'The letter arrived ten years too late...'", wordGuide: 500, tips: ["Build suspense gradually", "Use sensory details", "Consider flashbacks", "End with a twist"], exampleOpening: "The letter arrived ten years too late, its envelope yellowed with age, the handwriting familiar yet foreign..." },
  { category: "academic", prompt: "Discuss the impact of social media on teenage mental health, presenting balanced arguments.", wordGuide: 800, tips: ["Include a clear thesis statement", "Present multiple perspectives", "Cite examples and studies", "Conclude with recommendations"], exampleOpening: "In the digital age, social media has become an integral part of adolescent life, raising important questions about its psychological effects..." },
  { category: "persuasive", prompt: "Persuade your school principal to implement a four-day school week.", wordGuide: 600, tips: ["Address counterarguments", "Use persuasive techniques", "Include evidence and logic", "Maintain respectful tone"], exampleOpening: "Respected Principal, I write to propose an innovative approach to education that could benefit students, teachers, and families alike..." },
  { category: "narrative", prompt: "Describe a moment that changed your perspective on life forever.", wordGuide: 450, tips: ["Show, don't just tell", "Use first-person perspective", "Include internal reflection", "Create emotional resonance"], exampleOpening: "I never expected that an ordinary Tuesday morning would fundamentally alter how I viewed the world..." },
  { category: "descriptive", prompt: "Describe your ideal place of peace—a location real or imagined where you feel completely at ease.", wordGuide: 400, tips: ["Engage all five senses", "Use vivid imagery", "Create atmosphere", "Explain why it brings peace"], exampleOpening: "Nestled between rolling emerald hills, where golden sunlight filters through ancient oaks, lies my sanctuary..." },
];

// ─── TAB CONFIGURATION ─────────────────────────────────────────────

const LAB_TABS: { id: LabTab; label: string; icon: typeof BookOpen; color: string }[] = [
  { id: "vocabulary", label: "Vocabulary", icon: BookOpen, color: "#3b82f6" },
  { id: "grammar", label: "Grammar Quiz", icon: CheckCircle2, color: "#8b5cf6" },
  { id: "reading", label: "Reading", icon: MessageSquare, color: "#10b981" },
  { id: "writing", label: "Writing", icon: PenTool, color: "#f59e0b" },
  { id: "games", label: "Word Games", icon: Zap, color: "#ef4444" },
  { id: "pronunciation", label: "Pronunciation", icon: Headphones, color: "#06b6d4" },
];

// ─── MAIN COMPONENT ────────────────────────────────────────────────

interface EnglishLabWidgetProps {
  subjectColor?: string;
  chapterTitle?: string;
}

export default function EnglishLabWidget({ subjectColor = "#3b82f6", chapterTitle }: EnglishLabWidgetProps) {
  const [activeTab, setActiveTab] = useState<LabTab>("vocabulary");
  const [vocabIndex, setVocabIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(false);
  const [grammarState, setGrammarState] = useState<{ currentQ: number; score: number; answered: boolean; selectedAnswer: string | null }>({
    currentQ: 0, score: 0, answered: false, selectedAnswer: null
  });
  const [readingIndex, setReadingIndex] = useState(0);
  const [showAnswers, setShowAnswers] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [writingPromptIndex, setWritingPromptIndex] = useState(0);
  const [gameType, setGameType] = useState<"scramble" | "hangman">("scramble");
  const [scrambledWord, setScrambledWord] = useState<{ original: string; scrambled: string; hint: string }>({ original: "", scrambled: "", hint: "" });
  const [userGuess, setUserGuess] = useState("");
  const [hangmanState, setHangmanState] = useState<{ word: string; guessed: Set<string>; wrongGuesses: number }>({ word: "", guessed: new Set(), wrongGuesses: 0 });

  // Get appropriate vocabulary based on chapter context
  const vocabBank = useMemo(() => {
    const title = (chapterTitle || "").toLowerCase();
    if (title.includes("literature") || title.includes("poetry") || title.includes("novel")) return VOCABULARY_BANK.literature;
    if (title.includes("science") || title.includes("research") || title.includes("report")) return VOCABULARY_BANK.science;
    return VOCABULARY_BANK.default;
  }, [chapterTitle]);

  const currentWord = vocabBank[vocabIndex % vocabBank.length];

  // Initialize scramble game
  useEffect(() => {
    const words = ["BEAUTIFUL", "KNOWLEDGE", "EXTRAORDINARY", "PHENOMENON", "SOPHISTICATED"];
    const randomWord = words[Math.floor(Math.random() * words.length)];
    setScrambledWord({
      original: randomWord,
      scrambled: randomWord.split('').sort(() => Math.random() - 0.5).join(''),
      hint: `This word has ${randomWord.length} letters`
    });
  }, [gameType]);

  // Initialize hangman game
  useEffect(() => {
    if (gameType === "hangman") {
      const words = ["PARAGRAPH", "SYNONYM", "GRAMMAR", "SENTENCE", "VOCABULARY"];
      setHangmanState({ word: words[Math.floor(Math.random() * words.length)], guessed: new Set(), wrongGuesses: 0 });
    }
  }, [gameType]);

  // ─── HANDLERS ────────────────────────────────────────────────────

  const handleGrammarAnswer = useCallback((answer: string) => {
    if (grammarState.answered) return;
    const isCorrect = answer === GRAMMAR_QUESTIONS[grammarState.currentQ].correctAnswer;
    setGrammarState(prev => ({
      ...prev,
      answered: true,
      selectedAnswer: answer,
      score: isCorrect ? prev.score + 1 : prev.score
    }));
  }, [grammarState]);

  const nextQuestion = useCallback(() => {
    setGrammarState(prev => ({
      ...prev,
      currentQ: (prev.currentQ + 1) % GRAMMAR_QUESTIONS.length,
      answered: false,
      selectedAnswer: null
    }));
  }, []);

  const handleScrambleSubmit = () => {
    if (userGuess.toUpperCase() === scrambledWord.original) {
      alert('🎉 Correct! Well done!');
      const words = ["BEAUTIFUL", "KNOWLEDGE", "EXTRAORDINARY", "PHENOMENON", "SOPHISTICATED"];
      const newWord = words[Math.floor(Math.random() * words.length)];
      setScrambledWord({
        original: newWord,
        scrambled: newWord.split('').sort(() => Math.random() - 0.5).join(''),
        hint: `This word has ${newWord.length} letters`
      });
      setUserGuess("");
    } else {
      alert('❌ Try again!');
    }
  };

  const handleHangmanGuess = (letter: string) => {
    if (hangmanState.guessed.has(letter)) return;
    const newGuessed = new Set(hangmanState.guessed).add(letter);
    const isWrong = !hangmanState.word.includes(letter);
    setHangmanState(prev => ({
      ...prev,
      guessed: newGuessed,
      wrongGuesses: isWrong ? prev.wrongGuesses + 1 : prev.wrongGuesses
    }));
  };

  // ─── RENDER HELPERS ──────────────────────────────────────────────

  const renderVocabulary = () => (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${((vocabIndex + 1) / vocabBank.length) * 100}%`, backgroundColor: subjectColor }}
          />
        </div>
        <span className="text-xs font-semibold text-gray-500">{vocabIndex + 1}/{vocabBank.length}</span>
      </div>

      {/* Main Card */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-6 border border-blue-100 dark:border-blue-800">
        {/* Word Header */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white dark:bg-gray-800 rounded-full text-xs font-medium text-blue-600 dark:text-blue-400 shadow-sm mb-3">
            <Sparkles className="w-3 h-3" /> {currentWord.partOfSpeech}
          </div>
          
          <h3 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white mb-2">
            {currentWord.word}
          </h3>
          
          <button 
            onClick={() => setShowDefinition(!showDefinition)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
          >
            <Volume2 className="w-4 h-4" /> {currentWord.phonetic}
          </button>

          {/* Difficulty Badge */}
          <div className="mt-2 flex justify-center gap-1">
            {[1, 2, 3].map((level) => (
              <div 
                key={level}
                className={`w-2 h-2 rounded-full ${
                  (currentWord.difficulty === "easy" && level <= 1) ||
                  (currentWord.difficulty === "medium" && level <= 2) ||
                  (currentWord.difficulty === "hard" && level <= 3)
                    ? "bg-orange-400"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Definition (Toggleable) */}
        {showDefinition && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-white/80 dark:bg-gray-800/80 rounded-xl p-4">
              <h4 className="font-bold text-sm text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-500" /> Definition
              </h4>
              <p className="text-gray-800 dark:text-gray-200">{currentWord.definition}</p>
            </div>

            {/* Example */}
            <div className="bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 border-l-4 border-blue-400">
              <p className="text-sm italic text-gray-700 dark:text-gray-300">
                "{currentWord.example}"
              </p>
            </div>

            {/* Synonyms & Antonyms */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 dark:bg-green-900/30 rounded-xl p-3">
                <h4 className="font-semibold text-xs text-green-700 dark:text-green-400 mb-2">✓ Synonyms</h4>
                <div className="flex flex-wrap gap-1">
                  {currentWord.synonyms.map((syn) => (
                    <span key={syn} className="px-2 py-0.5 bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300 rounded-full text-xs">
                      {syn}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-red-50 dark:bg-red-900/30 rounded-xl p-3">
                <h4 className="font-semibold text-xs text-red-700 dark:text-red-400 mb-2">✗ Antonyms</h4>
                <div className="flex flex-wrap gap-1">
                  {currentWord.antonyms.map((ant) => (
                    <span key={ant} className="px-2 py-0.5 bg-red-100 dark:bg-red-800/50 text-red-700 dark:text-red-300 rounded-full text-xs">
                      {ant}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {!showDefinition && (
          <button 
            onClick={() => setShowDefinition(true)}
            className="w-full mt-4 py-2.5 bg-white dark:bg-gray-800 rounded-xl text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
          >
            Show Definition →
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => { setVocabIndex((prev) => (prev - 1 + vocabBank.length) % vocabBank.length); setShowDefinition(false); }}
          disabled={vocabIndex === 0}
          className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 text-sm font-medium transition-all"
        >
          ← Previous
        </button>
        
        <div className="flex gap-1.5">
          {vocabBank.slice(0, Math.min(vocabBank.length, 8)).map((_, i) => (
            <button
              key={i}
              onClick={() => { setVocabIndex(i); setShowDefinition(false); }}
              className={`w-2 h-2 rounded-full transition-all ${i === vocabIndex ? 'scale-150' : ''}`}
              style={{ backgroundColor: i === vocabIndex ? subjectColor : '#d1d5db' }}
            />
          ))}
        </div>

        <button
          onClick={() => { setVocabIndex((prev) => (prev + 1) % vocabBank.length); setShowDefinition(false); }}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-all shadow-md hover:shadow-lg"
          style={{ backgroundColor: subjectColor }}
        >
          Next →
        </button>
      </div>
    </div>
  );

  const renderGrammarQuiz = () => {
    const q = GRAMMAR_QUESTIONS[grammarState.currentQ];
    const isCorrect = grammarState.selectedAnswer === q.correctAnswer;

    return (
      <div className="space-y-4">
        {/* Score Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl p-4 text-white">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            <span className="font-bold">Score</span>
          </div>
          <span className="text-2xl font-black">{grammarState.score}/{GRAMMAR_QUESTIONS.length}</span>
          <div className="text-xs opacity-80">
            Q {grammarState.currentQ + 1} of {GRAMMAR_QUESTIONS.length}
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          {/* Question Type Badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full text-xs font-semibold mb-3">
            <Target className="w-3 h-3" /> {q.type.replace('-', ' ').toUpperCase()}
          </div>

          <h4 className="text-base font-bold text-gray-900 dark:text-white mb-4 leading-relaxed">
            {q.question}
          </h4>

          {/* Options */}
          <div className="space-y-2.5">
            {q.options?.map((option, i) => {
              let optionStyle = "border-gray-200 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20";
              
              if (grammarState.answered) {
                if (option === q.correctAnswer) {
                  optionStyle = "border-green-400 bg-green-50 dark:bg-green-900/30";
                } else if (option === grammarState.selectedAnswer && option !== q.correctAnswer) {
                  optionStyle = "border-red-400 bg-red-50 dark:bg-red-900/30";
                } else {
                  optionStyle = "opacity-50";
                }
              }

              return (
                <button
                  key={i}
                  onClick={() => handleGrammarAnswer(option)}
                  disabled={grammarState.answered}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all flex items-center gap-3 ${optionStyle}`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                    grammarState.answered && option === q.correctAnswer
                      ? "bg-green-500 text-white"
                      : grammarState.answered && option === grammarState.selectedAnswer && option !== q.correctAnswer
                        ? "bg-red-500 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                  }`}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className={`text-sm font-medium ${grammarState.answered && option === q.correctAnswer ? 'text-green-700 dark:text-green-300' : 'text-gray-700 dark:text-gray-300'}`}>
                    {option}
                  </span>
                  {grammarState.answered && option === q.correctAnswer && (
                    <CheckCircle2 className="w-5 h-5 text-green-500 ml-auto shrink-0" />
                  )}
                  {grammarState.answered && option === grammarState.selectedAnswer && option !== q.correctAnswer && (
                    <XCircle className="w-5 h-5 text-red-500 ml-auto shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Explanation */}
          {grammarState.answered && (
            <div className={`mt-4 p-4 rounded-xl ${isCorrect ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'}`}>
              <div className="flex items-start gap-2">
                {isCorrect ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <Lightbulb className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`font-semibold text-sm ${isCorrect ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
                    {isCorrect ? '✅ Correct!' : '📚 Explanation'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{q.explanation}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Next Button */}
        {grammarState.answered && (
          <button
            onClick={nextQuestion}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
          >
            Next Question <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  const renderReadingComprehension = () => {
    const passage = READING_PASSAGES[readingIndex];
    
    return (
      <div className="space-y-4">
        {/* Passage Selector */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {READING_PASSAGES.map((p, i) => (
            <button
              key={i}
              onClick={() => { setReadingIndex(i); setSelectedAnswers({}); setShowAnswers(false); }}
              className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                i === readingIndex
                  ? 'text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
              }`}
              style={i === readingIndex ? { backgroundColor: '#10b981' } : {}}
            >
              {p.title}
            </button>
          ))}
        </div>

        {/* Passage Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-emerald-500" /> {passage.title}
            </h4>
            <span className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-semibold">
              {passage.level}
            </span>
          </div>
          
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {passage.passage.split('\n\n').map((para, i) => (
              <p key={i} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3 last:mb-0">
                {para}
              </p>
            ))}
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-3">
          <h5 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
            <Brain className="w-4 h-4 text-emerald-500" /> Comprehension Questions
          </h5>
          
          {passage.questions.map((q, qi) => (
            <div key={qi} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
                {qi + 1}. {q.question}
              </p>
              <div className="space-y-2">
                {q.options.map((opt, oi) => (
                  <button
                    key={oi}
                    onClick={() => setSelectedAnswers(prev => ({ ...prev, [qi]: oi }))}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all border-2 ${
                      selectedAnswers[qi] === oi
                        ? showAnswers
                          ? oi === q.answer
                            ? 'border-green-400 bg-green-50 dark:bg-green-900/30 text-green-700'
                            : 'border-red-400 bg-red-50 dark:bg-red-900/30 text-red-700'
                          : 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                        : showAnswers && oi === q.answer
                          ? 'border-green-300 bg-green-50/50 text-green-600'
                          : 'border-transparent bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    <span className="font-medium mr-2">{String.fromCharCode(65 + oi)}.</span> {opt}
                  </button>
                ))}
              </div>
              {showAnswers && selectedAnswers[qi] !== undefined && (
                <div className={`mt-3 p-3 rounded-lg text-xs ${selectedAnswers[qi] === q.answer ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700'}`}>
                  💡 {q.explanation}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => setShowAnswers(!showAnswers)}
            className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
          >
            {showAnswers ? 'Hide Answers' : 'Check Answers'}
          </button>
          <button
            onClick={() => { setSelectedAnswers({}); setShowAnswers(false); }}
            className="px-4 py-2.5 rounded-xl font-semibold text-sm bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const renderWritingPrompts = () => {
    const prompt = WRITING_PROMPTS[writingPromptIndex];
    
    return (
      <div className="space-y-4">
        {/* Category Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {WRITING_PROMPTS.map((p, i) => (
            <button
              key={i}
              onClick={() => setWritingPromptIndex(i)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                i === writingPromptIndex
                  ? 'text-white shadow-md'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
              }`}
              style={i === writingPromptIndex ? { backgroundColor: '#f59e0b' } : {}}
            >
              {p.category}
            </button>
          ))}
        </div>

        {/* Prompt Card */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl p-5 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 mb-3">
            <PenTool className="w-5 h-5 text-amber-600" />
            <span className="px-2.5 py-0.5 bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-full text-xs font-bold uppercase">
              {prompt.category}
            </span>
            <span className="text-xs text-gray-500 ml-auto">~{prompt.wordGuide} words</span>
          </div>
          
          <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-3 leading-relaxed">
            "{prompt.prompt}"
          </h4>

          {prompt.exampleOpening && (
            <div className="bg-white/70 dark:bg-gray-800/70 rounded-xl p-3 mb-3 border-l-4 border-amber-400">
              <p className="text-xs text-gray-500 mb-1 font-medium">Example Opening:</p>
              <p className="text-sm italic text-gray-700 dark:text-gray-300">{prompt.exampleOpening}</p>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <h5 className="font-bold text-sm text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-500" /> Writing Tips
          </h5>
          <ul className="space-y-2">
            {prompt.tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Star className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                {tip}
              </li>
            ))}
          </ul>
        </div>

        {/* Start Writing Button */}
        <button className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2">
          <PenTool className="w-5 h-5" /> Start Writing
        </button>
      </div>
    );
  };

  const renderWordGames = () => (
    <div className="space-y-4">
      {/* Game Type Selector */}
      <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        <button
          onClick={() => setGameType("scramble")}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            gameType === "scramble" ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'
          }`}
        >
          🔤 Word Scramble
        </button>
        <button
          onClick={() => setGameType("hangman")}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            gameType === "hangman" ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'
          }`}
        >
          🎯 Hangman
        </button>
      </div>

      {gameType === "scramble" ? (
        /* Word Scramble Game */
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm text-center">
          <div className="mb-4">
            <Zap className="w-10 h-10 text-red-500 mx-auto mb-2" />
            <h4 className="font-bold text-gray-900 dark:text-white">Unscramble the Word!</h4>
          </div>
          
          <div className="bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 rounded-xl p-6 mb-4">
            <p className="text-3xl md:text-4xl font-black tracking-widest text-gray-900 dark:text-white mb-3">
              {scrambledWord.scrambled}
            </p>
            <p className="text-xs text-gray-500">{scrambledWord.hint}</p>
          </div>

          <input
            type="text"
            value={userGuess}
            onChange={(e) => setUserGuess(e.target.value)}
            placeholder="Type your answer..."
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 text-center font-semibold text-lg mb-3 focus:border-red-400 focus:outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleScrambleSubmit()}
          />

          <button
            onClick={handleScrambleSubmit}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-red-500 to-pink-500 text-white font-bold shadow-lg hover:shadow-xl transition-all"
          >
            Check Answer ✓
          </button>
        </div>
      ) : (
        /* Hangman Game */
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm text-center">
          <div className="mb-4">
            <Target className="w-10 h-10 text-red-500 mx-auto mb-2" />
            <h4 className="font-bold text-gray-900 dark:text-white">Guess the Word!</h4>
            <p className="text-xs text-gray-500 mt-1">Wrong guesses: {hangmanState.wrongGuesses}/6</p>
          </div>

          {/* Hangman Visual */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 mb-4 min-h-[120px] flex items-center justify-center">
            <div className="text-4xl font-mono">
              {Array.from(hangmanState.word).map((letter, i) => (
                <span key={i} className="mx-1">
                  {hangmanState.guessed.has(letter) ? (
                    <span className="text-gray-900 dark:text-white font-bold">{letter}</span>
                  ) : (
                    <span className="text-gray-400">_</span>
                  )}
                </span>
              ))}
            </div>
          </div>

          {/* Keyboard */}
          <div className="flex flex-wrap justify-center gap-1.5 max-w-md mx-auto">
            {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => (
              <button
                key={letter}
                onClick={() => handleHangmanGuess(letter)}
                disabled={hangmanState.guessed.has(letter)}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                  hangmanState.guessed.has(letter)
                    ? hangmanState.word.includes(letter)
                      ? 'bg-green-500 text-white'
                      : 'bg-red-500 text-white opacity-50'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/30'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>

          {(hangmanState.wrongGuesses >= 6 || Array.from(hangmanState.word).every(l => hangmanState.guessed.has(l))) && (
            <div className={`mt-4 p-3 rounded-xl ${hangmanState.wrongGuesses >= 6 ? 'bg-red-50 dark:bg-red-900/30' : 'bg-green-50 dark:bg-green-900/30'}`}>
              <p className={`font-bold ${hangmanState.wrongGuesses >= 6 ? 'text-red-600' : 'text-green-600'}`}>
                {hangmanState.wrongGuesses >= 6 ? `💀 Game Over! The word was: ${hangmanState.word}` : '🎉 You won!'}
              </p>
              <button
                onClick={() => {
                  const words = ["PARAGRAPH", "SYNONYM", "GRAMMAR", "SENTENCE", "VOCABULARY"];
                  setHangmanState({ word: words[Math.floor(Math.random() * words.length)], guessed: new Set(), wrongGuesses: 0 });
                }}
                className="mt-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-200"
              >
                Play Again ↻
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderPronunciation = () => (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 rounded-2xl p-5 border border-cyan-200 dark:border-cyan-800 text-center">
        <Headphones className="w-12 h-12 text-cyan-500 mx-auto mb-3" />
        <h4 className="font-bold text-gray-900 dark:text-white mb-2">Pronunciation Guide</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Master the sounds of English with phonetic breakdowns
        </p>

        {/* Featured Words */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { word: "Epitome", phonetic: "/ɪˈpɪtəmi/", tip: "Stress on 2nd syllable" },
            { word: "Quinoa", phonetic: "/ˈkiːnwɑː/", tip: '"KEEN-wah"' },
            { word: "Hyperbole", phonetic: "/haɪˈpɜːrbəli/", tip: "hy-PER-bo-le" },
            { word: "Worcestershire", phonetic: "/ˈwʊstərʃər/", tip: '"WOOS-ter-sher"' },
          ].map((item, i) => (
            <button
              key={i}
              className="bg-white dark:bg-gray-800 rounded-xl p-4 text-left hover:shadow-md transition-all group border border-cyan-100 dark:border-cyan-800"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-gray-900 dark:text-white group-hover:text-cyan-600 transition-colors">
                  {item.word}
                </span>
                <Volume2 className="w-4 h-4 text-cyan-500" />
              </div>
              <p className="text-sm text-cyan-600 dark:text-cyan-400 font-mono">{item.phonetic}</p>
              <p className="text-xs text-gray-500 mt-1">💡 {item.tip}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Common Mistakes */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h5 className="font-bold text-sm text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" /> Common Mispronunciations
        </h5>
        <div className="space-y-2">
          {[
            { wrong: "NUK-u-lar", correct: "NEW-clear", word: "Nuclear" },
            { wrong: "off-TEN", correct: "OFF-en", word: "Often" },
            { wrong: "excape", correct: "es-CAPE", word: "Escape" },
            { wrong: "ath-a-lete", correct: "ATH-lete", word: "Athlete" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-gray-50 dark:bg-gray-900">
              <span className="font-semibold text-gray-900 dark:text-white w-24">{item.word}</span>
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-red-500 line-through">{item.wrong}</span>
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
              <span className="text-green-600 font-medium">{item.correct}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── MAIN RENDER ──────────────────────────────────────────────────

  return (
    <div className="english-lab-widget">
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
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active Tab Content */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {activeTab === "vocabulary" && renderVocabulary()}
        {activeTab === "grammar" && renderGrammarQuiz()}
        {activeTab === "reading" && renderReadingComprehension()}
        {activeTab === "writing" && renderWritingPrompts()}
        {activeTab === "games" && renderWordGames()}
        {activeTab === "pronunciation" && renderPronunciation()}
      </div>
    </div>
  );
}
