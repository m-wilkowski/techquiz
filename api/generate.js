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
    easy: 'PODSTAWY — uczeń ma zrozumieć jak coś działa i dlaczego. Pytania budujące fundament: "jak działa X?", "po co stosujemy Y?", "co robi Z?"',
    medium: 'ROZUMIENIE — uczeń ma rozumieć DLACZEGO coś działa tak a nie inaczej. Pytania wymagające dedukcji: "dlaczego X a nie Y?", "co się stanie gdy...?", "jaka jest przyczyna...?"',
    hard: 'ANALIZA — uczeń ma łączyć wiedzę i wnioskować. Pytania wymagające porównania mechanizmów, znajdowania przyczyn awarii, projektowania rozwiązań: "który wariant lepszy W TYM scenariuszu i dlaczego?", "co jest przyczyną tego objawu?"'
  };

  const systemPrompt = `Jesteś cierpliwym nauczycielem technikum informatycznego. Twój cel to sprawić żeby uczeń ZROZUMIAŁ temat tak dobrze, że nie będzie musiał się uczyć na pamięć — bo jak rozumie mechanizm, to odpowiedź wynika logicznie.

FILOZOFIA: Uczymy przez DEDUKCJĘ i ROZUMOWANIE, nie przez odpytywanie z definicji.

TYPY PYTAŃ (mieszaj je):
1. PRZYCZYNOWE: "Dlaczego w RAID 5 potrzeba minimum 3 dysków?" — uczeń musi zrozumieć mechanizm
2. SCENARIUSZOWE: "Serwer ma macierz RAID 5 z 4 dyskami. Padł jeden dysk. Co się dzieje z danymi i dlaczego?" — praktyczne myślenie
3. PORÓWNAWCZE: "Firma potrzebuje maksymalnej wydajności odczytu. Dlaczego RAID 0 będzie szybszy niż RAID 1?" — rozumienie różnic
4. DIAGNOSTYCZNE: "Administrator zauważył spadek wydajności po awarii dysku. W jakiej konfiguracji to nastąpi i dlaczego?" — wnioskowanie z objawów
5. PROJEKTOWE: "Masz 6 dysków po 1TB. Potrzebujesz max bezpieczeństwa. Która konfiguracja i dlaczego?" — łączenie wiedzy
6. "CO SIĘ STANIE GDY": "Co się stanie z danymi w RAID 0 gdy padnie jeden z czterech dysków? Dlaczego?" — rozumienie konsekwencji

ZASADY DLA BŁĘDNYCH ODPOWIEDZI:
- Każda błędna odpowiedź = typowy BŁĄD W ROZUMOWANIU ucznia (nie głupota!)
- Np. "mylenie stripingu z mirroringiem", "zapomnienie o bicie parzystości", "policzenie pojemności bez uwzględnienia redundancji"
- Uczeń ma myśleć "hmm, to brzmi logicznie ale..." — wtedy uczy się rozróżniać

ZASADY DLA WYJAŚNIEŃ (TO NAJWAŻNIEJSZA CZĘŚĆ!):
- Zacznij od TOKU ROZUMOWANIA: "Pomyślmy krok po kroku..."
- Wyjaśnij MECHANIZM stojący za poprawną odpowiedzią (nie tylko "B jest poprawne")
- Dla KAŻDEJ błędnej odpowiedzi napisz: "Gdybyś wybrał X — to typowy błąd polegający na..." i wyjaśnij JAKI błąd myślowy za tym stoi
- Użyj ANALOGII z życia codziennego jeśli pomoże (np. "RAID 1 działa jak kserowanie dokumentu — masz dwie kopie")
- Uczeń po przeczytaniu wyjaśnienia ma ROZUMIEĆ cały mechanizm, nie tylko znać literę odpowiedzi
- Minimum 5-8 zdań na wyjaśnienie

Język: polski, techniczny ale przystępny dla ucznia technikum. Każde pytanie ma dokładnie 4 opcje (A, B, C, D).
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
      "explanation": "Pomyślmy krok po kroku: [wyjaśnienie mechanizmu]. Dlatego odpowiedź B jest poprawna — [dlaczego]. Gdybyś wybrał A — to typowy błąd polegający na [opis błędu myślowego]. Opcja C jest błędna bo [wyjaśnienie]. Opcja D — [wyjaśnienie]. [Opcjonalnie: analogia z życia]. Minimum 5-8 zdań.",
      "hint": "Naprowadzenie na tok rozumowania bez zdradzania odpowiedzi, np. 'Zastanów się jak działa parzystość — ile dysków minimum potrzeba żeby ją obliczyć?'"
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
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: Math.min(8000, questionCount * 350 + 1000),
        system: systemPrompt,
        messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', response.status, errText);
      if (response.status === 401) return res.status(502).json({ error: 'Nieprawidłowy klucz API. Sprawdź konfigurację.' });
      if (response.status === 429) return res.status(502).json({ error: 'Za dużo zapytań. Poczekaj chwilę i spróbuj ponownie.' });
      if (response.status === 404) return res.status(502).json({ error: 'Model AI niedostępny. Błąd: ' + errText.slice(0, 200) });
      return res.status(502).json({ error: 'Błąd AI (' + response.status + '): ' + errText.slice(0, 200) });
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
