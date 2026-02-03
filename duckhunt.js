let ducks = [];
let score = 0;
let level = 1;
let round = 1;
let hits = 0;
let roundKills = 0;

const MAX_LEVELS = 25;
const ROUNDS_PER_LEVEL = 8;
const SHOTS_PER_ROUND = 4;

let shotsLeft = SHOTS_PER_ROUND;
let specialBlueUsed = false;
let specialRedUsed = false;

/* سرعة أعلى شوي */
const SPEED_MULT = 1.35;

/* إحساس Duck Hunt */
const HIT_FREEZE_MS = 160;
const FALL_SPEED_MULT = 1.35;
const DOG_DELAY_MS = 180;
const DOG_SHOW_MS  = 900;

/* هروب لما تخلص الطلقات */
const ESCAPE_VY_MULT = 1.55;
const ESCAPE_FAILSAFE_MS = 1500;

/* شرط الفوز لأول لفلين */
const REQUIRED_HITS_LV1_2 = 6;

let state = "PLAYING"; // PLAYING | ESCAPE | GAMEOVER
let roundEnding = false;
let gameRunning = true;

let escapeTimer = null;

const duckTypes = {
  normal: { points: 500,  speed: 4.8 * SPEED_MULT },
  blue:   { points: 1000, speed: 6.2 * SPEED_MULT },
  red:    { points: 1500, speed: 7.0 * SPEED_MULT }
};

/* ================== Crosshair ================== */
function ensureCrosshair(){
  let c = document.getElementById("crosshair");
  if(!c){
    c = document.createElement("div");
    c.id = "crosshair";
    document.body.appendChild(c);
  }
  c.style.display = "block";
  c.style.visibility = "visible";
  c.style.opacity = "1";
  return c;
}
const crosshair = ensureCrosshair();

function moveCrosshair(x,y){
  crosshair.style.left = x + "px";
  crosshair.style.top  = y + "px";
}
window.addEventListener("mousemove", e => moveCrosshair(e.clientX, e.clientY));
window.addEventListener("touchstart", e => {
  const t = e.touches[0];
  if(t) moveCrosshair(t.clientX, t.clientY);
}, { passive:false });
window.addEventListener("touchmove", e => {
  const t = e.touches[0];
  if(t) moveCrosshair(t.clientX, t.clientY);
}, { passive:false });

/* ================== مؤشر أحمر/أبيض جنب HUD تحت ================== */
function ensureShotIndicator(){
  let el = document.getElementById("shotIndicator");
  if(!el){
    el = document.createElement("div");
    el.id = "shotIndicator";
    el.style.position = "fixed";
    el.style.width = "16px";
    el.style.height = "16px";
    el.style.borderRadius = "50%";
    el.style.border = "2px solid rgba(255,255,255,0.9)";
    el.style.zIndex = "99999";
    el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.35)";
    el.style.left = "50%";
    el.style.bottom = "28px";
    el.style.transform = "translateX(175px)";
    document.body.appendChild(el);
  }
  return el;
}
const shotIndicator = ensureShotIndicator();

function setShotIndicator(isHit){
  shotIndicator.style.background = isHit ? "#ff2a2a" : "#ffffff";
}

/* ================== Game Over ================== */
function showGameOver(){
  let g = document.getElementById("gameOver");
  if(!g){
    g = document.createElement("div");
    g.id = "gameOver";
    g.style.position = "fixed";
    g.style.inset = "0";
    g.style.display = "flex";
    g.style.flexDirection = "column";
    g.style.alignItems = "center";
    g.style.justifyContent = "center";
    g.style.background = "rgba(0,0,0,0.55)";
    g.style.zIndex = "999999";
    g.style.color = "#fff";
    g.style.fontFamily = "system-ui, -apple-system, Segoe UI, Arial";
    g.style.textAlign = "center";
    g.style.padding = "24px";
    g.innerHTML = `
      <div style="font-size:42px;font-weight:800;margin-bottom:10px;">GAME OVER</div>
      <div style="font-size:18px;opacity:.95;margin-bottom:14px;">
        Level ${level} — لازم في أول لفلين تصيد ${REQUIRED_HITS_LV1_2}+ خلال ${ROUNDS_PER_LEVEL} جولات.
      </div>
      <div style="font-size:16px;opacity:.9;margin-bottom:18px;">
        صِدت: <b>${hits}</b>
      </div>
      <div style="font-size:16px;opacity:.95;background:rgba(255,255,255,.12);padding:10px 14px;border-radius:12px;">
        اضغط أي مكان لإعادة اللعب
      </div>
    `;
    document.body.appendChild(g);
    g.addEventListener("click", restartGame);
  } else {
    g.style.display = "flex";
    g.querySelector("div:nth-child(2)").innerHTML =
      `Level ${level} — لازم في أول لفلين تصيد ${REQUIRED_HITS_LV1_2}+ خلال ${ROUNDS_PER_LEVEL} جولات.`;
    g.querySelector("div:nth-child(3)").innerHTML =
      `صِدت: <b>${hits}</b>`;
  }
}
function hideGameOver(){
  const g = document.getElementById("gameOver");
  if(g) g.style.display = "none";
}

/* ================== صوت ================== */
function sfx(name){
  try { new Audio(name).play(); } catch {}
}

/* ================== مساحة اللعب ================== */
let gameW = window.innerWidth;
let gameH = Math.floor(window.innerHeight * 0.78);
window.addEventListener("resize", ()=>{
  gameW = window.innerWidth;
  gameH = Math.floor(window.innerHeight * 0.78);
});

/* ================== صورة البط حسب الاتجاه ================== */
function setDuckImageIfNeeded(d){
  const want = d.vx >= 0 ? "duck-right.gif" : "duck-left.gif";
  if(d._sprite !== want){
    d._sprite = want;
    d.image.src = want;
  }
}

/* ================== إطلاق موحّد (يمنع نقص 2) ================== */
function fireShot(isHit){
  if(state !== "PLAYING" || roundEnding) return;
  if(shotsLeft <= 0) return;

  shotsLeft--;
  updateHUD();
  sfx("duck-shot.mp3");

  setShotIndicator(!!isHit);

  // إذا خلصت الطلقات ولسه فيه طيور طايرة: هروب
  if(shotsLeft === 0){
    const anyFlying = ducks.some(d => d.state === "FLYING");
    if(anyFlying){
      startEscape();
    } else if(ducks.length === 0){
      nextRound();
    }
  }
}

/* ================== هروب مضمون حتى لو علِق ================== */
function startEscape(){
  if(state === "ESCAPE") return;
  state = "ESCAPE";

  // مؤقت أمان: لو بعد مدة ما خلص، نحذفهم ونكمل
  clearTimeout(escapeTimer);
  escapeTimer = setTimeout(()=>{
    const flying = ducks.filter(d => d.state === "FLYING");
    flying.forEach(d=>{
      if(d.image.parentNode) d.image.parentNode.removeChild(d.image);
    });
    ducks = ducks.filter(d => d.state !== "FLYING");
    nextRound();
  }, ESCAPE_FAILSAFE_MS);
}

/* ================== الحركة ================== */
let lastTs = performance.now();

function animate(ts){
  if(!gameRunning) return;

  const dt = Math.min(0.03, (ts - lastTs) / 1000);
  lastTs = ts;

  const bottomY = gameH - 93 - 6;

  // وضع الهروب
  if(state === "ESCAPE"){
    for(const d of ducks){
      if(d.state === "FLYING"){
        d.vy = -Math.abs(d.baseSpeed * ESCAPE_VY_MULT);
      }
    }
  }

  for(const d of ducks){

    // HIT
    if(d.state === "HIT"){
      d.image.style.left = d.x + "px";
      d.image.style.top  = d.y + "px";
      d.image.style.transform = "rotate(180deg)";

      if(ts >= d.hitUntil){
        d.state = "FALLING";
        d.vy = d.baseSpeed * FALL_SPEED_MULT;
      }
      continue;
    }

    // FALLING
    if(d.state === "FALLING"){
      d.y += d.vy * dt * 60;
      d.image.style.left = d.x + "px";
      d.image.style.top  = d.y + "px";
      d.image.style.transform = "rotate(180deg)";

      if(d.y >= bottomY){
        if(d.image.parentNode) d.image.parentNode.removeChild(d.image);
        ducks = ducks.filter(x => x !== d);

        if(!roundEnding && ducks.length === 0 && state === "PLAYING"){
          endRoundSuccessWithDog();
        }
      }
      continue;
    }

    // FLYING
    d.image.style.transform = "";

    if(state === "PLAYING"){
      d.vx += (Math.random() - 0.5) * 0.12;
      const maxVX = d.baseSpeed * 1.1;
      d.vx = Math.max(-maxVX, Math.min(maxVX, d.vx));

      // ارتداد داخل السماء
      if(d.y <= 0) d.vy = Math.abs(d.vy);
      if(d.y >= bottomY) d.vy = -Math.abs(d.vy);
    }

    d.x += d.vx * dt * 60;
    d.y += d.vy * dt * 60;

    // ارتداد يمين/يسار
    if(d.x <= 0){
      d.x = 0;
      d.vx = Math.abs(d.vx);
    } else if(d.x + d.w >= gameW){
      d.x = gameW - d.w;
      d.vx = -Math.abs(d.vx);
    }

    // الهروب: إذا طلع فوق نحذفه
    if(state === "ESCAPE" && (d.y + d.h) < 0){
      if(d.image.parentNode) d.image.parentNode.removeChild(d.image);
      ducks = ducks.filter(x => x !== d);
      continue;
    }

    setDuckImageIfNeeded(d);

    d.image.style.left = d.x + "px";
    d.image.style.top  = d.y + "px";
  }

  // نهاية الهروب: إذا ما بقي بط
  if(state === "ESCAPE" && !roundEnding){
    if(ducks.length === 0){
      clearTimeout(escapeTimer);
      state = "PLAYING";
      nextRound();
    }
  }

  requestAnimationFrame(animate);
}

/* ================== البداية ================== */
window.onload = ()=>{
  moveCrosshair(window.innerWidth/2, window.innerHeight/2);
  setShotIndicator(false);
  startRound();
  requestAnimationFrame(animate);
};

function startRound(){
  roundEnding = false;
  state = "PLAYING";
  shotsLeft = SHOTS_PER_ROUND;
  roundKills = 0;
  updateHUD();

  clearTimeout(escapeTimer);

  // تنظيف بط قديم
  ducks.forEach(d=>{
    if(d.image.parentNode) d.image.parentNode.removeChild(d.image);
  });
  ducks = [];

  const duckCount = Math.min(3, level < 2 ? 1 : level < 4 ? 2 : 3);

  let forcedType = "normal";
  if(!specialBlueUsed){ forcedType = "blue"; specialBlueUsed = true; }
  else if(!specialRedUsed){ forcedType = "red"; specialRedUsed = true; }

  for(let i=0;i<duckCount;i++){
    spawnDuck(i===0 ? forcedType : "normal");
  }
}

function spawnDuck(type){
  const img = document.createElement("img");
  img.className = "duck";
  img.width = 96;
  img.height = 93;
  img.style.position = "absolute";

  const sp = duckTypes[type].speed;

  const duck = {
    image: img,
    type,
    baseSpeed: sp,
    w: img.width,
    h: img.height,
    x: Math.random() * (gameW - img.width),
    y: gameH - img.height - 6,
    vx: (Math.random()<0.5?-1:1) * sp,
    vy: -sp * 0.6,
    state: "FLYING",
    hitUntil: 0,
    _sprite: null
  };

  setDuckImageIfNeeded(duck);

  img.style.left = duck.x + "px";
  img.style.top  = duck.y + "px";

  // ✅ نوقف أي bubbling عشان ما تنقص طلقتين
  img.addEventListener("pointerdown", (e)=>{
    e.preventDefault();
    e.stopPropagation();
    shootDuck(duck);
  });

  document.body.appendChild(img);
  ducks.push(duck);
}

function shootDuck(duck){
  if(state !== "PLAYING" || roundEnding) return;
  if(shotsLeft <= 0) return;
  if(!duck || duck.state !== "FLYING") return;

  // ✅ طلقة واحدة فقط
  fireShot(true);

  score += duckTypes[duck.type].points;
  hits++;
  roundKills++;
  document.getElementById("score").textContent = score;

  sfx("duck-quack.mp3");

  duck.state = "HIT";
  duck.hitUntil = performance.now() + HIT_FREEZE_MS;
  duck.vx = 0;
  duck.vy = 0;
}

/* طلقة بأي مكان */
document.body.addEventListener("pointerdown", (e)=>{
  // إذا ضغط على طير، الحدث ما يوصل هنا بسبب stopPropagation
  fireShot(false);
});

/* ================== نهاية الجولة: كلب ثم جولة جديدة ================== */
function endRoundSuccessWithDog(){
  roundEnding = true;
  setTimeout(()=>{
    showDog();
    setTimeout(nextRound, 1100);
  }, DOG_DELAY_MS);
}

function showDog(){
  const img = document.createElement("img");
  img.src = (roundKills >= 2) ? "dog-duck2.png" : "dog-duck1.png";
  img.className = "dog";
  document.body.appendChild(img);
  sfx("dog-score.mp3");

  setTimeout(()=>{
    if(img.parentNode) img.parentNode.removeChild(img);
  }, DOG_SHOW_MS);
}

/* ================== انتقال / نهاية مستوى ================== */
function nextRound(){
  // لا ننتقل وفيه طيور HIT/FALLING
  if(ducks.some(d => d.state === "HIT" || d.state === "FALLING")){
    setTimeout(nextRound, 200);
    return;
  }

  round++;

  if(round > ROUNDS_PER_LEVEL){
if(hits < REQUIRED_HITS_LV1_2){
      gameOver();
      return;
    }

    if(hits >= 6 && level < MAX_LEVELS){
      level++;
    }

    round = 1;
    hits = 0;
    specialBlueUsed = false;
    specialRedUsed = false;
  }

  startRound();
}

function gameOver(){
  state = "GAMEOVER";
  gameRunning = false;
  showGameOver();
}

/* إعادة تشغيل */
function restartGame(){
  hideGameOver();

  score = 0;
  level = 1;
  round = 1;
  hits = 0;
  roundKills = 0;
  shotsLeft = SHOTS_PER_ROUND;
  specialBlueUsed = false;
  specialRedUsed = false;

  ducks.forEach(d=>{
    if(d.image.parentNode) d.image.parentNode.removeChild(d.image);
  });
  ducks = [];

  state = "PLAYING";
  roundEnding = false;
  gameRunning = true;

  setShotIndicator(false);
  updateHUD();
  startRound();
  lastTs = performance.now();
  requestAnimationFrame(animate);
}

/* HUD */
function updateHUD(){
  const s = document.getElementById("score");
  const l = document.getElementById("level");
  const r = document.getElementById("round");
  const sh = document.getElementById("shots");
  if(s) s.textContent = score;
  if(l) l.textContent = level;
  if(r) r.textContent = round;
  if(sh) sh.textContent = shotsLeft;
}
