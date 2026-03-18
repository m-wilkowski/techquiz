export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ debug: true, version: 'streaming-v2' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { material, questionCount = 10, difficulty = 'medium' } = req.body;

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Brak klucza API.' });
  }

  if (!material || material.trim().length < 50) {
    return res.status(400).json({ error: 'Za mało materiału. Dodaj więcej tekstu.' });
  }

  const difficultyMap = {
    easy: 'PODSTAWY — pytania budujące zrozumienie: "jak działa X?", "po co stosujemy Y?"',
    medium: 'ROZUMIENIE — pytania wymagające dedukcji: "dlaczego X a nie Y?", "co się stanie gdy...?"',
    hard: 'ANALIZA — pytania łączące wiedzę: "który wariant lepszy i dlaczego?", "co jest przyczyną?"'
  };

  const systemPrompt = `Jesteś nauczycielem technikum informatycznego. Uczysz przez ROZUMOWANIE — uczeń ma zrozumieć mechanizm, nie wkuwać.

PYTANIA: testuj rozumienie (dlaczego? co się stanie? jaka przyczyna?). Błędne odpowiedzi = typowe błędy myślowe uczniów.
WYJAŚNIENIA: tok rozumowania krok po kroku, dlaczego poprawna, dlaczego każda błędna jest błędna. 3-5 zdań.

WAŻNE: Odpowiedz WYŁĄCZNIE poprawnym JSON. Żadnego tekstu przed/po. Żadnych backtick-ów ani markdown.`;

  const jsonInstruction = `Zwróć TYLKO czysty JSON:
{"topic":"nazwa tematu","questions":[{"id":1,"question":"Treść?","options":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],"correct":"B","explanation":"3-5 zdań: tok rozumowania, dlaczego B poprawne, dlaczego A/C/D błędne.","hint":"Wskazówka."}]}`;

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
        max_tokens: questionCount * 400 + 500,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Wygeneruj ${questionCount} pytań, poziom: ${difficultyMap[difficulty]}.\n\nMATERIAŁ:\n${material.slice(0, 8000)}\n\n${jsonInstruction}`
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('API error:', response.status, errText);
      return res.status(502).json({ error: 'Błąd API (' + response.status + '): ' + errText.slice(0, 200) });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';
    console.log('Response length:', raw.length);

    // Extract JSON from response
    let cleaned = raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch(e) {
      // Fix trailing commas
      try {
        parsed = JSON.parse(cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'));
      } catch(e2) {
        console.error('Parse fail:', raw.slice(0, 500));
        return res.status(500).json({ error: 'Błąd parsowania. Spróbuj ponownie.' });
      }
    }

    if (!parsed.questions?.length) {
      return res.status(500).json({ error: 'Brak pytań w odpowiedzi.' });
    }

    return res.status(200).json(parsed);

  } catch(err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Błąd: ' + err.message });
  }
}
