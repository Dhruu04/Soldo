/**
 * Semantic NLP Engine for Soldo AI Assistant
 *
 * Instead of brittle keyword matching, this engine:
 *  1. Normalises input (accents, typos, abbreviations)
 *  2. Tokenises into words and n-grams
 *  3. Maps tokens to semantic "concepts" via a bilingual synonym dictionary
 *  4. Scores each intent against the activated concept set
 *  5. Returns the highest-scoring intent with extracted entities (time range, product, etc.)
 *
 * The concept approach means that "how much money did I make" activates the same
 * concept as "quanto ho incassato" or "fatturato" — the engine understands MEANING.
 */

import type { Product } from "./types";
import { formatEUR } from "./store";

// ─── TEXT NORMALISATION ──────────────────────────────────────────────────────

/** Strip diacritics, lowercase, collapse whitespace, fix common typos */
export function normalizeText(raw: string): string {
  let t = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents: è→e, ù→u, ì→i, etc.
    .replace(/[''`]/g, " ")          // smart quotes → space
    .replace(/[?!.,:;…""„«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Common abbreviations & typos → canonical form
  const fixes: [RegExp, string][] = [
    // Italian typos / shorthand
    [/\bqnt[oa]?\b/g, "quanto"],
    [/\bqnti?\b/g, "quanti"],
    [/\bprodot+o\b/g, "prodotto"],
    [/\bvendut[oeai]\b/g, "venduto"],
    [/\bguadagn(?:at)?o\b/g, "guadagnato"],
    [/\bincass(?:at)?o\b/g, "incassato"],
    [/\bfatuirato\b/g, "fatturato"],
    [/\bfatturat+o\b/g, "fatturato"],
    [/\bmagaz+ino\b/g, "magazzino"],
    [/\bscort[ae]?\b/g, "scorta"],
    [/\bspes[ae]?\b/g, "spesa"],
    [/\bscontrin[oi]\b/g, "scontrino"],
    [/\bprofitt?o\b/g, "profitto"],
    [/\bmarginn?e\b/g, "margine"],
    [/\butill?e\b/g, "utile"],
    [/\bconfront[oa]\b/g, "confronta"],
    [/\bcategori[ae]\b/g, "categoria"],
    [/\bdipendent[ie]\b/g, "dipendente"],
    [/\bcontant[ie]\b/g, "contanti"],
    [/\belettronico\b/g, "elettronico"],
    [/\bsettimann?a\b/g, "settimana"],
    [/\bmes[ie]\b/g, "mese"],
    [/\bgiornn?[oi]\b/g, "giorno"],
    [/\boggg?i\b/g, "oggi"],
    [/\bierr?i\b/g, "ieri"],
    // English typos
    [/\bseling\b/g, "selling"],
    [/\bearings?\b/g, "earnings"],
    [/\brevneue\b/g, "revenue"],
    [/\binventroy\b/g, "inventory"],
    [/\bexpens[ei]s?\b/g, "expenses"],
    [/\bproffit\b/g, "profit"],
    [/\bprodcut\b/g, "product"],
    [/\btuesd[ae]y\b/g, "tuesday"],
    [/\bwensday\b/g, "wednesday"],
    [/\bthrusday\b/g, "thursday"],
    [/\bsatruday\b/g, "saturday"],
    [/\bsunady\b/g, "sunday"],
  ];

  for (const [pat, repl] of fixes) {
    t = t.replace(pat, repl);
  }

  return t;
}

// ─── SEMANTIC CONCEPT SYSTEM ─────────────────────────────────────────────────
// Each "concept" is a semantic idea. Multiple words/phrases map to the same concept.
// The intent classifier works on concepts, not raw keywords.

export type Concept =
  // Informational intents
  | "REVENUE"       // money coming in
  | "EXPENSE"       // money going out
  | "PROFIT"        // net gain/margin
  | "BEST_SELLING"  // top/most popular product
  | "STOCK"         // inventory/availability
  | "ORDER_COUNT"   // how many receipts/sales
  | "AVG_TICKET"    // average order value
  | "CATEGORY"      // breakdown by category
  | "PAYMENT_SPLIT" // cash vs card
  | "LOW_STOCK"     // items running out
  | "COMPARE"       // comparison between periods
  | "SHIFT_INFO"    // till/drawer/shift
  | "STAFF_INFO"    // employees/who's working
  | "EXPIRING"      // lots expiring soon
  // Meta
  | "GREETING"
  | "HELP"
  | "THANKS"
  // Time modifiers
  | "TIME_TODAY"
  | "TIME_YESTERDAY"
  | "TIME_WEEK"
  | "TIME_MONTH"
  | "TIME_YEAR"
  | "TIME_LAST_WEEK"
  | "TIME_LAST_MONTH"
  | "TIME_ALL_TIME"
  // Quantitative
  | "HOW_MUCH"
  | "HOW_MANY"
  | "WHICH"
  | "WHAT"
  | "WHO"
  | "LIST"
  ;

/**
 * Bilingual synonym dictionary. Each entry is [phrase, concept, weight].
 * Phrases can be multi-word (matched as n-grams). Weight defaults to 1.
 * Higher weight = stronger signal for that concept.
 */
const SYNONYMS: [string, Concept, number?][] = [
  // ────── REVENUE ──────
  ["revenue",        "REVENUE", 2],
  ["earned",         "REVENUE", 1.5],
  ["earn",           "REVENUE", 1.5],
  ["earnings",       "REVENUE", 2],
  ["income",         "REVENUE", 1.5],
  ["turnover",       "REVENUE", 2],
  ["sales total",    "REVENUE", 2],
  ["total sales",    "REVENUE", 2],
  ["gross",          "REVENUE", 1],
  ["made",           "REVENUE", 0.8],
  ["money",          "REVENUE", 0.5],
  ["collected",      "REVENUE", 1],
  ["sold",           "REVENUE", 1],
  ["sales",          "REVENUE", 1],
  ["sell",           "REVENUE", 0.8],
  ["ricavo",         "REVENUE", 2],
  ["ricavi",         "REVENUE", 2],
  ["incasso",        "REVENUE", 2],
  ["incassato",      "REVENUE", 2],
  ["fatturato",      "REVENUE", 2],
  ["guadagnato",     "REVENUE", 1.5],
  ["guadagno",       "REVENUE", 1.5],
  ["vendite",        "REVENUE", 1],
  ["venduto",        "REVENUE", 1],
  ["soldi",          "REVENUE", 0.5],
  ["entrate",        "REVENUE", 1.5],
  ["totale vendite", "REVENUE", 2.5],
  ["totale incassato","REVENUE", 2.5],
  ["how much did i make", "REVENUE", 3],
  ["quanto ho incassato", "REVENUE", 3],
  ["quanto ho guadagnato", "REVENUE", 3],
  ["quanto ho venduto", "REVENUE", 2.5],
  ["quanto ho fatturato", "REVENUE", 3],

  // ────── EXPENSE ──────
  ["expenses",       "EXPENSE", 2],
  ["expense",        "EXPENSE", 2],
  ["cost",           "EXPENSE", 1],
  ["costs",          "EXPENSE", 1.5],
  ["spending",       "EXPENSE", 2],
  ["spent",          "EXPENSE", 2],
  ["spend",          "EXPENSE", 1.5],
  ["outgoings",      "EXPENSE", 2],
  ["bills",          "EXPENSE", 1.5],
  ["overhead",       "EXPENSE", 1.5],
  ["payments",       "EXPENSE", 1],
  ["spesa",          "EXPENSE", 2],
  ["spese",          "EXPENSE", 2],
  ["uscite",         "EXPENSE", 2],
  ["bollette",       "EXPENSE", 1.5],
  ["costi",          "EXPENSE", 1.5],
  ["pagamenti",      "EXPENSE", 1],
  ["quanto ho speso", "EXPENSE", 3],
  ["how much did i spend", "EXPENSE", 3],

  // ────── PROFIT ──────
  ["profit",         "PROFIT", 2],
  ["net profit",     "PROFIT", 3],
  ["net income",     "PROFIT", 2.5],
  ["margin",         "PROFIT", 2],
  ["gross margin",   "PROFIT", 2.5],
  ["markup",         "PROFIT", 1.5],
  ["bottom line",    "PROFIT", 2],
  ["profitto",       "PROFIT", 2],
  ["margine",        "PROFIT", 2],
  ["utile",          "PROFIT", 2],
  ["utile netto",    "PROFIT", 3],
  ["margine lordo",  "PROFIT", 2.5],
  ["guadagno netto", "PROFIT", 3],
  ["quanto ho di profitto", "PROFIT", 3],

  // ────── BEST SELLING ──────
  ["best selling",   "BEST_SELLING", 3],
  ["best seller",    "BEST_SELLING", 3],
  ["top product",    "BEST_SELLING", 3],
  ["top seller",     "BEST_SELLING", 3],
  ["most sold",      "BEST_SELLING", 3],
  ["most popular",   "BEST_SELLING", 3],
  ["popular",        "BEST_SELLING", 1.5],
  ["fast moving",    "BEST_SELLING", 2],
  ["top selling",    "BEST_SELLING", 3],
  ["best",           "BEST_SELLING", 0.8],
  ["top",            "BEST_SELLING", 0.8],
  ["piu venduto",    "BEST_SELLING", 3],
  ["prodotto migliore", "BEST_SELLING", 2.5],
  ["cosa si vende di piu", "BEST_SELLING", 3.5],
  ["cosa va di piu", "BEST_SELLING", 3],
  ["cosa vendo di piu", "BEST_SELLING", 3],
  ["cosa vendo meglio", "BEST_SELLING", 3],
  ["prodotto piu popolare", "BEST_SELLING", 3],
  ["quale prodotto", "BEST_SELLING", 1],
  ["venduto di piu", "BEST_SELLING", 3],

  // ────── STOCK / INVENTORY ──────
  ["stock",          "STOCK", 2],
  ["inventory",      "STOCK", 2],
  ["in stock",       "STOCK", 2.5],
  ["availability",   "STOCK", 2],
  ["available",      "STOCK", 1.5],
  ["remaining",      "STOCK", 1.5],
  ["left",           "STOCK", 1],
  ["units",          "STOCK", 1],
  ["warehouse",      "STOCK", 1.5],
  ["scorta",         "STOCK", 2],
  ["scorte",         "STOCK", 2],
  ["giacenza",       "STOCK", 2],
  ["giacenze",       "STOCK", 2],
  ["magazzino",      "STOCK", 2],
  ["inventario",     "STOCK", 2],
  ["disponibilita",  "STOCK", 2],
  ["disponibile",    "STOCK", 1.5],
  ["rimasto",        "STOCK", 1.5],
  ["rimanenza",      "STOCK", 2],
  ["quanti ne ho",   "STOCK", 2.5],
  ["quanto ne ho",   "STOCK", 2.5],
  ["quante unita",   "STOCK", 2.5],
  ["how much do i have", "STOCK", 2.5],
  ["how many do i have", "STOCK", 2.5],

  // ────── ORDER COUNT ──────
  ["how many orders", "ORDER_COUNT", 3],
  ["how many sales",  "ORDER_COUNT", 3],
  ["number of sales", "ORDER_COUNT", 3],
  ["number of orders","ORDER_COUNT", 3],
  ["receipts",       "ORDER_COUNT", 1.5],
  ["receipt count",  "ORDER_COUNT", 2.5],
  ["transactions",   "ORDER_COUNT", 1.5],
  ["quanti ordini",  "ORDER_COUNT", 3],
  ["quante vendite", "ORDER_COUNT", 3],
  ["quanti scontrini","ORDER_COUNT", 3],
  ["numero di vendite","ORDER_COUNT", 3],
  ["scontrini",      "ORDER_COUNT", 1.5],
  ["scontrino",      "ORDER_COUNT", 1],
  ["quante transazioni","ORDER_COUNT", 3],

  // ────── AVG TICKET ──────
  ["average order",  "AVG_TICKET", 3],
  ["average ticket", "AVG_TICKET", 3],
  ["avg ticket",     "AVG_TICKET", 3],
  ["average sale",   "AVG_TICKET", 2.5],
  ["average value",  "AVG_TICKET", 2],
  ["mean order",     "AVG_TICKET", 2.5],
  ["scontrino medio","AVG_TICKET", 3],
  ["vendita media",  "AVG_TICKET", 3],
  ["media vendite",  "AVG_TICKET", 2.5],
  ["valore medio",   "AVG_TICKET", 2.5],
  ["ordine medio",   "AVG_TICKET", 3],

  // ────── CATEGORY BREAKDOWN ──────
  ["by category",    "CATEGORY", 3],
  ["per category",   "CATEGORY", 2.5],
  ["category breakdown", "CATEGORY", 3],
  ["categories",     "CATEGORY", 1.5],
  ["per categoria",  "CATEGORY", 3],
  ["categorie",      "CATEGORY", 1.5],
  ["suddivisione",   "CATEGORY", 1.5],
  ["diviso per categoria", "CATEGORY", 3],
  ["vendite per categoria", "CATEGORY", 3.5],

  // ────── PAYMENT SPLIT ──────
  ["cash vs card",   "PAYMENT_SPLIT", 3.5],
  ["card vs cash",   "PAYMENT_SPLIT", 3.5],
  ["payment method", "PAYMENT_SPLIT", 2.5],
  ["payment mix",    "PAYMENT_SPLIT", 2.5],
  ["payment breakdown", "PAYMENT_SPLIT", 3],
  ["cash or card",   "PAYMENT_SPLIT", 2],
  ["electronic",     "PAYMENT_SPLIT", 1],
  ["contanti o carta", "PAYMENT_SPLIT", 3],
  ["contanti vs carta", "PAYMENT_SPLIT", 3.5],
  ["metodo di pagamento", "PAYMENT_SPLIT", 2.5],
  ["mix pagamenti",  "PAYMENT_SPLIT", 2.5],
  ["quanti in contanti", "PAYMENT_SPLIT", 3],
  ["quanti con carta", "PAYMENT_SPLIT", 3],
  ["pagato in contanti", "PAYMENT_SPLIT", 2],
  ["pagato con carta", "PAYMENT_SPLIT", 2],

  // ────── LOW STOCK ──────
  ["low stock",      "LOW_STOCK", 3],
  ["running out",    "LOW_STOCK", 2.5],
  ["running low",    "LOW_STOCK", 2.5],
  ["out of stock",   "LOW_STOCK", 2.5],
  ["about to run out","LOW_STOCK", 3],
  ["need to reorder","LOW_STOCK", 2.5],
  ["reorder",        "LOW_STOCK", 1.5],
  ["almost finished","LOW_STOCK", 2],
  ["scorte basse",   "LOW_STOCK", 3],
  ["sta finendo",    "LOW_STOCK", 2.5],
  ["stanno finendo", "LOW_STOCK", 2.5],
  ["esaurito",       "LOW_STOCK", 2],
  ["in esaurimento", "LOW_STOCK", 2.5],
  ["riordinare",     "LOW_STOCK", 1.5],
  ["prodotti in esaurimento", "LOW_STOCK", 3.5],
  ["quali prodotti stanno finendo", "LOW_STOCK", 4],
  ["prodotti da riordinare", "LOW_STOCK", 3],

  // ────── COMPARE ──────
  ["compare",        "COMPARE", 2],
  ["comparison",     "COMPARE", 2],
  ["versus",         "COMPARE", 2],
  ["vs",             "COMPARE", 1.5],
  ["compared to",    "COMPARE", 2.5],
  ["difference",     "COMPARE", 1.5],
  ["confronta",      "COMPARE", 2],
  ["confronto",      "COMPARE", 2],
  ["rispetto a",     "COMPARE", 2.5],
  ["paragonato a",   "COMPARE", 2],
  ["differenza",     "COMPARE", 1.5],
  ["andamento",      "COMPARE", 1],

  // ────── SHIFT / TILL ──────
  ["shift",          "SHIFT_INFO", 2],
  ["till",           "SHIFT_INFO", 2],
  ["drawer",         "SHIFT_INFO", 2],
  ["cash drawer",    "SHIFT_INFO", 2.5],
  ["register",       "SHIFT_INFO", 1.5],
  ["cash in drawer", "SHIFT_INFO", 3],
  ["shift summary",  "SHIFT_INFO", 3],
  ["turno",          "SHIFT_INFO", 2],
  ["cassa",          "SHIFT_INFO", 1.5],
  ["cassetto",       "SHIFT_INFO", 2],
  ["turno attuale",  "SHIFT_INFO", 3],
  ["stato cassa",    "SHIFT_INFO", 2.5],
  ["riepilogo turno","SHIFT_INFO", 3],

  // ────── STAFF ──────
  ["staff",          "STAFF_INFO", 2],
  ["employee",       "STAFF_INFO", 1.5],
  ["employees",      "STAFF_INFO", 1.5],
  ["clocked in",     "STAFF_INFO", 2.5],
  ["on duty",        "STAFF_INFO", 2],
  ["working",        "STAFF_INFO", 1],
  ["who is working", "STAFF_INFO", 3],
  ["dipendente",     "STAFF_INFO", 1.5],
  ["dipendenti",     "STAFF_INFO", 1.5],
  ["personale",      "STAFF_INFO", 1.5],
  ["in servizio",    "STAFF_INFO", 2.5],
  ["chi lavora",     "STAFF_INFO", 3],
  ["chi e in servizio", "STAFF_INFO", 3.5],
  ["chi sta lavorando", "STAFF_INFO", 3],

  // ────── EXPIRING ──────
  ["expiring",       "EXPIRING", 2],
  ["expiry",         "EXPIRING", 2],
  ["expire",         "EXPIRING", 1.5],
  ["expiration",     "EXPIRING", 2],
  ["about to expire","EXPIRING", 3],
  ["going bad",      "EXPIRING", 2],
  ["scadenza",       "EXPIRING", 2],
  ["scadenze",       "EXPIRING", 2],
  ["in scadenza",    "EXPIRING", 2.5],
  ["sta scadendo",   "EXPIRING", 2.5],
  ["stanno scadendo","EXPIRING", 2.5],
  ["lotti in scadenza","EXPIRING", 3],
  ["prodotti in scadenza","EXPIRING", 3],

  // ────── GREETING ──────
  ["hello",          "GREETING", 2],
  ["hi",             "GREETING", 2],
  ["hey",            "GREETING", 2],
  ["good morning",   "GREETING", 2],
  ["good afternoon", "GREETING", 2],
  ["good evening",   "GREETING", 2],
  ["ciao",           "GREETING", 2],
  ["buongiorno",     "GREETING", 2],
  ["buonasera",      "GREETING", 2],
  ["salve",          "GREETING", 2],

  // ────── HELP ──────
  ["help",           "HELP", 2],
  ["what can you do","HELP", 3],
  ["how do you work","HELP", 2.5],
  ["what do you know","HELP", 2.5],
  ["capabilities",   "HELP", 2],
  ["aiuto",          "HELP", 2],
  ["cosa puoi fare", "HELP", 3],
  ["come funzioni",  "HELP", 2.5],
  ["cosa sai fare",  "HELP", 3],

  // ────── THANKS ──────
  ["thanks",         "THANKS", 2],
  ["thank you",      "THANKS", 2.5],
  ["grazie",         "THANKS", 2],
  ["grazie mille",   "THANKS", 2.5],

  // ────── TIME ──────
  ["today",          "TIME_TODAY", 2],
  ["oggi",           "TIME_TODAY", 2],
  ["yesterday",      "TIME_YESTERDAY", 2],
  ["ieri",           "TIME_YESTERDAY", 2],
  ["this week",      "TIME_WEEK", 2],
  ["questa settimana","TIME_WEEK", 2],
  ["settimana",      "TIME_WEEK", 1],
  ["week",           "TIME_WEEK", 1],
  ["this month",     "TIME_MONTH", 2],
  ["questo mese",    "TIME_MONTH", 2],
  ["mese",           "TIME_MONTH", 1],
  ["month",          "TIME_MONTH", 1],
  ["this year",      "TIME_YEAR", 2],
  ["quest anno",     "TIME_YEAR", 2],
  ["anno",           "TIME_YEAR", 1],
  ["year",           "TIME_YEAR", 1],
  ["last week",      "TIME_LAST_WEEK", 2.5],
  ["scorsa settimana","TIME_LAST_WEEK", 2.5],
  ["settimana scorsa","TIME_LAST_WEEK", 2.5],
  ["last month",     "TIME_LAST_MONTH", 2.5],
  ["mese scorso",    "TIME_LAST_MONTH", 2.5],
  ["scorso mese",    "TIME_LAST_MONTH", 2.5],
  ["all time",       "TIME_ALL_TIME", 2],
  ["ever",           "TIME_ALL_TIME", 1.5],
  ["always",         "TIME_ALL_TIME", 1],
  ["di sempre",      "TIME_ALL_TIME", 2],
  ["sempre",         "TIME_ALL_TIME", 1.5],
  ["da sempre",      "TIME_ALL_TIME", 2],
  ["dall inizio",    "TIME_ALL_TIME", 2],
  ["in totale",      "TIME_ALL_TIME", 1.5],

  // ────── QUESTION WORDS ──────
  ["how much",       "HOW_MUCH", 1],
  ["quanto",         "HOW_MUCH", 1],
  ["quanta",         "HOW_MUCH", 1],
  ["how many",       "HOW_MANY", 1],
  ["quanti",         "HOW_MANY", 1],
  ["quante",         "HOW_MANY", 1],
  ["which",          "WHICH", 0.5],
  ["quale",          "WHICH", 0.5],
  ["quali",          "WHICH", 0.5],
  ["what",           "WHAT", 0.5],
  ["cosa",           "WHAT", 0.5],
  ["che",            "WHAT", 0.3],
  ["who",            "WHO", 1],
  ["chi",            "WHO", 1],
  ["list",           "LIST", 1],
  ["show",           "LIST", 0.8],
  ["mostra",         "LIST", 0.8],
  ["elenca",         "LIST", 1],
  ["dimmi",          "LIST", 0.8],
  ["tell me",        "LIST", 0.8],
];

// Pre-sort synonyms by phrase length descending (longest match first)
const SORTED_SYNONYMS = [...SYNONYMS].sort((a, b) => b[0].length - a[0].length);

// ─── CONCEPT EXTRACTION ──────────────────────────────────────────────────────

interface ConceptMatch {
  concept: Concept;
  weight: number;
  matchedPhrase: string;
}

/** Extract all concept matches from normalised text */
export function extractConcepts(normalised: string): ConceptMatch[] {
  const matches: ConceptMatch[] = [];
  const usedRanges: [number, number][] = []; // prevent overlapping matches

  // 1. Exact phrase matching (longest phrase first)
  for (const [phrase, concept, weight] of SORTED_SYNONYMS) {
    const normPhrase = phrase
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    let searchFrom = 0;
    while (true) {
      const idx = normalised.indexOf(normPhrase, searchFrom);
      if (idx === -1) break;

      const end = idx + normPhrase.length;

      // Check word boundaries (don't match "earning" inside "bearning")
      const before = idx === 0 || /\s/.test(normalised[idx - 1]);
      const after = end >= normalised.length || /\s/.test(normalised[end]);

      if (before && after) {
        // Check no overlap with existing matches
        const overlaps = usedRanges.some(
          ([s, e]) => (idx >= s && idx < e) || (end > s && end <= e)
        );

        if (!overlaps) {
          matches.push({ concept, weight: weight ?? 1, matchedPhrase: phrase });
          usedRanges.push([idx, end]);
        }
      }

      searchFrom = idx + 1;
    }
  }

  // 2. Fuzzy token matching for remaining unmatched words (length >= 4)
  const wordsWithIndices: { word: string; start: number; end: number }[] = [];
  const regex = /[a-z0-9]+/g;
  let match;
  while ((match = regex.exec(normalised)) !== null) {
    wordsWithIndices.push({
      word: match[0],
      start: match.index,
      end: regex.lastIndex,
    });
  }

  for (const { word, start, end } of wordsWithIndices) {
    const overlaps = usedRanges.some(
      ([s, e]) => (start >= s && start < e) || (end > s && end <= e)
    );
    if (overlaps) continue;
    if (word.length < 4) continue;

    let bestFuzzyConcept: Concept | null = null;
    let bestFuzzyWeight = 0;
    let bestFuzzySim = 0;
    let bestFuzzyPhrase = "";

    for (const [phrase, concept, weight] of SORTED_SYNONYMS) {
      const synWords = phrase.split(/\s+/);
      for (const sw of synWords) {
        if (sw.length < 4) continue;
        const sim = similarity(word, sw);
        if (sim >= 0.75 && sim > bestFuzzySim) {
          bestFuzzySim = sim;
          bestFuzzyConcept = concept;
          bestFuzzyWeight = weight ?? 1;
          bestFuzzyPhrase = phrase;
        }
      }
    }

    if (bestFuzzyConcept && bestFuzzySim >= 0.75) {
      const finalWeight = bestFuzzyWeight * bestFuzzySim * 0.8;
      matches.push({
        concept: bestFuzzyConcept,
        weight: finalWeight,
        matchedPhrase: `${word} (fuzzy ~ ${bestFuzzyPhrase})`,
      });
      usedRanges.push([start, end]);
    }
  }

  return matches;
}


// ─── INTENT CLASSIFICATION ───────────────────────────────────────────────────

export type IntentType =
  | "revenue"
  | "expense"
  | "profit"
  | "best_selling"
  | "stock"
  | "order_count"
  | "avg_ticket"
  | "category_breakdown"
  | "payment_split"
  | "low_stock"
  | "compare"
  | "shift_info"
  | "staff_info"
  | "expiring"
  | "greeting"
  | "help"
  | "thanks"
  | "unknown";

interface IntentRule {
  intent: IntentType;
  /** Primary concepts that strongly indicate this intent */
  primary: Concept[];
  /** Boost concepts that add weight when present alongside primary */
  boost?: Concept[];
  /** Base weight for this intent */
  baseWeight: number;
}

const INTENT_RULES: IntentRule[] = [
  {
    intent: "revenue",
    primary: ["REVENUE"],
    boost: ["HOW_MUCH", "TIME_TODAY", "TIME_YESTERDAY", "TIME_WEEK", "TIME_MONTH"],
    baseWeight: 0,
  },
  {
    intent: "expense",
    primary: ["EXPENSE"],
    boost: ["HOW_MUCH", "TIME_TODAY", "TIME_YESTERDAY", "TIME_WEEK", "TIME_MONTH"],
    baseWeight: 0,
  },
  {
    intent: "profit",
    primary: ["PROFIT"],
    boost: ["HOW_MUCH", "REVENUE", "EXPENSE"],
    baseWeight: 0,
  },
  {
    intent: "best_selling",
    primary: ["BEST_SELLING"],
    boost: ["WHICH", "WHAT", "TIME_WEEK", "TIME_MONTH", "TIME_ALL_TIME"],
    baseWeight: 0,
  },
  {
    intent: "stock",
    primary: ["STOCK"],
    boost: ["HOW_MUCH", "HOW_MANY", "LIST"],
    baseWeight: 0,
  },
  {
    intent: "order_count",
    primary: ["ORDER_COUNT"],
    boost: ["HOW_MANY", "TIME_TODAY", "TIME_YESTERDAY"],
    baseWeight: 0,
  },
  {
    intent: "avg_ticket",
    primary: ["AVG_TICKET"],
    boost: ["HOW_MUCH", "TIME_WEEK", "TIME_MONTH"],
    baseWeight: 0,
  },
  {
    intent: "category_breakdown",
    primary: ["CATEGORY"],
    boost: ["REVENUE", "EXPENSE", "LIST"],
    baseWeight: 0,
  },
  {
    intent: "payment_split",
    primary: ["PAYMENT_SPLIT"],
    boost: ["HOW_MUCH", "HOW_MANY"],
    baseWeight: 0,
  },
  {
    intent: "low_stock",
    primary: ["LOW_STOCK"],
    boost: ["WHICH", "WHAT", "LIST", "STOCK"],
    baseWeight: 0,
  },
  {
    intent: "compare",
    primary: ["COMPARE"],
    boost: ["REVENUE", "EXPENSE", "PROFIT"],
    baseWeight: 0,
  },
  {
    intent: "shift_info",
    primary: ["SHIFT_INFO"],
    boost: ["HOW_MUCH", "WHAT"],
    baseWeight: 0,
  },
  {
    intent: "staff_info",
    primary: ["STAFF_INFO"],
    boost: ["WHO", "LIST"],
    baseWeight: 0,
  },
  {
    intent: "expiring",
    primary: ["EXPIRING"],
    boost: ["WHICH", "WHAT", "LIST", "STOCK"],
    baseWeight: 0,
  },
  {
    intent: "greeting",
    primary: ["GREETING"],
    boost: [],
    baseWeight: 0,
  },
  {
    intent: "help",
    primary: ["HELP"],
    boost: [],
    baseWeight: 0,
  },
  {
    intent: "thanks",
    primary: ["THANKS"],
    boost: [],
    baseWeight: 0,
  },
];

export interface ClassifiedIntent {
  intent: IntentType;
  score: number;
  concepts: ConceptMatch[];
}

export function classifyIntent(normalised: string): ClassifiedIntent {
  const concepts = extractConcepts(normalised);

  if (concepts.length === 0) {
    return { intent: "unknown", score: 0, concepts: [] };
  }

  // Build concept weight map (sum weights for duplicate concepts)
  const conceptWeights = new Map<Concept, number>();
  for (const c of concepts) {
    conceptWeights.set(c.concept, (conceptWeights.get(c.concept) ?? 0) + c.weight);
  }

  let bestIntent: IntentType = "unknown";
  let bestScore = 0;

  for (const rule of INTENT_RULES) {
    let score = rule.baseWeight;

    // Sum primary concept weights
    for (const p of rule.primary) {
      score += conceptWeights.get(p) ?? 0;
    }

    // Add boost (at 50% weight) if primary was triggered
    if (score > 0 && rule.boost) {
      for (const b of rule.boost) {
        score += (conceptWeights.get(b) ?? 0) * 0.5;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIntent = score >= 1 ? rule.intent : "unknown";
    }
  }

  return { intent: bestIntent, score: bestScore, concepts };
}

// ─── TIME RANGE EXTRACTION ───────────────────────────────────────────────────

export interface TimeRange {
  start: Date;
  end: Date;
  label: string;
}

const DAY_MAP: Record<string, number> = {
  // Italian
  domenica: 0, lunedi: 1, martedi: 2, mercoledi: 3,
  giovedi: 4, venerdi: 5, sabato: 6,
  // English
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

const MONTH_MAP: Record<string, number> = {
  // Italian
  gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5,
  luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11,
  // English
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

export function extractTimeRange(normalised: string, concepts: ConceptMatch[], lang: string): TimeRange {
  const today = new Date();
  const startOfDay = (d: Date) => { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; };
  const endOfDay = (d: Date) => { const r = new Date(d); r.setHours(23, 59, 59, 999); return r; };

  const hasConcept = (c: Concept) => concepts.some((m) => m.concept === c);

  // Helper to parse a month name and return month index (0-11)
  const parseMonth = (str: string): number | null => {
    const s = str.trim().toLowerCase();
    for (const [monthName, monthNum] of Object.entries(MONTH_MAP)) {
      if (s === monthName || s.startsWith(monthName.slice(0, 3))) {
        return monthNum;
      }
    }
    return null;
  };

  // Helper to parse a date string
  const parseDateStr = (str: string): Date | null => {
    const clean = str.trim().toLowerCase();
    
    // YYYY-MM-DD
    const mIso = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (mIso) {
      return new Date(parseInt(mIso[1]), parseInt(mIso[2]) - 1, parseInt(mIso[3]));
    }
    
    // DD/MM/YYYY or DD-MM-YYYY
    const mDmy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (mDmy) {
      return new Date(parseInt(mDmy[3]), parseInt(mDmy[2]) - 1, parseInt(mDmy[1]));
    }
    
    // DD/MM or DD-MM
    const mDm = clean.match(/^(\d{1,2})[/-](\d{1,2})$/);
    if (mDm) {
      return new Date(today.getFullYear(), parseInt(mDm[2]) - 1, parseInt(mDm[1]));
    }
    
    // DD [month] (e.g. "1 maggio" or "may 1")
    const mDmWord1 = clean.match(/^(\d{1,2})\s+([a-z]+)$/);
    if (mDmWord1) {
      const monthIdx = parseMonth(mDmWord1[2]);
      if (monthIdx !== null) {
        return new Date(today.getFullYear(), monthIdx, parseInt(mDmWord1[1]));
      }
    }
    
    // [month] DD
    const mDmWord2 = clean.match(/^([a-z]+)\s+(\d{1,2})$/);
    if (mDmWord2) {
      const monthIdx = parseMonth(mDmWord2[1]);
      if (monthIdx !== null) {
        return new Date(today.getFullYear(), monthIdx, parseInt(mDmWord2[2]));
      }
    }
    
    return null;
  };

  // 1. Explicit range "from X to Y" / "da X a Y"
  const rangeMatch = normalised.match(/\b(?:from|da)\s+([a-z0-9/-]+(?:\s+[a-z]+)?)\s+(?:to|a)\s+([a-z0-9/-]+(?:\s+[a-z]+)?)\b/i);
  if (rangeMatch) {
    const startD = parseDateStr(rangeMatch[1]);
    const endD = parseDateStr(rangeMatch[2]);
    if (startD && endD) {
      return {
        start: startOfDay(startD),
        end: endOfDay(endD),
        label: lang === "it"
          ? `da ${startD.toLocaleDateString("it-IT")} a ${endD.toLocaleDateString("it-IT")}`
          : `from ${startD.toLocaleDateString("en-US")} to ${endD.toLocaleDateString("en-US")}`,
      };
    }
  }

  // 2. Relative "N weeks ago" / "N settimane fa"
  const weeksAgoMatch = normalised.match(/(\d+)\s+(?:weeks?|settiman[ae])\s+fa\b/i) || normalised.match(/\b(?:fa|scors[oe])\s+(\d+)\s+(?:weeks?|settiman[ae])/i);
  if (weeksAgoMatch) {
    const n = parseInt(weeksAgoMatch[1], 10);
    const dayOfWeek = today.getDay();
    const mondayThisWeek = new Date(today);
    mondayThisWeek.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    const targetMonday = new Date(mondayThisWeek);
    targetMonday.setDate(mondayThisWeek.getDate() - 7 * n);
    const targetSunday = new Date(targetMonday);
    targetSunday.setDate(targetMonday.getDate() + 6);
    return {
      start: startOfDay(targetMonday),
      end: endOfDay(targetSunday),
      label: lang === "it" ? `${n} settimane fa` : `${n} weeks ago`,
    };
  }

  // 3. Relative "N months ago" / "N mesi fa"
  const monthsAgoMatch = normalised.match(/(\d+)\s+(?:months?|mes[ie])\s+fa\b/i) || normalised.match(/\b(?:fa|scors[oe])\s+(\d+)\s+(?:months?|mes[ie])/i);
  if (monthsAgoMatch) {
    const n = parseInt(monthsAgoMatch[1], 10);
    const start = new Date(today.getFullYear(), today.getMonth() - n, 1);
    const end = new Date(today.getFullYear(), today.getMonth() - n + 1, 0);
    return {
      start: startOfDay(start),
      end: endOfDay(end),
      label: lang === "it" ? `${n} mesi fa` : `${n} months ago`,
    };
  }

  // 4. "last N days" / "ultimi N giorni"
  const lastNMatch = normalised.match(/(?:last|ultim[io])\s+(\d+)\s+(?:days|giorni)/);
  if (lastNMatch) {
    const n = parseInt(lastNMatch[1], 10);
    const start = new Date(today);
    start.setDate(today.getDate() - n);
    return {
      start: startOfDay(start),
      end: endOfDay(today),
      label: lang === "it" ? `ultimi ${n} giorni` : `last ${n} days`,
    };
  }

  // 5. Single explicit dates matching date pattern anywhere
  const datePatterns = [
    /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/,
    /\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/,
    /\b(\d{1,2})[/-](\d{1,2})\b/,
    /\b(\d{1,2})\s+([a-z]{3,})\b/,
    /\b([a-z]{3,})\s+(\d{1,2})\b/,
  ];
  for (const pat of datePatterns) {
    const m = normalised.match(pat);
    if (m) {
      const d = parseDateStr(m[0]);
      if (d) {
        return {
          start: startOfDay(d),
          end: endOfDay(d),
          label: d.toLocaleDateString(lang === "it" ? "it-IT" : "en-US", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
        };
      }
    }
  }

  // "day before yesterday" / "l'altro ieri" / "altroieri"
  if (/\b(?:day before yesterday|altro\s*ieri|altroieri|l altro ieri|avantieri)\b/.test(normalised)) {
    const d = new Date(today);
    d.setDate(today.getDate() - 2);
    return {
      start: startOfDay(d),
      end: endOfDay(d),
      label: lang === "it" ? "l'altro ieri" : "day before yesterday",
    };
  }

  // Specific day of week
  for (const [dayName, dayNum] of Object.entries(DAY_MAP)) {
    if (normalised.includes(dayName)) {
      const currentDay = today.getDay();
      let diff = currentDay - dayNum;
      if (diff <= 0) diff += 7;
      const d = new Date(today);
      d.setDate(today.getDate() - diff);
      return {
        start: startOfDay(d),
        end: endOfDay(d),
        label: d.toLocaleDateString(lang === "it" ? "it-IT" : "en-US", {
          weekday: "long",
          day: "numeric",
          month: "short",
        }),
      };
    }
  }

  // Specific month name (current or previous year)
  for (const [monthName, monthNum] of Object.entries(MONTH_MAP)) {
    if (normalised.includes(monthName)) {
      const year = monthNum > today.getMonth() ? today.getFullYear() - 1 : today.getFullYear();
      const start = new Date(year, monthNum, 1);
      const end = new Date(year, monthNum + 1, 0);
      return {
        start: startOfDay(start),
        end: endOfDay(end),
        label: start.toLocaleDateString(lang === "it" ? "it-IT" : "en-US", {
          month: "long",
          year: "numeric",
        }),
      };
    }
  }

  // Concept-based time ranges
  if (hasConcept("TIME_ALL_TIME")) {
    return {
      start: new Date(2000, 0, 1),
      end: endOfDay(today),
      label: lang === "it" ? "di sempre" : "all time",
    };
  }

  if (hasConcept("TIME_LAST_MONTH")) {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return {
      start: startOfDay(start),
      end: endOfDay(end),
      label: lang === "it" ? "il mese scorso" : "last month",
    };
  }

  if (hasConcept("TIME_LAST_WEEK")) {
    const dayOfWeek = today.getDay();
    const mondayThisWeek = new Date(today);
    mondayThisWeek.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    const lastMonday = new Date(mondayThisWeek);
    lastMonday.setDate(mondayThisWeek.getDate() - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    return {
      start: startOfDay(lastMonday),
      end: endOfDay(lastSunday),
      label: lang === "it" ? "la settimana scorsa" : "last week",
    };
  }

  if (hasConcept("TIME_YEAR")) {
    return {
      start: new Date(today.getFullYear(), 0, 1),
      end: endOfDay(today),
      label: lang === "it" ? "quest'anno" : "this year",
    };
  }

  if (hasConcept("TIME_MONTH")) {
    return {
      start: new Date(today.getFullYear(), today.getMonth(), 1),
      end: endOfDay(today),
      label: lang === "it" ? "questo mese" : "this month",
    };
  }

  if (hasConcept("TIME_WEEK")) {
    const diff = today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1);
    const start = new Date(today);
    start.setDate(diff);
    return {
      start: startOfDay(start),
      end: endOfDay(today),
      label: lang === "it" ? "questa settimana" : "this week",
    };
  }

  if (hasConcept("TIME_YESTERDAY")) {
    const d = new Date(today);
    d.setDate(today.getDate() - 1);
    return {
      start: startOfDay(d),
      end: endOfDay(d),
      label: lang === "it" ? "ieri" : "yesterday",
    };
  }

  // Default: today
  return {
    start: startOfDay(today),
    end: endOfDay(today),
    label: lang === "it" ? "oggi" : "today",
  };
}

// ─── FUZZY PRODUCT MATCHING ─────────────────────────────────────────────────

/** Levenshtein distance */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

/** Normalised similarity score [0, 1] */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - editDistance(a, b) / maxLen;
}

export interface ProductMatch {
  product: Product;
  score: number;
}

/**
 * Find the best matching product from the query.
 * Uses substring matching + fuzzy Levenshtein on each product name/SKU.
 * Returns null if no product is mentioned or score is too low.
 */
export function findProductInQuery(normalised: string, products: Product[]): ProductMatch | null {
  // Remove common filler words to isolate the product reference
  const fillerWords = new Set([
    // Italian
    "quanto", "quanta", "quanti", "quante", "ho", "hai", "ha", "di",
    "del", "della", "dello", "dei", "degli", "delle", "il", "la", "lo",
    "le", "gli", "i", "un", "una", "uno", "in", "a", "da", "per", "con",
    "su", "ne", "ci", "si", "mi", "ti", "vi", "che", "e", "o",
    "scorta", "scorte", "giacenza", "stock", "magazzino", "inventario",
    "disponibile", "rimasto", "prodotto",
    // English
    "how", "much", "many", "do", "i", "have", "of", "the", "a", "an",
    "is", "are", "there", "what", "in", "my", "stock", "inventory",
    "available", "remaining", "left", "product", "units",
  ]);

  const tokens = normalised.split(/\s+/).filter((w) => !fillerWords.has(w) && w.length > 1);
  if (tokens.length === 0) return null;

  const productPhrase = tokens.join(" ");

  let bestMatch: ProductMatch | null = null;

  for (const p of products) {
    const pName = p.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const pSku = p.sku.toLowerCase();

    // Exact substring match (highest priority)
    if (normalised.includes(pName) || normalised.includes(pSku)) {
      const score = 1.0;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { product: p, score };
      }
      continue;
    }

    // Word overlap scoring
    const nameWords = pName.split(/\s+/).filter((w) => w.length > 2);
    const matchedWords = nameWords.filter((w) => normalised.includes(w));
    const wordOverlapScore = nameWords.length > 0 ? matchedWords.length / nameWords.length : 0;

    // Fuzzy match on the extracted product phrase
    const fuzzyScore = similarity(productPhrase, pName);

    // Also check each token for fuzzy match against product name words
    let bestTokenScore = 0;
    for (const tok of tokens) {
      for (const nw of nameWords) {
        const s = similarity(tok, nw);
        if (s > bestTokenScore) bestTokenScore = s;
      }
      // Check against SKU
      const skuSim = similarity(tok, pSku);
      if (skuSim > bestTokenScore) bestTokenScore = skuSim;
    }

    // Combined score (weighted)
    const combined = Math.max(
      wordOverlapScore * 0.9,
      fuzzyScore * 0.8,
      bestTokenScore * 0.85,
    );

    if (combined >= 0.55 && (!bestMatch || combined > bestMatch.score)) {
      bestMatch = { product: p, score: combined };
    }
  }

  return bestMatch;
}

// ─── RESPONSE GENERATION ─────────────────────────────────────────────────────

export interface NLPResponse {
  text: string;
  data?: any;
  chartType?: "bar" | "pie" | "card" | null;
}

const CHART_COLORS = [
  "oklch(0.55 0.18 145)",
  "oklch(0.65 0.18 45)",
  "oklch(0.6 0.18 250)",
  "oklch(0.62 0.22 27)",
  "oklch(0.7 0.15 300)",
  "oklch(0.55 0.16 200)",
  "oklch(0.6 0.20 330)",
];

export function detectLanguage(query: string, currentLang: string): "it" | "en" {
  const normalised = normalizeText(query);
  
  // Count Italian indicators
  const itWords = [
    "quanto", "quanta", "quanti", "quante", "incassato", "incasso", "fatturato", "guadagnato", "guadagno",
    "speso", "spesa", "spese", "uscite", "bollette", "costi", "profitto", "margine", "utile", "venduto",
    "vendite", "popolare", "magazzino", "giacenza", "giacenze", "scorta", "scorte", "scontrino", "scontrini",
    "transazioni", "medio", "media", "categoria", "categorie", "contanti", "carta", "esaurimento",
    "scadenza", "scadenze", "lotto", "lotti", "turno", "cassa", "cassetto", "servizio", "chi", "cosa",
    "oggi", "ieri", "settimana", "mese", "anno", "ciao", "buongiorno", "grazie", "aiuto", "confronta",
    "confronto", "piu", "meno", "il", "la", "i", "gli", "le", "del", "della", "dei", "degli", "delle"
  ];
  
  // Count English indicators
  const enWords = [
    "how", "much", "many", "earn", "earned", "earnings", "revenue", "income", "turnover", "spent", "spend",
    "spending", "expenses", "expense", "cost", "costs", "outgoings", "bills", "overhead", "profit", "net",
    "margin", "markup", "selling", "seller", "popular", "stock", "inventory", "available", "availability",
    "remaining", "left", "receipt", "receipts", "sale", "sales", "transaction", "transactions", "average",
    "ticket", "mean", "category", "categories", "breakdown", "split", "mix", "cash", "card", "electronic",
    "running", "out", "reorder", "expiring", "expiry", "expire", "shift", "till", "register", "drawer",
    "staff", "employee", "employees", "working", "duty", "clocked", "who", "what", "today", "yesterday",
    "week", "month", "year", "hello", "hi", "thanks", "thank", "help", "compare", "comparison", "versus", "vs"
  ];

  const words = normalised.split(/\s+/);
  let itScore = 0;
  let enScore = 0;

  for (const w of words) {
    if (itWords.some(itw => w.startsWith(itw) || itw.startsWith(w))) itScore++;
    if (enWords.some(enw => w.startsWith(enw) || enw.startsWith(w))) enScore++;
  }

  if (itScore > enScore) return "it";
  if (enScore > itScore) return "en";
  
  return currentLang as "it" | "en";
}

export function generateResponse(
  rawQuery: string,
  state: any,
  uiLang: string,
): NLPResponse {
  const lang = detectLanguage(rawQuery, uiLang);
  const normalised = normalizeText(rawQuery);
  const classification = classifyIntent(normalised);
  const timeRange = extractTimeRange(normalised, classification.concepts, lang);

  // Filter orders and expenses to the time range
  const rangeOrders = state.orders.filter((o: any) => {
    const d = new Date(o.created_at);
    return d >= timeRange.start && d <= timeRange.end;
  });
  const rangeExpenses = state.expenses.filter((e: any) => {
    const d = new Date(e.date + "T00:00:00");
    return d >= timeRange.start && d <= timeRange.end;
  });

  const totalSales = rangeOrders.filter((o: any) => !o.refund_of).reduce((sum: number, o: any) => sum + o.total_gross, 0);
  const totalNet = rangeOrders.filter((o: any) => !o.refund_of).reduce((sum: number, o: any) => sum + o.total_net, 0);
  const totalVat = rangeOrders.filter((o: any) => !o.refund_of).reduce((sum: number, o: any) => sum + o.total_vat, 0);
  const totalCost = rangeOrders.filter((o: any) => !o.refund_of).reduce((sum: number, o: any) => sum + o.total_cost, 0);
  const totalExpenses = rangeExpenses.reduce((sum: number, e: any) => sum + e.amount, 0);
  const salesOrders = rangeOrders.filter((o: any) => !o.refund_of);
  const refundOrders = rangeOrders.filter((o: any) => o.refund_of);

  const rl = timeRange.label;

  switch (classification.intent) {
    // ────── REVENUE ──────
    case "revenue": {
      const text = lang === "it"
        ? `Hai incassato un totale lordo di ${formatEUR(totalSales)} (${rl}), con un netto IVA di ${formatEUR(totalNet)}. Sono stati emessi ${salesOrders.length} scontrini${refundOrders.length > 0 ? ` e ${refundOrders.length} rimborsi` : ""}.`
        : `You earned a gross total of ${formatEUR(totalSales)} (${rl}), with an ex-VAT net of ${formatEUR(totalNet)}. ${salesOrders.length} receipt(s) issued${refundOrders.length > 0 ? `, ${refundOrders.length} refund(s)` : ""}.`;
      return {
        text,
        chartType: "card",
        data: {
          value: formatEUR(totalSales),
          subtext: lang === "it" ? `${salesOrders.length} vendite · ${rl}` : `${salesOrders.length} sales · ${rl}`,
          label: lang === "it" ? "Ricavo Lordo" : "Gross Revenue",
        },
      };
    }

    // ────── EXPENSE ──────
    case "expense": {
      const text = lang === "it"
        ? `Le spese registrate (${rl}) ammontano a ${formatEUR(totalExpenses)} su ${rangeExpenses.length} voci.`
        : `Recorded expenses (${rl}) total ${formatEUR(totalExpenses)} across ${rangeExpenses.length} entries.`;
      return {
        text,
        chartType: "card",
        data: {
          value: formatEUR(totalExpenses),
          subtext: lang === "it" ? `${rangeExpenses.length} voci · ${rl}` : `${rangeExpenses.length} entries · ${rl}`,
          label: lang === "it" ? "Spese Totali" : "Total Expenses",
        },
      };
    }

    // ────── PROFIT ──────
    case "profit": {
      const grossProfit = totalSales - totalCost;
      const netProfit = grossProfit - totalExpenses;
      const marginPct = totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : "0";
      const text = lang === "it"
        ? `Margine lordo (${rl}): ${formatEUR(grossProfit)} (${marginPct}% sui ricavi).\nSpese operative: ${formatEUR(totalExpenses)}.\nUtile netto stimato: ${formatEUR(netProfit)}.`
        : `Gross margin (${rl}): ${formatEUR(grossProfit)} (${marginPct}% of revenue).\nOperating expenses: ${formatEUR(totalExpenses)}.\nEstimated net profit: ${formatEUR(netProfit)}.`;
      return {
        text,
        chartType: "bar",
        data: [
          { name: lang === "it" ? "Ricavi" : "Revenue", value: +totalSales.toFixed(2) },
          { name: lang === "it" ? "Costo merci" : "COGS", value: +totalCost.toFixed(2) },
          { name: lang === "it" ? "Spese" : "Expenses", value: +totalExpenses.toFixed(2) },
          { name: lang === "it" ? "Utile" : "Profit", value: +netProfit.toFixed(2) },
        ],
      };
    }

    // ────── BEST SELLING ──────
    case "best_selling": {
      const hasConcept = (c: Concept) => classification.concepts.some((m) => m.concept === c);
      const useAllTime = hasConcept("TIME_ALL_TIME");
      const matchOrders = useAllTime ? state.orders : rangeOrders;
      const label = useAllTime ? (lang === "it" ? "di sempre" : "all time") : rl;

      const productSales = new Map<string, { name: string; qty: number; rev: number }>();
      for (const o of matchOrders) {
        if (o.refund_of) continue;
        for (const it of o.items) {
          const prev = productSales.get(it.product_id) ?? { name: it.product_name, qty: 0, rev: 0 };
          prev.qty += Math.abs(it.quantity);
          prev.rev += Math.abs(it.total_gross);
          productSales.set(it.product_id, prev);
        }
      }

      const sorted = Array.from(productSales.values()).sort((a, b) => b.qty - a.qty);
      if (sorted.length === 0) {
        return {
          text: lang === "it"
            ? `Non ci sono vendite registrate nel periodo (${label}).`
            : `No sales recorded in the period (${label}).`,
        };
      }

      const top = sorted[0];
      const text = lang === "it"
        ? `Il prodotto più venduto (${label}) è "${top.name}" con ${top.qty} unità vendute per un ricavo di ${formatEUR(top.rev)}.`
        : `The best selling product (${label}) is "${top.name}" with ${top.qty} units sold for ${formatEUR(top.rev)} in revenue.`;
      return {
        text,
        chartType: "bar",
        data: sorted.slice(0, 6).map((p) => ({ name: p.name, value: p.qty })),
      };
    }

    // ────── STOCK ──────
    case "stock": {
      const products: Product[] = state.products;
      const productMatch = findProductInQuery(normalised, products);

      if (productMatch) {
        const p = productMatch.product;
        const activeLocId = state.currentLocation?.id ?? "loc-rome";
        const activeLocName = state.currentLocation?.name ?? "?";
        const locStock = p.location_stock?.[activeLocId] ?? p.stock_quantity;
        const totalStock = p.stock_quantity;
        const text = lang === "it"
          ? `Ci sono ${locStock} unità di "${p.name}" nella sede "${activeLocName}" (totale: ${totalStock} unità). Costo unitario: ${formatEUR(p.cost_price)}, prezzo: ${formatEUR(p.price_gross)}.`
          : `There are ${locStock} units of "${p.name}" at "${activeLocName}" (total: ${totalStock} units). Unit cost: ${formatEUR(p.cost_price)}, price: ${formatEUR(p.price_gross)}.`;
        return {
          text,
          chartType: "card",
          data: {
            value: `${locStock} pz`,
            subtext: `${p.sku} · ${formatEUR(p.cost_price)} → ${formatEUR(p.price_gross)}`,
            label: p.name,
          },
        };
      }

      // No specific product → general inventory summary
      const totalUnits = products.reduce((sum, p) => sum + p.stock_quantity, 0);
      const totalValue = products.reduce((sum, p) => sum + p.stock_quantity * p.cost_price, 0);
      const text = lang === "it"
        ? `Il magazzino contiene ${totalUnits} unità su ${products.length} referenze, per un valore complessivo a costo di ${formatEUR(totalValue)}.`
        : `The inventory holds ${totalUnits} units across ${products.length} SKUs, worth ${formatEUR(totalValue)} at cost.`;
      return {
        text,
        chartType: "pie",
        data: products
          .filter((p: Product) => p.stock_quantity > 0)
          .sort((a: Product, b: Product) => b.stock_quantity - a.stock_quantity)
          .slice(0, 6)
          .map((p: Product) => ({ name: p.name, value: p.stock_quantity })),
      };
    }

    // ────── ORDER COUNT ──────
    case "order_count": {
      const text = lang === "it"
        ? `Nel periodo (${rl}) sono stati emessi ${salesOrders.length} scontrini${refundOrders.length > 0 ? ` e ${refundOrders.length} rimborsi` : ""}.`
        : `In the period (${rl}), ${salesOrders.length} receipt(s) were issued${refundOrders.length > 0 ? `, plus ${refundOrders.length} refund(s)` : ""}.`;
      return {
        text,
        chartType: "card",
        data: {
          value: `${salesOrders.length}`,
          subtext: lang === "it" ? `${rl} · ${formatEUR(totalSales)} lordo` : `${rl} · ${formatEUR(totalSales)} gross`,
          label: lang === "it" ? "Scontrini Emessi" : "Receipts Issued",
        },
      };
    }

    // ────── AVG TICKET ──────
    case "avg_ticket": {
      const avg = salesOrders.length > 0 ? totalSales / salesOrders.length : 0;
      const text = lang === "it"
        ? `Lo scontrino medio (${rl}) è di ${formatEUR(avg)} su ${salesOrders.length} vendite.`
        : `The average ticket (${rl}) is ${formatEUR(avg)} across ${salesOrders.length} sales.`;
      return {
        text,
        chartType: "card",
        data: {
          value: formatEUR(avg),
          subtext: `${salesOrders.length} ${lang === "it" ? "vendite" : "sales"} · ${rl}`,
          label: lang === "it" ? "Scontrino Medio" : "Average Ticket",
        },
      };
    }

    // ────── CATEGORY BREAKDOWN ──────
    case "category_breakdown": {
      const catMap = new Map<string, { qty: number; rev: number }>();
      for (const o of salesOrders) {
        for (const it of o.items) {
          const prod = state.products.find((p: Product) => p.id === it.product_id);
          const cat = prod?.category || (lang === "it" ? "Altro" : "Other");
          const prev = catMap.get(cat) ?? { qty: 0, rev: 0 };
          prev.qty += Math.abs(it.quantity);
          prev.rev += Math.abs(it.total_gross);
          catMap.set(cat, prev);
        }
      }

      const sorted = Array.from(catMap.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.rev - a.rev);

      if (sorted.length === 0) {
        return {
          text: lang === "it"
            ? `Nessuna vendita nel periodo (${rl}) per calcolare la suddivisione.`
            : `No sales in the period (${rl}) to break down.`,
        };
      }

      const lines = sorted.map((c) => `• ${c.name}: ${formatEUR(c.rev)} (${c.qty} pz)`);
      const text = lang === "it"
        ? `Vendite per categoria (${rl}):\n${lines.join("\n")}`
        : `Sales by category (${rl}):\n${lines.join("\n")}`;
      return {
        text,
        chartType: "pie",
        data: sorted.slice(0, 6).map((c) => ({ name: c.name, value: +c.rev.toFixed(2) })),
      };
    }

    // ────── PAYMENT SPLIT ──────
    case "payment_split": {
      const cashSales = salesOrders.filter((o: any) => o.payment_method === "contanti");
      const cardSales = salesOrders.filter((o: any) => o.payment_method === "elettronico");
      const cashTotal = cashSales.reduce((s: number, o: any) => s + o.total_gross, 0);
      const cardTotal = cardSales.reduce((s: number, o: any) => s + o.total_gross, 0);
      const text = lang === "it"
        ? `Mix pagamenti (${rl}):\n• Contanti: ${cashSales.length} vendite per ${formatEUR(cashTotal)}\n• Carta/Elettronico: ${cardSales.length} vendite per ${formatEUR(cardTotal)}`
        : `Payment mix (${rl}):\n• Cash: ${cashSales.length} sales for ${formatEUR(cashTotal)}\n• Card/Electronic: ${cardSales.length} sales for ${formatEUR(cardTotal)}`;
      return {
        text,
        chartType: "pie",
        data: [
          { name: lang === "it" ? "Contanti" : "Cash", value: +cashTotal.toFixed(2) },
          { name: lang === "it" ? "Carta" : "Card", value: +cardTotal.toFixed(2) },
        ],
      };
    }

    // ────── LOW STOCK ──────
    case "low_stock": {
      const threshold = state.config?.low_stock_threshold ?? 3;
      const activeLocId = state.currentLocation?.id ?? "loc-rome";
      const lowItems = state.products
        .filter((p: Product) => {
          const stock = p.location_stock?.[activeLocId] ?? p.stock_quantity;
          return stock <= threshold && stock >= 0;
        })
        .sort((a: Product, b: Product) => {
          const sa = a.location_stock?.[activeLocId] ?? a.stock_quantity;
          const sb = b.location_stock?.[activeLocId] ?? b.stock_quantity;
          return sa - sb;
        });

      if (lowItems.length === 0) {
        return {
          text: lang === "it"
            ? `Nessun prodotto con scorte basse (soglia: ≤${threshold} unità). Tutto OK! ✅`
            : `No products with low stock (threshold: ≤${threshold} units). All good! ✅`,
        };
      }

      const lines = lowItems.slice(0, 8).map((p: Product) => {
        const stock = p.location_stock?.[activeLocId] ?? p.stock_quantity;
        return `• ${p.name} (${p.sku}): ${stock} ${lang === "it" ? "pz" : "units"}${stock === 0 ? " ⚠️" : ""}`;
      });
      const text = lang === "it"
        ? `${lowItems.length} prodotti con scorte basse (≤${threshold} pz):\n${lines.join("\n")}`
        : `${lowItems.length} products with low stock (≤${threshold} units):\n${lines.join("\n")}`;
      return {
        text,
        chartType: "bar",
        data: lowItems.slice(0, 6).map((p: Product) => ({
          name: p.name,
          value: p.location_stock?.[activeLocId] ?? p.stock_quantity,
        })),
      };
    }

    // ────── COMPARE ──────
    case "compare": {
      // Compare current range vs the same-length period immediately before
      const duration = timeRange.end.getTime() - timeRange.start.getTime();
      const prevStart = new Date(timeRange.start.getTime() - duration);
      const prevEnd = new Date(timeRange.start.getTime() - 1);

      const prevOrders = state.orders.filter((o: any) => {
        const d = new Date(o.created_at);
        return d >= prevStart && d <= prevEnd && !o.refund_of;
      });
      const prevTotal = prevOrders.reduce((s: number, o: any) => s + o.total_gross, 0);

      const change = totalSales - prevTotal;
      const changePct = prevTotal > 0 ? ((change / prevTotal) * 100).toFixed(1) : "N/A";
      const emoji = change > 0 ? "📈" : change < 0 ? "📉" : "➡️";

      const text = lang === "it"
        ? `Confronto (${rl}):\n• Periodo attuale: ${formatEUR(totalSales)} (${salesOrders.length} vendite)\n• Periodo precedente: ${formatEUR(prevTotal)} (${prevOrders.length} vendite)\n• Variazione: ${change >= 0 ? "+" : ""}${formatEUR(change)} (${changePct}%) ${emoji}`
        : `Comparison (${rl}):\n• Current period: ${formatEUR(totalSales)} (${salesOrders.length} sales)\n• Previous period: ${formatEUR(prevTotal)} (${prevOrders.length} sales)\n• Change: ${change >= 0 ? "+" : ""}${formatEUR(change)} (${changePct}%) ${emoji}`;
      return {
        text,
        chartType: "bar",
        data: [
          { name: lang === "it" ? "Precedente" : "Previous", value: +prevTotal.toFixed(2) },
          { name: lang === "it" ? "Attuale" : "Current", value: +totalSales.toFixed(2) },
        ],
      };
    }

    // ────── SHIFT INFO ──────
    case "shift_info": {
      const openShift = state.shifts.find((s: any) => s.status === "open");
      if (!openShift) {
        return {
          text: lang === "it"
            ? "Nessun turno attualmente aperto. Vai alla sezione Cassa per aprirne uno."
            : "No shift currently open. Go to the Till section to open one.",
        };
      }

      const shiftOrders = state.orders.filter((o: any) => o.shift_id === openShift.id);
      const shiftCash = shiftOrders.filter((o: any) => o.payment_method === "contanti" && !o.refund_of).reduce((s: number, o: any) => s + o.total_gross, 0);
      const shiftCard = shiftOrders.filter((o: any) => o.payment_method === "elettronico" && !o.refund_of).reduce((s: number, o: any) => s + o.total_gross, 0);
      const shiftTotal = shiftCash + shiftCard;

      const text = lang === "it"
        ? `Turno attuale (${openShift.register_name}):\n• Aperto alle: ${new Date(openShift.opened_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}\n• Fondo cassa: ${formatEUR(openShift.opening_float)}\n• Vendite contanti: ${formatEUR(shiftCash)}\n• Vendite carta: ${formatEUR(shiftCard)}\n• Totale turno: ${formatEUR(shiftTotal)} su ${shiftOrders.filter((o: any) => !o.refund_of).length} scontrini`
        : `Current shift (${openShift.register_name}):\n• Opened at: ${new Date(openShift.opened_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}\n• Opening float: ${formatEUR(openShift.opening_float)}\n• Cash sales: ${formatEUR(shiftCash)}\n• Card sales: ${formatEUR(shiftCard)}\n• Shift total: ${formatEUR(shiftTotal)} across ${shiftOrders.filter((o: any) => !o.refund_of).length} receipts`;
      return {
        text,
        chartType: "card",
        data: {
          value: formatEUR(shiftTotal),
          subtext: openShift.register_name,
          label: lang === "it" ? "Turno Attuale" : "Current Shift",
        },
      };
    }

    // ────── STAFF INFO ──────
    case "staff_info": {
      const clockedIn = state.users.filter((u: any) =>
        state.timeLogs.some((l: any) => l.user_id === u.id && !l.clock_out)
      );
      const clockedOut = state.users.filter((u: any) =>
        !state.timeLogs.some((l: any) => l.user_id === u.id && !l.clock_out)
      );

      const lines = [
        ...(clockedIn.length > 0
          ? [
              `${lang === "it" ? "In servizio" : "On duty"} (${clockedIn.length}):`,
              ...clockedIn.map((u: any) => `  ✅ ${u.name} (${u.role})`),
            ]
          : []),
        ...(clockedOut.length > 0
          ? [
              `${lang === "it" ? "Fuori servizio" : "Off duty"} (${clockedOut.length}):`,
              ...clockedOut.map((u: any) => `  ⬜ ${u.name} (${u.role})`),
            ]
          : []),
      ];
      return { text: lines.join("\n") };
    }

    // ────── EXPIRING ──────
    case "expiring": {
      const alertDays = state.config?.expiry_alert_days ?? 14;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const alertLots = state.lots.filter((l: any) => {
        if (!l.expiry_date || l.qty_remaining <= 0) return false;
        const exp = new Date(l.expiry_date + "T00:00:00");
        const diff = Math.round((exp.getTime() - today.getTime()) / 86_400_000);
        return diff >= 0 && diff <= alertDays;
      });

      if (alertLots.length === 0) {
        return {
          text: lang === "it"
            ? `Nessun lotto in scadenza nei prossimi ${alertDays} giorni. ✅`
            : `No lots expiring in the next ${alertDays} days. ✅`,
        };
      }

      const lines = alertLots.map((l: any) => {
        const prod = state.products.find((p: Product) => p.id === l.product_id);
        const exp = new Date(l.expiry_date + "T00:00:00");
        const diff = Math.round((exp.getTime() - today.getTime()) / 86_400_000);
        return `• ${prod?.name ?? "?"} (lotto ${l.lot_code}): ${l.qty_remaining} pz — ${diff === 0 ? (lang === "it" ? "OGGI" : "TODAY") : `${diff} ${lang === "it" ? "gg" : "days"}`}`;
      });
      const text = lang === "it"
        ? `${alertLots.length} lotti in scadenza:\n${lines.join("\n")}`
        : `${alertLots.length} lots expiring soon:\n${lines.join("\n")}`;
      return { text };
    }

    // ────── GREETING ──────
    case "greeting": {
      const hour = new Date().getHours();
      const greeting = lang === "it"
        ? (hour < 12 ? "Buongiorno" : hour < 18 ? "Buon pomeriggio" : "Buonasera")
        : (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
      const text = lang === "it"
        ? `${greeting}! Sono l'assistente Soldo. Chiedimi qualsiasi cosa sulle vendite, scorte, spese, profitto, turni o dipendenti — in italiano o inglese, anche in modo informale.`
        : `${greeting}! I'm your Soldo assistant. Ask me anything about sales, stock, expenses, profit, shifts or staff — in Italian or English, even informally.`;
      return { text };
    }

    // ────── HELP ──────
    case "help": {
      const text = lang === "it"
        ? `Ecco cosa posso fare per te:\n\n📊 **Vendite** — "Quanto ho incassato oggi?", "Fatturato di questa settimana"\n🏆 **Prodotti top** — "Qual è il più venduto?", "Top seller del mese"\n📦 **Scorte** — "Quante batterie ho?", "Prodotti in esaurimento"\n💰 **Spese** — "Spese di questo mese", "Quanto ho speso?"\n📈 **Profitto** — "Margine lordo?", "Utile netto"\n🧾 **Scontrini** — "Quanti scontrini oggi?", "Scontrino medio"\n📂 **Categorie** — "Vendite per categoria"\n💳 **Pagamenti** — "Contanti vs carta"\n📉 **Confronti** — "Confronta oggi con ieri"\n🕐 **Turno** — "Stato della cassa"\n👥 **Personale** — "Chi è in servizio?"\n⏰ **Scadenze** — "Lotti in scadenza"\n\nParla pure in modo informale — capisco anche le frasi imprecise! 😊`
        : `Here's what I can do:\n\n📊 **Sales** — "How much did I earn?", "Revenue this week"\n🏆 **Top products** — "Best selling product", "Top seller"\n📦 **Stock** — "How many batteries left?", "Low stock items"\n💰 **Expenses** — "This month's expenses", "How much spent?"\n📈 **Profit** — "Gross margin?", "Net profit"\n🧾 **Receipts** — "How many receipts today?", "Average ticket"\n📂 **Categories** — "Sales by category"\n💳 **Payments** — "Cash vs card"\n📉 **Comparisons** — "Compare today vs yesterday"\n🕐 **Shift** — "Current shift status"\n👥 **Staff** — "Who's clocked in?"\n⏰ **Expiry** — "Lots expiring soon"\n\nYou can speak informally — I understand imprecise phrasing! 😊`;
      return { text };
    }

    // ────── THANKS ──────
    case "thanks": {
      const text = lang === "it"
        ? "Prego! Sono qui se hai bisogno di altro. 😊"
        : "You're welcome! I'm here if you need anything else. 😊";
      return { text };
    }

    // ────── UNKNOWN — Intelligent fallback ──────
    default: {
      // Try to find a product mention even without stock intent
      const products: Product[] = state.products;
      const productMatch = findProductInQuery(normalised, products);
      if (productMatch && productMatch.score >= 0.6) {
        const p = productMatch.product;
        const activeLocId = state.currentLocation?.id ?? "loc-rome";
        const locStock = p.location_stock?.[activeLocId] ?? p.stock_quantity;
        const text = lang === "it"
          ? `"${p.name}" — Prezzo: ${formatEUR(p.price_gross)}, Scorta: ${locStock} pz, SKU: ${p.sku}. Puoi chiedermi vendite, profitto o confronti su questo prodotto.`
          : `"${p.name}" — Price: ${formatEUR(p.price_gross)}, Stock: ${locStock} units, SKU: ${p.sku}. You can ask me about sales, profit, or comparisons for this product.`;
        return {
          text,
          chartType: "card",
          data: { value: `${locStock} pz`, subtext: `${p.sku} · ${formatEUR(p.price_gross)}`, label: p.name },
        };
      }

      const text = lang === "it"
        ? `Non sono riuscito a capire la tua richiesta. Prova a riformulare oppure chiedi "aiuto" per vedere tutto ciò che posso fare.\n\nEcco alcune domande di esempio:\n• "Quanto ho incassato questa settimana?"\n• "Qual è il prodotto più venduto?"\n• "Quante batterie ho in magazzino?"\n• "Confronta oggi con ieri"\n• "Chi è in servizio?"`
        : `I couldn't understand your request. Try rephrasing or ask "help" to see everything I can do.\n\nHere are some example questions:\n• "How much did I earn this week?"\n• "What is the best selling product?"\n• "How many batteries do I have in stock?"\n• "Compare today vs yesterday"\n• "Who is clocked in?"`;
      return { text };
    }
  }
}
