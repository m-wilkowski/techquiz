# TechQuiz — Nauka przez rozumienie

Aplikacja do nauki na sprawdziany z technikum informatycznego.  
Wgrywasz prezentację/notatki → AI generuje pytania uczące rozumienia, nie wkuwania.

---

## Jak to działa

1. Uczeń otwiera link (np. `techquiz.vercel.app`)
2. Wrzuca PDF lub PPTX od nauczyciela (albo wkleja tekst)
3. Wybiera liczbę pytań i poziom trudności
4. Dostaje quiz z wyjaśnieniami po każdej odpowiedzi
5. Na końcu przegląd wszystkich odpowiedzi z wyjaśnieniami

Działa z **dowolnym materiałem technicznym** — sieci, bazy danych, systemy operacyjne, programowanie, itd.

---

## Deploy na Vercel (ok. 10-15 minut, raz na zawsze)

### Krok 1 — Klucz API Anthropic

1. Wejdź na [console.anthropic.com](https://console.anthropic.com)
2. Zarejestruj konto (możesz użyć Google)
3. Po rejestracji dostaniesz **$5 kredytu gratis** (wystarczy na setki quizów)
4. Wejdź w **API Keys** → **Create Key**
5. Skopiuj klucz — zaczyna się od `sk-ant-...`
6. **Zachowaj go** — zobaczysz go tylko raz

### Krok 2 — GitHub

1. Wejdź na [github.com](https://github.com) i zaloguj się (lub załóż konto)
2. Kliknij **New repository**
3. Nazwa: `techquiz` (lub dowolna)
4. Zostaw ustawienia domyślne → **Create repository**
5. Wgraj pliki z tego folderu:
   - Kliknij **uploading an existing file**
   - Przeciągnij CAŁY folder `techquiz` (wszystkie pliki i podfoldery)
   - Commit changes

   **Struktura która musi być w repo:**
   ```
   api/
     generate.js
   public/
     index.html
   package.json
   vercel.json
   ```

### Krok 3 — Vercel

1. Wejdź na [vercel.com](https://vercel.com)
2. **Sign Up** → zaloguj się przez GitHub
3. Kliknij **Add New Project**
4. Wybierz repozytorium `techquiz` → **Import**
5. **WAŻNE — przed Deploy:** kliknij **Environment Variables**
6. Dodaj zmienną:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** wklej swój klucz `sk-ant-...`
   - Kliknij **Add**
7. Kliknij **Deploy**
8. Poczekaj ~1 minutę

### Krok 4 — Gotowe

Vercel da Ci URL w stylu `techquiz-abc123.vercel.app`  
Ten link możesz wysłać synowi — działa na telefonie, tablecie i komputerze.

---

## Koszty

- **Vercel hosting:** bezpłatny (darmowy plan wystarczy)
- **Claude API:** ~$0.002 za jeden quiz (10 pytań)
- Za $5 kredytu startowego = ok. **2500 quizów**
- Jak się skończy kredyt — doładuj $5 i starczy na rok

---

## Aktualizacja aplikacji

Jak zmienisz cokolwiek w kodzie i wrzucisz na GitHub → Vercel automatycznie zrobi nowy deploy.

---

## Obsługiwane formaty plików

| Format | Obsługa |
|--------|---------|
| PDF | ✅ Pełna (tekst + PDF graficzny) |
| PPTX | ✅ Ekstrakcja tekstu ze slajdów |
| TXT / MD | ✅ Wklejanie lub upload |

---

## Problemy

**"Brak klucza API"** — sprawdź czy dodałeś zmienną `ANTHROPIC_API_KEY` w Vercel  
**"Za mało materiału"** — wgraj plik z więcej treści lub wklej więcej tekstu  
**Quiz nie startuje** — odśwież stronę i spróbuj ponownie  
