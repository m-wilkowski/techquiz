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

  const { material, questionCount = 5, difficulty = 'medium' } = req.body;
  if (!material || material.trim().length < 50) return res.status(400).json({ error: 'Za mało materiału.' });

  const difficultyMap = {
    easy: 'PODSTAWY — zrozumienie mechanizmu',
    medium: 'ROZUMIENIE — dedukcja i wnioskowanie',
    hard: 'ANALIZA — łączenie wiedzy i projektowanie'
  };

  const systemPrompt = `Jesteś nauczycielem technikum informatycznego. Uczysz przez ROZUMOWANIE.
PYTANIA: testuj rozumienie (dlaczego? co się stanie? jaka przyczyna?). Błędne odpowiedzi = typowe błędy myślowe.
WYJAŚNIENIA: tok rozumowania, dlaczego poprawna, dlaczego błędne. 3-5 zdań.
Odpowiedz WYŁĄCZNIE poprawnym JSON. Żadnego tekstu przed/po. Żadnych backtick-ów.`;

  const jsonInstruction = `TYLKO czysty JSON:
{"topic":"temat","questions":[{"id":1,"question":"?","options":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],"correct":"B","explanation":"Wyjaśnienie.","hint":"Wskazówka."}]}`;

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
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Wygeneruj ${questionCount} pytań, poziom: ${difficultyMap[difficulty]}.\n\nMATERIAŁ:\n${material.slice(0, 6000)}\n\n${jsonInstruction}`
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
      try { parsed = JSON.parse(cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')); }
      catch(e2) { return res.status(500).json({ error: 'Błąd parsowania.' }); }
    }

    if (!parsed.questions?.length) return res.status(500).json({ error: 'Brak pytań.' });
    return res.status(200).json(parsed);

  } catch(err) {
    return res.status(500).json({ error: 'Błąd: ' + err.message });
  }
}
