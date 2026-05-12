# Strong22 - architektura

## Warstwy

- `index.html`, `judge.html`, `live.html` - osobne ekrany aplikacji statycznej.
- `js/main.js` - inicjalizacja aplikacji i podpinanie zdarzen UI.
- `js/state.js` - jedyne miejsce, ktore powinno mutowac globalny stan zawodow.
- `js/domain/scoring.js` - czyste reguly punktacji, bez DOM i bez zapisu danych.
- `js/competition.js` - koordynacja przejsc zawodow, np. final.
- `js/db-dexie.js`, `js/eventsDb.js`, `js/checkpointsDb.js` - warstwa danych IndexedDB/Dexie.
- `js/ui.js` - renderowanie widokow i modalow.
- `js/judge.js` - sesje sedziow pomocniczych, Firebase Realtime Database z fallbackiem localStorage.
- `js/liveDisplay.js` - telebim przez BroadcastChannel/localStorage.

## Przeplyw danych

1. Uzytkownik wybiera zawodnikow i konkurencje w UI.
2. `main.js` przekazuje zdarzenia do `handlers.js`.
3. `handlers.js` wywoluje publiczne funkcje z `state.js` i czyste reguly z `domain/scoring.js`.
4. `ui.js` renderuje aktualny stan.
5. `persistence.js` zapisuje autosave/checkpointy w IndexedDB.
6. `liveDisplay.js` i `judge.js` publikuja stan do ekranow pomocniczych.

## Zasady utrzymania

- Nowa logika punktacji powinna trafiac do `js/domain/scoring.js`.
- Kod poza `state.js` nie powinien pisac bezposrednio do `state`.
- Nowa baza danych powinna isc przez jedna warstwe: Dexie/IndexedDB.
- Przy renderowaniu stringow HTML trzeba uzywac `escapeHTML` albo tworzyc elementy DOM recznie.
