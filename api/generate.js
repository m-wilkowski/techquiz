export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ version: 'v5-batch5' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Brak klucza API.' });

  const { material, questionCount = 5, difficulty = 'medium', avoid = '', focus = '' } = req.body;
  if (!material || material.trim().length < 50) return res.status(400).json({ error: 'Za mało materiału.' });

  const difficultyMap = {
    easy: 'PODSTAWY — zrozumienie mechanizmu',
    medium: 'ROZUMIENIE — dedukcja i wnioskowanie',
    hard: 'ANALIZA — łączenie wiedzy i projektowanie'
  };

  const systemPrompt = `Jesteś nauczycielem IT w technikum. Mówisz do uczniów 16-20 lat. Tworzysz pytania testujące ROZUMIENIE mechanizmów. Błędne odpowiedzi = typowe błędy myślowe uczniów. TYLKO JSON.
JĘZYK: Poprawna polszczyzna (ortografia, interpunkcja, składnia), ale naturalny, młodzieżowy ton — jak starszy kumpel, który ogarnia temat, a nie profesor z katedry. Bez slangu i skrótów, ale też bez akademickiego zadęcia. Nawet jeśli materiał źródłowy zawiera błędy, Twoje teksty muszą być wzorowe językowo.
RÓŻNORODNOŚĆ: Za każdym razem generuj INNE pytania — zmieniaj ujęcie, perspektywę, kontekst i formę. Unikaj schematycznych powtórzeń.
WYJAŚNIENIA: Zwięźle, ale treściwie — 1-2 zdania na pole. Podaj sedno: DLACZEGO tak jest (logika, standard, konwencja, historia). Używaj porównań ze świata, który znają uczniowie — gry, social media, streaming, sport, smartfony, Discord, YouTube, Minecraft, e-sport.
- explanation: Dlaczego poprawna + krótko dlaczego inne błędne. Pokaż logikę, nie tylko fakt.
- remember: Jedna konkretna zasada — sformułowana prosto, jak coś co wrzucisz na kartkę przed sprawdzianem.
- trick: Skojarzenie, analogia lub ciekawostka ze świata nastolatka — coś co "klika" i zostaje w głowie.
- realLife: Konkretny przykład, który uczeń technikum zna z życia — nie korporacyjny case study.`;

  const jsonInstruction = `TYLKO JSON:
{"topic":"temat","questions":[{"id":1,"question":"?","options":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],"correct":"B","explanation":"Dlaczego B jest poprawne (z czego wynika — logika/standard/historia) + dlaczego A, C, D są błędne.","remember":"Zasada/reguła do zapamiętania.","trick":"Ciekawostka, analogia lub mnemonik — coś co pomaga zapamiętać.","realLife":"Konkretny przykład z praktyki/pracy.","hint":"Naprowadzająca wskazówka (bez zdradzania odpowiedzi)."}]}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        temperature: 1.0,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Wygeneruj ${questionCount} pytań, poziom: ${difficultyMap[difficulty]}. Seed: ${Date.now()}.${avoid ? `\n\nNIE POWTARZAJ tych pytań (już były): ${avoid}` : ''}${focus ? `\n\nSKUP SIĘ NA TYCH ZAGADNIENIACH (uczeń miał z nimi problem, wygeneruj INNE pytania z tych tematów):\n${focus}` : ''}\n\nMATERIAŁ:\n${material.slice(0, 5000)}\n\n${jsonInstruction}`
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: 'Błąd API (' + response.status + '): ' + errText.slice(0, 200) });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';

    let cleaned = raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) cleaned = cleaned.slice(jsonStart, jsonEnd + 1);

    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch(e) {
      // Try fixing trailing commas
      let fixed = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      try { parsed = JSON.parse(fixed); }
      catch(e2) {
        // Try closing truncated JSON
        // Count open brackets and close them
        let attempt = fixed;
        const openBraces = (attempt.match(/\{/g) || []).length;
        const closeBraces = (attempt.match(/\}/g) || []).length;
        const openBrackets = (attempt.match(/\[/g) || []).length;
        const closeBrackets = (attempt.match(/\]/g) || []).length;
        // Remove last incomplete property/object
        attempt = attempt.replace(/,?\s*\{[^}]*$/, '');
        attempt = attempt.replace(/,?\s*"[^"]*$/, '');
        // Close remaining brackets
        for (let i = 0; i < openBrackets - closeBrackets; i++) attempt += ']';
        for (let i = 0; i < openBraces - closeBraces; i++) attempt += '}';
        try { parsed = JSON.parse(attempt); }
        catch(e3) {
          console.error('Parse fail after repair:', raw.slice(-200));
          return res.status(500).json({ error: 'Błąd parsowania.' });
        }
      }
    }

    if (!parsed.questions?.length) return res.status(500).json({ error: 'Brak pytań.' });
    return res.status(200).json(parsed);

  } catch(err) {
    return res.status(500).json({ error: 'Błąd: ' + err.message });
  }
}
