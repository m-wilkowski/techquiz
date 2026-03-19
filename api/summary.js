export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Brak klucza API.' });

  const { material } = req.body;
  if (!material || material.trim().length < 50) return res.status(400).json({ error: 'Za mało materiału.' });

  const systemPrompt = `Jesteś nauczycielem IT w technikum. Mówisz do uczniów 16-20 lat — naturalnie, ale poprawną polszczyzną.
Stwórz zwięzłą ściągę z materiału. Format:
- Tytuł tematu
- 5-10 kluczowych pojęć/mechanizmów, każde w 1-2 zdaniach
- Skup się na TYM CO TRZEBA ZROZUMIEĆ, nie na definicjach do wkucia
- Użyj emoji jako ikon przy każdym punkcie
- Pisz jak dla kumpla, który potrzebuje szybko ogarnąć temat przed sprawdzianem`;

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
        max_tokens: 1024,
        temperature: 0.7,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Stwórz ściągę z tego materiału:\n\n${material.slice(0, 5000)}`
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: 'Błąd API (' + response.status + '): ' + errText.slice(0, 200) });
    }

    const data = await response.json();
    const summary = data.content?.[0]?.text || '';

    if (!summary) return res.status(500).json({ error: 'Brak podsumowania.' });
    return res.status(200).json({ summary });

  } catch(err) {
    return res.status(500).json({ error: 'Błąd: ' + err.message });
  }
}
