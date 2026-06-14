import type { ParsedVoiceOrder, ParsedVoiceItem, Product } from "./types";

const NUM_WORDS: Record<string, number> = {
  // Italian
  zero: 0, uno: 1, una: 1, un: 1, due: 2, tre: 3, quattro: 4, cinque: 5,
  sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12,
  tredici: 13, quattordici: 14, quindici: 15, sedici: 16, diciassette: 17,
  diciotto: 18, diciannove: 19, venti: 20, trenta: 30, quaranta: 40,
  cinquanta: 50, cento: 100,
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
};

function wordToNum(w: string): number | null {
  const n = NUM_WORDS[w.toLowerCase()];
  return n ?? null;
}

function parsePayment(text: string): "elettronico" | "contanti" {
  if (/contant|cash|liquid/i.test(text)) return "contanti";
  return "elettronico";
}

function parseLottery(text: string): string | null {
  const m = text.match(/(?:lotteria|lottery|codice|code)[^a-z0-9]*([a-z0-9]{4,12})/i);
  if (m) return m[1].toUpperCase();
  const m2 = text.match(/\b([A-Z0-9]{6,12})\b/);
  return m2 ? m2[1] : null;
}

function bestProduct(phrase: string, products: Product[]): string | null {
  const t = phrase.toLowerCase();
  let best: string | null = null;
  let bestScore = 0;
  for (const p of products) {
    const words = p.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    if (!words.length) continue;
    const score = words.filter((w) => t.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = p.name;
    }
  }
  return best;
}

/**
 * Heuristic multi-item parser. Splits text on connectors (and/e/più/plus/,/&/+)
 * and extracts a quantity + product per chunk.
 */
function heuristicItems(text: string, products: Product[]): ParsedVoiceItem[] {
  // Strip payment / lottery hints so they don't pollute product matching
  const cleaned = text
    .replace(/\b(con|in|a|by|using)?\s*(contant[ie]?|cash|liquid[oi]|carta|card|elettronic[oa]|pos|bancomat)\b/gi, " ")
    .replace(/(?:lotteria|lottery|codice|code)[^a-z0-9]*[a-z0-9]{4,12}/gi, " ");

  const chunks = cleaned
    .split(/\s*(?:,|;|&|\+|\band\b|\be\b|\bpiù\b|\bpiu\b|\bplus\b|\boltre\b|\binoltre\b)\s*/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const items: ParsedVoiceItem[] = [];
  for (const chunk of chunks) {
    const tokens = chunk.split(/\s+/);
    let qty = 1;
    let qtyFound = false;
    const productTokens: string[] = [];
    for (const tok of tokens) {
      const num = /^\d{1,3}$/.test(tok) ? parseInt(tok, 10) : wordToNum(tok);
      if (num !== null && !qtyFound) {
        qty = num;
        qtyFound = true;
      } else {
        productTokens.push(tok);
      }
    }
    const phrase = productTokens.join(" ").trim();
    if (!phrase) continue;
    const match = bestProduct(phrase, products) ?? phrase;
    // Merge with previous item if same product
    const prev = items.find((i) => i.product_name.toLowerCase() === match.toLowerCase());
    if (prev) prev.quantity += qty;
    else items.push({ product_name: match, quantity: qty });
  }

  if (items.length === 0) {
    const fallback = bestProduct(text, products);
    if (fallback) items.push({ product_name: fallback, quantity: 1 });
  }
  return items;
}

/**
 * Local AI parser. Tries Chrome's built-in Prompt API (window.LanguageModel),
 * falls back to deterministic heuristic parsing. Always returns the strict schema.
 */
export async function parseVoiceOrder(text: string, products: Product[]): Promise<ParsedVoiceOrder> {
  const w = (typeof window !== "undefined" ? (window as any) : {}) as any;
  const LM = w.LanguageModel || w.ai?.languageModel;

  if (LM?.create) {
    try {
      const session = await LM.create({
        initialPrompts: [
          {
            role: "system",
            content:
              "You are a sales parser for an Italian shop. Extract a list of items (each with product_name and quantity), payment_method (elettronico|contanti), and lottery_code (or null) from the sentence. The sentence can list multiple products joined by 'and', 'e', 'più', commas, or spaces (e.g. '4 paste e 5 batterie'). Return ONLY JSON.",
          },
        ],
      });
      const schema = {
        type: "object",
        required: ["items", "payment_method", "lottery_code"],
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["product_name", "quantity"],
              properties: {
                product_name: { type: "string" },
                quantity: { type: "number" },
              },
            },
          },
          payment_method: { type: "string", enum: ["elettronico", "contanti"] },
          lottery_code: { type: ["string", "null"] },
        },
      };
      const result = await session.prompt(text, { responseConstraint: schema });
      const obj = typeof result === "string" ? JSON.parse(result) : result;
      const rawItems: any[] = Array.isArray(obj.items) ? obj.items : [];
      const items: ParsedVoiceItem[] = rawItems
        .map((it) => ({
          product_name: String(it.product_name ?? "").trim(),
          quantity: Math.max(1, Number(it.quantity) || 1),
        }))
        .filter((it) => it.product_name)
        .map((it) => ({
          product_name: bestProduct(it.product_name, products) ?? it.product_name,
          quantity: it.quantity,
        }));
      return {
        items: items.length ? items : heuristicItems(text, products),
        payment_method: obj.payment_method === "contanti" ? "contanti" : "elettronico",
        lottery_code: obj.lottery_code ?? parseLottery(text),
      };
    } catch (e) {
      console.warn("[Prompt API] fallback to heuristic", e);
    }
  }

  return {
    items: heuristicItems(text, products),
    payment_method: parsePayment(text),
    lottery_code: parseLottery(text),
  };
}
