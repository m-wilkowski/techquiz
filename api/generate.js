export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { material, isPDF, pdfBase64, questionCount = 10, difficulty = 'medium' } = req.body;

  // Limit body size ~5MB for Vercel
  if (pdfBase64 && pdfBase64.length > 6_000_000) {
    return res.status(400).json({ error: 'Plik za duży (max 4.5 MB). Zmniejsz PDF lub użyj tekstu.' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Brak klucza API po stronie serwera.' });
  }

  const difficultyMap = {
    easy: 'podstawowe — sprawdzają znajomość definicji i prostych faktów',
    medium: 'średnie — wymagają rozumienia mechanizmów i zależności, nie tylko zapamiętania',
    hard: 'trudne — wymagają analizy, porównania kilku koncepcji i rozumowania przyczynowo-skutkowego'
  };

  const systemPrompt = `Jesteś nauczycielem technikum informatycznego. Twoje pytania mają UCZYĆ, nie sprawdzać.
Uczeń ma ZROZUMIEĆ dlaczego coś działa tak a nie inaczej — żeby nie musiał się uczyć na pamięć.

ZASADY TWORZENIA PYTAŃ:
1. Każde pytanie testuje ROZUMIENIE mechanizmu, nie znajomość definicji
2. Pytania typu "dlaczego X a nie Y?", "co się stanie gdy...?", "jaki jest powód...?"
3. Scenariusze praktyczne: "Administrator zauważył że... Co jest przyczyną?"
4. Porównania: "Czym różni się X od Y w kontekście...?"
5. Przyczynowo-skutkowe: "Jeśli zmienimy X, to co stanie się z Y i dlaczego?"

ZASADY DLA ODPOWIEDZI:
1. Błędne odpowiedzi muszą być LOGICZNIE zbliżone — typowe błędy w rozumowaniu uczniów
2. Żadna odpowiedź nie może być oczywista ani absurdalna
3. Każda błędna odpowiedź powinna reprezentować konkretny błąd myślowy

ZASADY DLA WYJAŚNIEŃ (NAJWAŻNIEJSZE):
1. Wyjaśnienie MUSI pokazać TOK ROZUMOWANIA krok po kroku
2. Wyjaśnij DLACZEGO poprawna odpowiedź jest poprawna — jaki mechanizm za tym stoi
3. Dla KAŻDEJ błędnej odpowiedzi wyjaśnij jaki błąd w rozumowaniu prowadzi do jej wybrania
4. Użyj analogii lub przykładów z życia jeśli to pomoże zrozumieć
5. Uczeń po przeczytaniu wyjaśnienia ma ROZUMIEĆ temat, nie tylko znać odpowiedź

Język: polski, techniczny ale przystępny. Każde pytanie ma dokładnie 4 opcje (A, B, C, D).
Odpowiedz WYŁĄCZNIE poprawnym JSON. Żadnego tekstu przed ani po. Żadnych backtick-ów.`;

  const jsonInstruction = `Zwróć TYLKO JSON (bez żadnego innego tekstu):
{
  "topic": "krótka nazwa tematu",
  "questions": [
    {
      "id": 1,
      "question": "Treść pytania?",
      "options": [
        { "id": "A", "text": "..." },
        { "id": "B", "text": "..." },
        { "id": "C", "text": "..." },
        { "id": "D", "text": "..." }
      ],
      "correct": "B",
      "explanation": "Tok rozumowania krok po kroku: 1) dlaczego B jest poprawne — jaki mechanizm za tym stoi, 2) dla każdej błędnej opcji — jaki błąd myślowy prowadzi do jej wybrania. Minimum 4-6 zdań. Celem jest żeby uczeń ZROZUMIAŁ temat, nie tylko zapamiętał odpowiedź.",
      "hint": "Wskazówka naprowadzająca na tok rozumowania, bez zdradzania odpowiedzi."
    }
  ]
}`;

  try {
    let messages;

    if (isPDF && pdfBase64) {
      messages = [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          { type: 'text', text: `Wygeneruj dokładnie ${questionCount} pytań quizowych, poziom: ${difficultyMap[difficulty]}.\n\n${jsonInstruction}` }
        ]
      }];
    } else {
      if (!material || material.trim().length < 50) {
        return res.status(400).json({ error: 'Za mało materiału. Dodaj więcej tekstu.' });
      }
      messages = [{
        role: 'user',
        content: `Na podstawie materiału wygeneruj dokładnie ${questionCount} pytań quizowych, poziom: ${difficultyMap[difficulty]}.\n\nMATERIAŁ:\n${material.slice(0, 14000)}\n\n${jsonInstruction}`
      }];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2024-10-22'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        system: systemPrompt,
        messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', errText);
      return res.status(502).json({ error: 'Błąd komunikacji z AI. Spróbuj ponownie.' });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';
    const cleaned = raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch(e) {
      console.error('JSON parse fail. Raw snippet:', raw.slice(0, 400));
      return res.status(500).json({ error: 'Błąd parsowania odpowiedzi AI. Spróbuj ponownie.' });
    }

    if (!parsed.questions?.length) {
      return res.status(500).json({ error: 'AI nie wygenerowało pytań. Upewnij się, że materiał ma wystarczającą treść.' });
    }

    return res.status(200).json(parsed);

  } catch(err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Nieoczekiwany błąd. Spróbuj ponownie.' });
  }
}
