// js/draw.js
// Ekran 2: Pełnoekranowe losowanie kolejności z animacją koła fortuny.
// Po naciśnięciu "Start" przechodzi do widoku 3 (rozgrywka).

/* ─── Stan modułu ─── */
let competitors  = [];   // lista zawodników po losowaniu
let onStartCb    = null; // callback uruchamiany po kliknięciu Start

/* ─── Helpers DOM ─── */
const el  = id => document.getElementById(id);
const $ = sel => document.querySelector(sel);

/* ─────────────────────────────────────────────
   DRAW VIEW — renderowanie ekranu losowania
   ───────────────────────────────────────────── */
export function openDrawView(competitorList, onStart) {
    competitors = [...competitorList];
    onStartCb   = onStart;
    currentAngle = 0;
    spinning     = false;

    const view = el('drawView');
    if (!view) return;

    view.style.display = 'flex';

    // Ustaw podtytuł (nazwa zawodów z inputu)
    const nameInput = document.getElementById('eventNameInput');
    const subtitle  = document.querySelector('.draw-subtitle-el');
    if (subtitle && nameInput && nameInput.value.trim())
        subtitle.textContent = nameInput.value.trim();
    else if (subtitle)
        subtitle.textContent = '';

    drawWheel(competitors, 0);
    renderOrder(competitors);

    // Resetuj stan przycisków
    el('drawSpinBtn').disabled    = false;
    el('drawStartBtn').disabled   = true;
    el('drawSpinBtn').textContent = '🎰 Losuj kolejność';
}

export function closeDrawView() {
    const view = el('drawView');
    if (view) view.style.display = 'none';
}

/* ─────────────────────────────────────────────
   KOŁO FORTUNY
   ───────────────────────────────────────────── */

// Kolory segmentów
const SEG_COLORS = [
    '#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6',
    '#1abc9c','#e67e22','#2980b9','#27ae60','#8e44ad',
    '#c0392b','#16a085','#d35400','#2c3e50','#f1c40f',
    '#7f8c8d','#6c3483','#148f77','#ba4a00','#1f618d',
];

let spinning     = false;
let currentAngle = 0;  // aktualne obrócenie koła (radiany) — spójne z drawWheel()

/**
 * Rysuje koło obrócone o `offsetRad` radianów.
 *
 * Model geometryczny (jeden spójny układ):
 *   - Strzałka wskaźnik jest na górze canvas (kąt 270° = -π/2 w canvas).
 *   - Segment i zaczyna się od kąta:  i * arcSize + offsetRad  (względem osi X canvas)
 *   - Środek segmentu i jest pod strzałką gdy:
 *       (i + 0.5) * arcSize + offsetRad ≡ -π/2  (mod 2π)
 *       offsetRad = -π/2 - (i + 0.5) * arcSize  + k*2π
 */
function drawWheel(names, offsetRad) {
    const canvas = el('wheelCanvas');
    if (!canvas) return;
    const n   = names.length;
    if (n === 0) return;
    const ctx = canvas.getContext('2d');
    const W   = canvas.width;
    const H   = canvas.height;
    const cx  = W / 2;
    const cy  = H / 2;
    const r   = Math.min(cx, cy) - 8;

    ctx.clearRect(0, 0, W, H);

    const arcSize = (2 * Math.PI) / n;

    for (let i = 0; i < n; i++) {
        const segStart = i * arcSize + offsetRad;
        const segEnd   = segStart + arcSize;
        const color    = SEG_COLORS[i % SEG_COLORS.length];

        // Segment wypełnienie
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, segStart, segEnd);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Etykieta — obrócona wzdłuż promienia, wyrównana do prawej (od środka)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(segStart + arcSize / 2);
        ctx.textAlign   = 'right';
        ctx.fillStyle   = '#fff';
        ctx.font        = `bold ${Math.max(10, Math.min(15, 320 / n))}px sans-serif`;
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur  = 3;
        let label = names[i];
        if (label.length > 14) label = label.slice(0, 13) + '…';
        ctx.fillText(label, r - 12, 5);
        ctx.restore();
    }

    // Środkowy krąg
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, 2 * Math.PI);
    ctx.fillStyle   = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur  = 8;
    ctx.fill();
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Emoji centrum
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font         = '20px sans-serif';
    ctx.fillStyle    = '#333';
    ctx.shadowBlur   = 0;
    ctx.fillText('🎰', cx, cy);
}

/* Strzałka wskaźnik (rysowana ponad canvasem) */
function renderPointer() {
    const wrap = el('wheelWrap');
    if (!wrap || wrap.querySelector('.wheel-pointer')) return;
    const ptr = document.createElement('div');
    ptr.className = 'wheel-pointer';
    ptr.innerHTML = '▼';
    wrap.appendChild(ptr);
}

/* ─────────────────────────────────────────────
   SPIN — animacja
   ───────────────────────────────────────────── */
function spin() {
    if (spinning || competitors.length === 0) return;
    spinning = true;
    el('drawSpinBtn').disabled  = true;
    el('drawStartBtn').disabled = true;

    const n       = competitors.length;
    const arcSize = (2 * Math.PI) / n;  // rozmiar segmentu w radianach

    // 1. Losujemy zwycięzcę
    const winIndex = Math.floor(Math.random() * n);

    // 2. Obliczamy docelowy offsetRad tak, by środek segmentu winIndex
    //    znalazł się dokładnie pod strzałką (kąt -π/2 = góra canvas).
    //
    //    Środek segmentu i jest pod strzałką gdy:
    //      (i + 0.5) * arcSize + offsetRad = -π/2  (mod 2π)
    //    Stąd:
    //      offsetRad_target = -π/2 - (winIndex + 0.5) * arcSize
    //    Normalizujemy do zakresu [0, 2π) dodając wielokrotność 2π.
    const TWO_PI      = 2 * Math.PI;
    let targetOffset  = -Math.PI / 2 - (winIndex + 0.5) * arcSize;
    // Normalizuj do [0, 2π)
    targetOffset = ((targetOffset % TWO_PI) + TWO_PI) % TWO_PI;

    // 3. Obecny offset (startujemy od currentAngle — też w radianach)
    const startOffset = currentAngle;  // trzymamy w radianach od teraz

    // 4. Policz delta — ile radianów do obrócenia do przodu
    let delta = targetOffset - (startOffset % TWO_PI);
    if (delta <= 0) delta += TWO_PI;   // zawsze obracamy do przodu

    // 5. Dodaj pełne obroty dla efektu WOW
    const totalRad   = 6 * TWO_PI + delta;
    const duration   = 4500;
    const ease       = t => 1 - Math.pow(1 - t, 5);  // easeOutQuint
    let   startTime  = null;

    function frame(ts) {
        if (!startTime) startTime = ts;
        const elapsed  = ts - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const offset   = startOffset + totalRad * ease(progress);

        drawWheel(competitors, offset);

        if (progress < 1) {
            requestAnimationFrame(frame);
        } else {
            // Zapisz dokładny offset końcowy
            currentAngle = startOffset + totalRad;

            spinning = false;

            // Zwycięzca to winIndex — na pozycję 0, reszta losowo
            shuffleKeepWinner(winIndex);
            flashWinner(competitors[0]);
            renderOrder(competitors);

            setTimeout(() => {
                el('drawStartBtn').disabled   = false;
                el('drawSpinBtn').disabled    = false;
                el('drawSpinBtn').textContent = '🎰 Losuj ponownie';
            }, 900);
        }
    }

    requestAnimationFrame(frame);
}

function shuffleKeepWinner(winnerIdx) {
    // Przesuń zwycięzcę na pozycję 0, resztę przetasuj losowo
    const winner = competitors[winnerIdx];
    const rest   = competitors.filter((_, i) => i !== winnerIdx);
    // Fisher-Yates dla reszty
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    competitors = [winner, ...rest];
}

function flashWinner(name) {
    const items = document.querySelectorAll('#drawOrderList .draw-order-item');
    items.forEach(item => {
        if (item.dataset.name === name) {
            item.classList.add('draw-winner-flash');
            setTimeout(() => item.classList.remove('draw-winner-flash'), 2000);
        }
    });
}

/* ─────────────────────────────────────────────
   LISTA KOLEJNOŚCI
   ───────────────────────────────────────────── */
function renderOrder(names) {
    const list = el('drawOrderList');
    if (!list) return;
    list.innerHTML = names.map((name, idx) => `
        <div class="draw-order-item" data-name="${escHtml(name)}">
            <span class="draw-order-num" style="background:${SEG_COLORS[idx % SEG_COLORS.length]}">${idx + 1}</span>
            <span class="draw-order-name">${escHtml(name)}</span>
            ${idx === 0 ? '<span class="draw-first-badge">START</span>' : ''}
        </div>
    `).join('');
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─────────────────────────────────────────────
   EVENT LISTENERS (wołane z main.js)
   ───────────────────────────────────────────── */
export function setupDrawListeners() {
    const spinBtn  = el('drawSpinBtn');
    const startBtn = el('drawStartBtn');
    const backBtn  = el('drawBackBtn');

    if (spinBtn)  spinBtn.addEventListener('click',  spin);
    if (startBtn) startBtn.addEventListener('click', () => {
        if (onStartCb) onStartCb(competitors);
        closeDrawView();
    });
    if (backBtn)  backBtn.addEventListener('click', () => {
        closeDrawView();
        // Pokaż widok intro
        const intro = el('intro');
        if (intro) intro.style.display = 'block';
    });

    renderPointer();
}
