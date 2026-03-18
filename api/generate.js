export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method === 'GET') return Response.json({ runtime: 'edge-stream', version: 'v4' }, { headers: corsHeaders });
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return Response.json({ error: 'Brak klucza API.' }, { status: 500, headers: corsHeaders });

  let body;
  try { body = await req.json(); } catch(e) {
    return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders });
  }

  const { material, questionCount = 10, difficulty = 'medium' } = body;
  if (!material || material.trim().length < 50) {
    return Response.json({ error: 'Za mało materiału.' }, { status: 400, headers: corsHeaders });
  }

  const difficultyMap = {
    easy: 'PODSTAWY — pytania budujące zrozumienie',
    medium: 'ROZUMIENIE — pytania wymagające dedukcji',
    hard: 'ANALIZA — pytania łączące wiedzę i wnioskowanie'
  };

  const systemPrompt = `Jesteś nauczycielem technikum informatycznego. Uczysz przez ROZUMOWANIE — uczeń ma zrozumieć mechanizm, nie wkuwać.
PYTANIA: testuj rozumienie (dlaczego? co się stanie? jaka przyczyna?). Błędne odpowiedzi = typowe błędy myślowe uczniów.
WYJAŚNIENIA: tok rozumowania, dlaczego poprawna, dlaczego każda błędna jest błędna. 3-5 zdań.
WAŻNE: Odpowiedz WYŁĄCZNIE poprawnym JSON. Żadnego tekstu przed/po. Żadnych backtick-ów.`;

  const jsonInstruction = `Zwróć TYLKO czysty JSON:
{"topic":"nazwa tematu","questions":[{"id":1,"question":"Treść?","options":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],"correct":"B","explanation":"3-5 zdań wyjaśnienia.","hint":"Wskazówka."}]}`;

  try {
    // Use streaming to avoid timeout
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
        stream: true,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Wygeneruj ${questionCount} pytań, poziom: ${difficultyMap[difficulty]}.\n\nMATERIAŁ:\n${material.slice(0, 8000)}\n\n${jsonInstruction}`
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return Response.json({ error: 'Błąd API (' + response.status + '): ' + errText.slice(0, 200) }, { status: 502, headers: corsHeaders });
    }

    // Collect streamed chunks
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const event = JSON.parse(data);
            if (event.type === 'content_block_delta' && event.delta?.text) {
              fullText += event.delta.text;
            }
          } catch(e) { /* skip unparseable lines */ }
        }
      }
    }

    if (!fullText) {
      return Response.json({ error: 'Pusta odpowiedź AI.' }, { status: 500, headers: corsHeaders });
    }

    // Extract JSON
    let cleaned = fullText.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch(e) {
      try {
        parsed = JSON.parse(cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'));
      } catch(e2) {
        return Response.json({ error: 'Błąd parsowania. Spróbuj ponownie.' }, { status: 500, headers: corsHeaders });
      }
    }

    if (!parsed.questions?.length) {
      return Response.json({ error: 'Brak pytań.' }, { status: 500, headers: corsHeaders });
    }

    return Response.json(parsed, { headers: corsHeaders });

  } catch(err) {
    return Response.json({ error: 'Błąd: ' + err.message }, { status: 500, headers: corsHeaders });
  }
}
