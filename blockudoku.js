const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const GRID = 9;

// 0 = empty, 1 = filled, 2 = clearing (fade)
let board = Array.from({length: GRID}, () => Array(GRID).fill(0));
let clearA = Array.from({length: GRID}, () => Array(GRID).fill(0));

let score = 0;
let best = Number(localStorage.getItem("bd_best") || 0);

let tray = [], dragging = null, ghost = null;
let gameOver = false;

const CLEAR_MS = 280;

const COLORS = {
  bg: "#e8edf3",
  cell1: "#ffffff",
  cell2: "#f2f5fa",
  gridLine: "rgba(160,170,185,0.55)",
  gridBold: "rgba(140,150,165,0.75)",
  block: "#2B63D9",
  blockHint: "#9DCCFF",
  panelTop: "#f7f9fc",
  panelBot: "#e9eef6",
  panelBorder: "rgba(150,160,175,0.60)",
  panelInner: "rgba(255,255,255,0.75)",
};

const HINT_ALPHA_CELL = 0.85;
const HINT_ALPHA_GHOST = 0.55;

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overEl = document.getElementById("over");
const finalEl = document.getElementById("final");

const homeBtn = document.getElementById("homeBtn");
const undoBtn = document.getElementById("undoBtn");

homeBtn.onclick = () => {
  window.location.href = "index.html";
};

document.getElementById("again").onclick = () => reset();

function setScore(v){
  score = v;
  scoreEl.textContent = score;
  if(score > best){
    best = score;
    localStorage.setItem("bd_best", String(best));
  }
  bestEl.textContent = "Best: " + best;
}
setScore(0);
bestEl.textContent = "Best: " + best;

// ---------- Undo ----------
let undoState = null;
function deepCopyBoard(b){ return b.map(row => row.slice()); }
function deepCopyTray(t){
  return t.map(p => ({
    cells: p.cells.map(([r,c])=>[r,c]),
    used: p.used,
    x: p.x, y: p.y, dragging: false,
    rx: p.rx, ry: p.ry,
    offX: p.offX, offY: p.offY
  }));
}
function saveUndoSnapshot(){
  undoState = {
    board: deepCopyBoard(board),
    clearA: deepCopyBoard(clearA),
    score: score,
    tray: deepCopyTray(tray),
    gameOver: gameOver
  };
  undoBtn.disabled = false;
}
function restoreUndo(){
  if(!undoState) return;
  board = deepCopyBoard(undoState.board);
  clearA = deepCopyBoard(undoState.clearA);
  tray = deepCopyTray(undoState.tray);
  setScore(undoState.score);
  gameOver = false;
  hideGameOver();
  dragging = null;
  ghost = null;
  undoState = null;
  undoBtn.disabled = true;
}
undoBtn.onclick = () => {
  if(gameOver) hideGameOver();
  restoreUndo();
};

// ---------- resize ----------
function resize(){
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);
}
window.addEventListener("resize", resize);
resize();

// ---------- shapes ----------
const BASE_SHAPES = [
  [[0,0]],
  [[0,0],[0,1]],
  [[0,0],[1,0]],
  [[0,0],[0,1],[0,2]],
  [[0,0],[1,0],[2,0]],
  [[0,0],[0,1],[0,2],[0,3]],
  [[0,0],[1,0],[2,0],[3,0]],
  [[0,0],[0,1],[1,0],[1,1]],
  [[0,0],[0,1],[0,2],[1,1]],
  [[0,0],[0,1],[0,2],[1,1],[2,1]],
  [[0,0],[1,0],[2,0],[2,1],[2,2]],
  [[0,0],[1,0],[1,1],[1,2]],
  [[0,0],[0,1],[0,2],[1,0]],
  [[0,0],[0,1],[1,1],[1,2]],
  [[0,0],[1,0],[1,1]],
];

function norm(shape){
  let minR = 999, minC = 999;
  for(const [r,c] of shape){ if(r<minR) minR=r; if(c<minC) minC=c; }
  return shape.map(([r,c])=>[r-minR,c-minC]);
}
function rotate90(shape){ return norm(shape.map(([r,c])=>[c,-r])); }
function mirrorX(shape){ return norm(shape.map(([r,c])=>[r,-c])); }

function genVariants(base){
  const out = new Map();
  let s = norm(base);
  for(let i=0;i<4;i++){
    out.set(JSON.stringify(s), s);
    out.set(JSON.stringify(mirrorX(s)), mirrorX(s));
    s = rotate90(s);
  }
  return [...out.values()];
}
const SHAPES = BASE_SHAPES.flatMap(genVariants);

function pickRandomShape(){
  return SHAPES[(Math.random()*SHAPES.length)|0];
}

function newTray(){
  tray = [0,1,2].map(() => ({
    cells: pickRandomShape(),
    used:false,
    x:0, y:0, dragging:false,
    rx:0, ry:0, offX:0, offY:0
  }));
}
newTray();

function canPlace(p, gr, gc){
  for(const [dr,dc] of p.cells){
    const r = gr+dr, c = gc+dc;
    if(r<0 || r>=GRID || c<0 || c>=GRID) return false;
    if(board[r][c] !== 0) return false;
  }
  return true;
}

function anyMovesLeft(){
  const pieces = tray.filter(p => !p.used);
  if(pieces.length === 0) return true;
  for(const p of pieces){
    for(let r=0;r<GRID;r++){
      for(let c=0;c<GRID;c++){
        if(canPlace(p,r,c)) return true;
      }
    }
  }
  return false;
}

function showGameOver(){
  gameOver = true;
  finalEl.textContent = "Score: " + score;
  overEl.style.display = "flex";
}
function hideGameOver(){
  overEl.style.display = "none";
}

function reset(){
  board = Array.from({length: GRID}, () => Array(GRID).fill(0));
  clearA = Array.from({length: GRID}, () => Array(GRID).fill(0));
  setScore(0);
  dragging = null;
  ghost = null;
  gameOver = false;
  hideGameOver();
  newTray();
  undoState = null;
  undoBtn.disabled = true;
}

function draw(){
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0,0,innerWidth,innerHeight);
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
