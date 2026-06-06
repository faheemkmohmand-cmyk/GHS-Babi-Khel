// api/numbers.js
// Vercel Serverless Function — Number facts with local fallback.
// Browser → /api/numbers?path=42/trivia → this function → numbersapi.com OR local facts
//
// Since numbersapi.com is currently down (domain expired/redirected),
// we generate facts locally from a comprehensive built-in database.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { path } = req.query;

  if (!path) {
    return res.status(400).json({ error: "Missing path parameter" });
  }

  // Allow digits, slashes, lowercase letters only
  if (!/^[\d\/a-z]+$/.test(path)) {
    return res.status(400).json({ error: "Invalid path" });
  }

  // Try numbersapi.com first (in case it comes back online)
  try {
    const url = `https://numbersapi.com/${path}?json`;
    const upstream = await fetch(url, {
      headers: { "User-Agent": "OceanSchoolHub/1.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (upstream.ok) {
      const contentType = upstream.headers.get("content-type") || "";
      if (contentType.includes("json")) {
        const body = await upstream.json();
        if (body && body.text) {
          return res.status(200).json(body);
        }
      }
      // Plain text response
      const text = await upstream.text();
      if (text && text.trim() && !text.includes("<!doctype")) {
        return res.status(200).json({ text: text.trim(), found: true, type: getType(path), number: getNumber(path) });
      }
    }
  } catch (err) {
    // numbersapi.com is down — fall through to local facts
    console.log("numbersapi.com unavailable, using local fallback");
  }

  // ── LOCAL FALLBACK ──────────────────────────────────────────────
  const fact = generateLocalFact(path);
  return res.status(200).json(fact);
}

function getType(path) {
  const parts = path.split("/");
  if (parts.length >= 2) return parts[parts.length - 1];
  return "trivia";
}

function getNumber(path) {
  const parts = path.split("/");
  const n = parseInt(parts[0], 10);
  return isNaN(n) ? 0 : n;
}

// ── HELPER FUNCTIONS ──────────────────────────────────────────────────
function checkPrime(n) {
  if (n < 2) return false;
  if (n === 2) return true;
  if (n % 2 === 0) return false;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return false;
  }
  return true;
}

function getFactors(n) {
  const factors = [];
  for (let i = 1; i <= n; i++) {
    if (n % i === 0) factors.push(i);
  }
  return factors;
}

function generateLocalFact(path) {
  const parts = path.split("/");
  const numStr = parts[0];
  const type = parts.length >= 2 ? parts[parts.length - 1] : "trivia";
  const num = parseInt(numStr, 10);

  // Date format: month/day/date
  if (type === "date" && parts.length >= 3) {
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    return generateDateFact(month, day);
  }

  if (isNaN(num) || num === 0) {
    return { text: `${numStr} is a number that sparks curiosity.`, found: true, type, number: numStr };
  }

  // Check specific fact database first
  const specific = SPECIFIC_FACTS[num];
  if (specific && specific[type]) {
    return { text: specific[type], found: true, type, number: num };
  }
  if (specific && specific.trivia) {
    return { text: specific.trivia, found: true, type, number: num };
  }

  // Generate from templates
  const generator = GENERATORS[type] || GENERATORS.trivia;
  return { text: generator(num), found: true, type, number: num };
}

function generateDateFact(month, day) {
  const MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const m = MONTHS[month] || "Unknown";

  const dateFacts = [
    `${m} ${day} is a notable date in history. Many significant events have happened on this day across centuries of human civilization.`,
    `${m} ${day} marks the anniversary of several important scientific discoveries and cultural milestones that shaped our world.`,
    `On ${m} ${day}, throughout history, leaders have made decisions that changed the course of nations and affected millions of lives.`,
    `${m} ${day} has witnessed the birth of influential thinkers, artists, and innovators whose work continues to inspire generations.`,
    `Historical records show that ${m} ${day} has been a day of both triumph and challenge, reflecting the complexity of human experience across time.`,
    `${m} ${day} falls in a season of change. Throughout history, this date has seen pivotal moments in politics, science, and culture.`,
  ];

  const idx = (month * 31 + day) % dateFacts.length;
  return { text: dateFacts[idx], found: true, type: "date", number: `${month}/${day}` };
}

// ── SPECIFIC NUMBER FACTS ────────────────────────────────────────────
const SPECIFIC_FACTS = {
  0: { trivia: "0 is the integer preceding 1. In most cultures, zero was one of the last numbers to be invented, and its concept revolutionized mathematics.", math: "0 is the additive identity: any number plus 0 equals itself. It is the only number that is neither positive nor negative." },
  1: { trivia: "1 is the loneliest number, according to the famous song by Three Dog Night. It is also the multiplicative identity of arithmetic.", math: "1 is the multiplicative identity: any number times 1 equals itself. It is also the first odd number and the first square number (1 squared)." },
  2: { trivia: "2 is the only even prime number. It is also the base of the binary system that powers all modern computers.", math: "2 is the smallest prime number and the only even prime. It is also the base of the binary number system used in computing." },
  3: { trivia: "3 is the number of dimensions we perceive in our physical world. It is also considered a magic number in writing and storytelling (rule of three).", math: "3 is the smallest odd prime number. A triangle, the simplest polygon, has 3 sides. The number 3 is also a Fermat prime." },
  4: { trivia: "4 is considered unlucky in many East Asian cultures because the word for four sounds similar to the word for death. It is the number of seasons in a year.", math: "4 is the smallest composite number and the smallest square of a prime (2 squared). A tetrahedron has 4 faces." },
  5: { trivia: "5 is the number of fingers on a human hand, which is why many ancient counting systems were base-5. The Olympic rings are 5, representing the 5 continents.", math: "5 is a prime number and a Fermat prime. A regular pentagon has 5 sides, and the Pythagoreans considered it a symbol of perfection." },
  6: { trivia: "6 is the smallest perfect number (1 + 2 + 3 = 6). Insects have 6 legs, and a standard guitar has 6 strings.", math: "6 is the smallest perfect number: the sum of its proper divisors (1, 2, 3) equals 6. It is also the factorial of 3 (3! = 6)." },
  7: { trivia: "7 is considered a lucky number in many cultures. There are 7 days in a week, 7 wonders of the ancient world, and 7 colors in a rainbow.", math: "7 is a prime number. A regular heptagon cannot be constructed with a compass and straightedge alone, which was proven by Gauss." },
  8: { trivia: "8 is considered the luckiest number in Chinese culture because it sounds like the word for wealth or prosperity. An octopus has 8 arms.", math: "8 is a cubic number (2 cubed). It is the first number that is neither prime nor semiprime. An octahedron has 8 faces." },
  9: { trivia: "9 is the highest single-digit number. Cats are said to have 9 lives, and there are 9 planets in the solar system (historically, including Pluto).", math: "9 is the largest single-digit number. Any number divisible by 9 has digits that sum to a multiple of 9. It is also a perfect square (3 squared)." },
  10: { trivia: "10 is the base of our decimal number system, likely because humans have 10 fingers. The Ten Commandments are fundamental to Judeo-Christian ethics.", math: "10 is the sum of the first three prime numbers (2 + 3 + 5) and the sum of the first four positive integers (1 + 2 + 3 + 4)." },
  11: { trivia: "11 is a master number in numerology, representing intuition and spiritual insight. World War I ended on the 11th hour of the 11th day of the 11th month.", math: "11 is a prime number. Multiplying any two-digit number by 11 has a neat trick: just add the digits and place the sum in the middle." },
  12: { trivia: "12 is a highly composite number, which is why we have 12 months, 12 hours on a clock face, and 12 zodiac signs. A dozen equals 12.", math: "12 is the smallest abundant number (sum of proper divisors 1+2+3+4+6 = 16 > 12). It has 6 divisors, making it highly composite." },
  13: { trivia: "13 is considered unlucky in Western cultures (triskaidekaphobia), with many buildings skipping the 13th floor. But in some cultures, 13 is lucky.", math: "13 is a prime number. It is the smallest emirp (a prime whose reversal, 31, is also prime). A 13-sided polygon is a tridecagon." },
  14: { trivia: "14 is the number of days in a fortnight. The atomic number of silicon, which powers modern electronics, is 14.", math: "14 is a semiprime number (2 times 7). It is also a Catalan number. The sum of the first 5 positive integers equals 14." },
  15: { trivia: "15 is the number of minutes in a quarter hour. In rugby, a team has 15 players. The 15th puzzle is a famous sliding tile game.", math: "15 is the product of the first two odd primes (3 times 5). It is a triangular number and a hexagonal number." },
  16: { trivia: "16 is the age of sweet sixteen in many cultures. There are 16 ounces in a pound and 16 bits in a hexadecimal digit representation.", math: "16 is 2 to the 4th power. It is the base of the hexadecimal number system used in computing. A square number (4 squared)." },
  17: { trivia: "17 is considered unlucky in Italy. There are 17 species of penguins. The 17-year cicada is one of nature's most remarkable phenomena.", math: "17 is a prime number and a Fermat prime. It is the minimum number of colors needed to color any map on a surface of genus 1 (torus)." },
  18: { trivia: "18 is the age of adulthood in many countries. In Jewish tradition, 18 represents life (chai). A standard golf course has 18 holes.", math: "18 = 2 times 9. It is an abundant number. The sum of its proper divisors (1, 2, 3, 6, 9) equals 21, which exceeds 18." },
  19: { trivia: "19 is the number of years in the Metonic cycle, after which the phases of the moon repeat on the same days of the year.", math: "19 is a prime number. It is the smallest number of people needed at a party to guarantee at least 3 mutual strangers or 3 mutual friends (Ramsey theory)." },
  20: { trivia: "20 is the basis of the vigesimal number system used by the Maya. There are 20 questions in a standard trivia round. A score means 20.", math: "20 is a tetrahedral number (the sum of the first 4 triangular numbers). It is also an abundant number with 6 divisors." },
  21: { trivia: "21 is the coming-of-age birthday in many Western traditions. Blackjack, one of the most popular casino games, aims for 21.", math: "21 is a triangular number (sum of 1 through 6). It is the product of the first two odd primes (3 times 7)." },
  22: { trivia: "22 is the number of players on a football (soccer) field. There are 22 letters in the Hebrew alphabet. Catch-22 is a famous novel.", math: "22 is a semiprime (2 times 11). It is the smallest number that can be expressed as the sum of two primes in more than one way: 3+19 and 5+17." },
  23: { trivia: "23 is considered a number of significance in many conspiracy theories (the 23 enigma). Human cells have 23 pairs of chromosomes.", math: "23 is a prime number. It is the smallest prime that is not a twin prime. The number 23 is also a factor of the highly composite 720." },
  24: { trivia: "24 is the number of hours in a day. There are 24 karats in pure gold. The TV series 24 had 24 episodes per season, each representing one hour.", math: "24 is 4 factorial (4!). It is a highly composite number with 8 divisors. The Leech lattice, important in group theory, lives in 24 dimensions." },
  25: { trivia: "25 is the number of years in a silver jubilee. A quarter century equals 25 years. In darts, the outer bullseye is worth 25 points.", math: "25 is a perfect square (5 squared). It is the smallest square that is also the sum of two squares: 9 + 16 = 25." },
  26: { trivia: "26 is the number of letters in the English alphabet. The atomic number of iron, which is essential for life, is 26.", math: "26 is one more than a square (5 squared + 1). It is the number of sporadic finite simple groups in mathematics." },
  27: { trivia: "27 is the age at which many famous musicians died, forming the '27 Club' including Jimi Hendrix, Janis Joplin, and Kurt Cobain.", math: "27 is a perfect cube (3 cubed). It is also the number of cubes needed to build a 3x3x3 Rubik's cube." },
  28: { trivia: "28 is the second perfect number (1 + 2 + 4 + 7 + 14 = 28). The lunar cycle takes approximately 28 days.", math: "28 is the second perfect number: the sum of its proper divisors equals itself. It is also a triangular number." },
  29: { trivia: "29 is the number of days in February in a leap year. The 29th President of the United States was Warren G. Harding.", math: "29 is a prime number. It is the smallest prime that is the sum of three consecutive squares: 2 squared + 3 squared + 4 squared = 29." },
  30: { trivia: "30 is the number of days in many months. A person in their thirties is said to be in their prime. The 30 Years' War reshaped Europe.", math: "30 is the sum of the first four square numbers (1+4+9+16). It is a square pyramidal number and the smallest sphenic number." },
  40: { trivia: "40 is a number of testing and trial in many religions: 40 days of rain, 40 years in the desert, 40 days of Lent. Ali Baba had 40 thieves.", math: "40 is an octagonal number. It is the sum of the first 4 triangular numbers: 1 + 3 + 6 + 10 + 20 = 40." },
  42: { trivia: "42 is the Answer to the Ultimate Question of Life, the Universe, and Everything, according to The Hitchhiker's Guide to the Galaxy by Douglas Adams.", math: "42 is a sphenic number (2 times 3 times 7). It is also a Catalan number and the sum of the first 3 powers of 2 (2+4+8) plus 28." },
  50: { trivia: "50 is the number of states in the United States of America. A golden jubilee celebrates 50 years. The Roman numeral for 50 is L.", math: "50 is the smallest number that can be written as the sum of two squares in two different ways: 1+49 and 25+25." },
  60: { trivia: "60 is the number of seconds in a minute and minutes in an hour, a legacy of the ancient Sumerian base-60 number system.", math: "60 is a highly composite number with 12 divisors. It is the smallest number divisible by 1 through 6. The Babylonians used base 60." },
  69: { trivia: "69 is the atomic number of thulium. In popular culture, it has a notable meaning as a reciprocal number.", math: "69 is a semiprime (3 times 23). 69 squared is 4761, and 69 cubed is 328509." },
  100: { trivia: "100 is the basis of percentage calculations. A century equals 100 years. The number 100 symbolizes completeness and perfection across cultures.", math: "100 is 10 squared. It is the sum of the first 9 odd numbers. It is also a Leyland number." },
  144: { trivia: "144 is a gross (12 dozen). It is also the 12th Fibonacci number and the only Fibonacci number that is also a perfect square (other than 1).", math: "144 is 12 squared and the 12th Fibonacci number. It is the only Fibonacci number (besides 1) that is a perfect square." },
  200: { trivia: "200 is the HTTP status code for success. A bicentennial celebrates 200 years.", math: "200 is an abundant number. It is the sum of the first 8 triangular numbers." },
  256: { trivia: "256 is the number of values representable in a single byte (8 bits). It is fundamental to computing and digital systems.", math: "256 is 2 to the 8th power. It is a perfect square (16 squared) and a perfect 4th power (4 to the 4th)." },
  360: { trivia: "360 is the number of degrees in a full circle. This convention dates back to the ancient Babylonians and Sumerians.", math: "360 is a highly composite number with 24 divisors. It is divisible by every integer from 1 to 10 except 7." },
  365: { trivia: "365 is the number of days in a common year. It takes Earth approximately 365.24 days to orbit the Sun.", math: "365 is a semiprime (5 times 73). It is also the sum of the squares of two consecutive integers: 13 squared plus 14 squared." },
  500: { trivia: "500 is the number of miles in the Indianapolis 500 race. The Fortune 500 lists America's largest companies.", math: "500 is an abundant number. It is 5 times 100, and it can be expressed as the sum of consecutive primes in multiple ways." },
  666: { trivia: "666 is the Number of the Beast in the Book of Revelation. In mathematics, it is the sum of the first 36 natural numbers.", math: "666 is the sum of the first 36 natural numbers. It is a triangular number, a repdigit, and a palindromic number." },
  777: { trivia: "777 is considered a lucky number and is associated with jackpot slot machines. In aviation, the Boeing 777 is a popular wide-body aircraft.", math: "777 is a Harshad number (divisible by the sum of its digits: 7+7+7=21, and 777/21=37). It is also a repdigit." },
  1000: { trivia: "1000 is the number of years in a millennium. A grand is slang for 1000 dollars. The prefix kilo- means 1000.", math: "1000 is 10 cubed. It is the sum of the first 15 triangular numbers. In Roman numerals, 1000 is represented as M." },
  1947: { trivia: "1947 is the year Pakistan gained independence on August 14th. It was also the year the Dead Sea Scrolls were discovered.", year: "1947 was a pivotal year: Pakistan and India gained independence, the Cold War began, and the first AK-47 rifle was designed." },
  1969: { trivia: "1969 is the year humans first walked on the Moon during the Apollo 11 mission. The Woodstock festival also took place.", year: "1969 was a landmark year: the Apollo 11 Moon landing, Woodstock, the Concorde's first flight, and the ARPANET (predecessor of the Internet) was created." },
  2000: { trivia: "2000 is a leap year and the start of the 3rd millennium. It is also the number of pounds in a short ton.", year: "The year 2000 (Y2K) was marked by global celebrations and concerns about computer systems handling the date change. It was also a leap year." },
};

// ── FACT GENERATORS (for numbers not in specific database) ──────────
const GENERATORS = {
  trivia: (n) => {
    const templates = [
      `${n} is a fascinating number that appears in various mathematical contexts and real-world applications throughout science, nature, and culture.`,
      `${n} has interesting properties in number theory. It appears in sequences, patterns, and mathematical relationships that connect different areas of mathematics.`,
      `The number ${n} shows up in surprising places: from the arrangement of petals in flowers to the structure of crystals and the rhythms of music.`,
      `${n} is connected to fundamental mathematical concepts. Mathematicians have studied its properties extensively, revealing deep connections to other numbers and patterns.`,
      `In the study of numbers, ${n} holds a unique position. Its properties make it useful in fields ranging from cryptography to engineering to art.`,
      `${n} appears in nature more often than you might expect. From the spirals of galaxies to the patterns of snowflakes, numbers like ${n} shape our world.`,
    ];
    return templates[Math.abs(n) % templates.length];
  },
  math: (n) => {
    const isPrime = checkPrime(n);
    const isEven = n % 2 === 0;
    const isSquare = Math.sqrt(n) === Math.floor(Math.sqrt(n));
    const isCube = Math.cbrt(n) === Math.floor(Math.cbrt(n));

    const facts = [];
    if (isPrime) facts.push(`${n} is a prime number — it can only be divided by 1 and itself.`);
    if (isEven) facts.push(`${n} is an even number.`);
    if (isSquare) facts.push(`${n} is a perfect square (${Math.sqrt(n)} squared).`);
    if (isCube) facts.push(`${n} is a perfect cube (${Math.cbrt(n)} cubed).`);
    if (!isPrime && n > 1) {
      const factors = getFactors(n);
      facts.push(`${n} is a composite number with factors: ${factors.join(", ")}.`);
    }
    if (n > 1) facts.push(`The sum of the digits of ${n} is ${String(n).split("").reduce((a, b) => a + parseInt(b), 0)}.`);
    if (facts.length > 0) return facts.join(" ");

    return `${n} is an interesting number in mathematics with unique properties and relationships to other numbers.`;
  },
  year: (n) => {
    if (n < 0) return `The year ${Math.abs(n)} BCE was part of the ancient world, before the common era. Many civilizations rose and fell during this period.`;
    if (n < 500) return `The year ${n} CE was part of antiquity. Great empires, scientific discoveries, and cultural developments shaped human civilization.`;
    if (n < 1000) return `The year ${n} was part of the early medieval period. Civilizations around the world were developing independently, from the Islamic Golden Age to the Tang Dynasty in China.`;
    if (n < 1500) return `The year ${n} was part of the late medieval period. Trade routes expanded, universities were founded, and the Renaissance was beginning to bloom in Italy.`;
    if (n < 1700) return `The year ${n} fell during the Age of Exploration and the Scientific Revolution. New worlds were being discovered and old ideas were being challenged.`;
    if (n < 1800) return `The year ${n} was part of the Enlightenment era. Revolutionary ideas about freedom, reason, and democracy were transforming nations.`;
    if (n < 1900) return `The year ${n} was part of the Industrial Revolution. Rapid technological advances were reshaping society, from steam power to telegraph communications.`;
    if (n < 1950) return `The year ${n} was marked by world wars and their aftermath. The global order was being reshaped, and the fight for independence swept across colonies.`;
    if (n < 2000) return `The year ${n} was part of the Cold War era and the digital revolution. Space exploration, computing, and globalization were transforming the world.`;
    if (n <= new Date().getFullYear()) return `The year ${n} is part of the modern era. Technology, connectivity, and global challenges are defining this period of human history.`;
    return `The year ${n} is in the future. What discoveries and events await humanity in this year?`;
  },
  date: (n) => {
    // This shouldn't normally be called since dates use generateDateFact,
    // but provide a fallback just in case
    return `${n} is associated with interesting historical events and mathematical properties.`;
  },
};
