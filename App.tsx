
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  GameState, Player, Enemy, ItemType, MapTile, GameObject, Vector2D 
} from './types';
import { 
  TILE_SIZE, MAP_WIDTH_TILES, MAP_HEIGHT_TILES, 
  PLAYER_BASE_SPEED, ENEMY_BASE_SPEED, 
  FUEL_CONSUMPTION_RATE, SMOKE_COST, SMOKE_LIFETIME,
  SCREEN_WIDTH, SCREEN_HEIGHT 
} from './constants';
import { generateMap } from './services/mapGenerator';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [advice, setAdvice] = useState<string>("깃발을 모두 모아 다음 레벨로 가세요!");

  const mapRef = useRef<MapTile[][]>([]);
  const keysPressed = useRef<Set<string>>(new Set());

  // AI Advice Service using Gemini
  const fetchAdvice = useCallback(async (level: number) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `고전 게임 방구차의 고수로서, 현재 레벨 ${level}을 플레이 중인 유저에게 격려와 팁을 한글 한 문장으로 해주세요. 깃발 수집의 중요성을 언급해주세요.`,
        config: { temperature: 0.8 }
      });
      if (response.text) {
        setAdvice(response.text.trim());
      }
    } catch (e) {
      console.error("AI error", e);
    }
  }, []);

  const initLevel = useCallback((level: number, existingPlayer?: Player) => {
    const map = generateMap();
    mapRef.current = map;
    
    const flagsCount = 5 + level * 2;
    const enemiesCount = Math.min(10, 3 + level);
    
    const initialPlayer: Player = existingPlayer ? {
      ...existingPlayer,
      fuel: Math.min(existingPlayer.maxFuel, existingPlayer.fuel + 40), // 레벨업 보너스 연료
      pos: { x: TILE_SIZE * 2.5, y: TILE_SIZE * 2.5 }
    } : {
      pos: { x: TILE_SIZE * 2.5, y: TILE_SIZE * 2.5 },
      vel: { x: 0, y: 0 },
      angle: 0,
      radius: 20,
      speed: PLAYER_BASE_SPEED,
      fuel: 100,
      maxFuel: 100,
      score: 0,
      items: [],
      isInvincible: false,
      smokeActive: false
    };

    const initialEnemies: Enemy[] = Array.from({ length: enemiesCount }).map((_, i) => ({
      pos: { 
        x: TILE_SIZE * (MAP_WIDTH_TILES - 4 - (i % 5)), 
        y: TILE_SIZE * (MAP_HEIGHT_TILES - 4 - Math.floor(i / 5)) 
      },
      vel: { x: 0, y: 0 },
      angle: 0,
      radius: 20,
      speed: ENEMY_BASE_SPEED + (level * 0.2), // 레벨당 속도 증가
      isStunned: false,
      stunTimer: 0
    }));

    const initialObjects: GameObject[] = [];
    
    // Create Flags (Main Objective)
    let flagsPlaced = 0;
    while (flagsPlaced < flagsCount) {
      const rx = Math.floor(Math.random() * (MAP_WIDTH_TILES - 4)) + 2;
      const ry = Math.floor(Math.random() * (MAP_HEIGHT_TILES - 4)) + 2;
      if (map[ry][rx].type === 'ROAD') {
        initialObjects.push({
          id: `flag-${flagsPlaced}`,
          pos: { x: rx * TILE_SIZE + TILE_SIZE/2, y: ry * TILE_SIZE + TILE_SIZE/2 },
          type: ItemType.FLAG
        });
        flagsPlaced++;
      }
    }

    // Create Other Items
    for (let i = 0; i < 15; i++) {
      const rx = Math.floor(Math.random() * (MAP_WIDTH_TILES - 2)) + 1;
      const ry = Math.floor(Math.random() * (MAP_HEIGHT_TILES - 2)) + 1;
      if (map[ry][rx].type === 'ROAD') {
        initialObjects.push({
          id: `item-${i}`,
          pos: { x: rx * TILE_SIZE + TILE_SIZE/2, y: ry * TILE_SIZE + TILE_SIZE/2 },
          type: Math.random() > 0.5 ? ItemType.FUEL : ItemType.SMOKE
        });
      }
    }

    setGameState({
      player: initialPlayer,
      enemies: initialEnemies,
      objects: initialObjects,
      smokes: [],
      camera: { x: 0, y: 0 },
      isGameOver: false,
      level: level,
      flagsTotal: flagsCount,
      flagsCollected: 0,
      isLevelTransition: false
    });
    
    if (level > 1) fetchAdvice(level);
  }, [fetchAdvice]);

  const startGame = () => {
    setGameOver(false);
    setGameStarted(true);
    initLevel(1);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.code);
      if (e.code === 'KeyR' && (gameOver || !gameStarted)) startGame();
    };
    const handleKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.code);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameOver, gameStarted]);

  const update = useCallback(() => {
    if (!gameState || gameState.isGameOver || gameState.isLevelTransition) return;

    setGameState(prev => {
      if (!prev) return null;
      const next = { ...prev };
      const { player, enemies, smokes, objects } = next;

      // --- Player Movement ---
      let targetVel = { x: 0, y: 0 };
      if (keysPressed.current.has('ArrowUp')) { targetVel.y = -1; player.angle = -Math.PI/2; }
      else if (keysPressed.current.has('ArrowDown')) { targetVel.y = 1; player.angle = Math.PI/2; }
      else if (keysPressed.current.has('ArrowLeft')) { targetVel.x = -1; player.angle = Math.PI; }
      else if (keysPressed.current.has('ArrowRight')) { targetVel.x = 1; player.angle = 0; }

      const tx = Math.floor(player.pos.x / TILE_SIZE);
      const ty = Math.floor(player.pos.y / TILE_SIZE);
      const currentTile = mapRef.current[ty]?.[tx] || { elevation: 0.5, type: 'WALL' };
      const elevationFactor = 1.5 - currentTile.elevation;
      const currentSpeed = PLAYER_BASE_SPEED * elevationFactor;

      const nextPosX = player.pos.x + targetVel.x * currentSpeed;
      const nextPosY = player.pos.y + targetVel.y * currentSpeed;

      const nextTileX = Math.floor(nextPosX / TILE_SIZE);
      const nextTileY = Math.floor(nextPosY / TILE_SIZE);
      if (mapRef.current[nextTileY]?.[nextTileX]?.type !== 'WALL') {
        player.pos.x = nextPosX;
        player.pos.y = nextPosY;
      }

      player.fuel -= FUEL_CONSUMPTION_RATE;
      if (player.fuel <= 0) {
        next.isGameOver = true;
        setGameOver(true);
      }

      if (keysPressed.current.has('Space') && player.fuel > SMOKE_COST && !player.smokeActive) {
        smokes.push({ pos: { ...player.pos }, lifetime: SMOKE_LIFETIME });
        player.fuel -= SMOKE_COST;
        player.smokeActive = true;
        setTimeout(() => { player.smokeActive = false }, 100);
      }

      // --- Object Collection ---
      next.objects = objects.filter(obj => {
        const dist = Math.hypot(obj.pos.x - player.pos.x, obj.pos.y - player.pos.y);
        if (dist < player.radius + 15) {
          if (obj.type === ItemType.FUEL) {
            player.fuel = Math.min(player.maxFuel, player.fuel + 25);
            player.score += 50;
          } else if (obj.type === ItemType.FLAG) {
            next.flagsCollected++;
            player.score += 500;
          } else {
            player.score += 100;
          }
          return false;
        }
        return true;
      });

      // Level Up Check
      if (next.flagsCollected >= next.flagsTotal) {
        next.isLevelTransition = true;
        setTimeout(() => {
          initLevel(next.level + 1, player);
        }, 2000);
      }

      next.smokes = smokes.filter(s => {
        s.lifetime--;
        return s.lifetime > 0;
      });

      // --- Enemy AI ---
      enemies.forEach(enemy => {
        if (enemy.isStunned) {
          enemy.stunTimer--;
          if (enemy.stunTimer <= 0) enemy.isStunned = false;
          return;
        }

        const dx = player.pos.x - enemy.pos.x;
        const dy = player.pos.y - enemy.pos.y;
        const dist = Math.hypot(dx, dy);
        
        const etx = Math.floor(enemy.pos.x / TILE_SIZE);
        const ety = Math.floor(enemy.pos.y / TILE_SIZE);
        const eTile = mapRef.current[ety]?.[etx] || { elevation: 0.5 };
        const eElevationFactor = 1.5 - eTile.elevation;
        
        // Slightly smarter pathing (avoid walls)
        enemy.pos.x += (dx / dist) * enemy.speed * eElevationFactor;
        enemy.pos.y += (dy / dist) * enemy.speed * eElevationFactor;
        enemy.angle = Math.atan2(dy, dx);

        next.smokes.forEach(s => {
          const sDist = Math.hypot(s.pos.x - enemy.pos.x, s.pos.y - enemy.pos.y);
          if (sDist < 40) {
            enemy.isStunned = true;
            enemy.stunTimer = 180;
          }
        });

        if (dist < player.radius + enemy.radius) {
          next.isGameOver = true;
          setGameOver(true);
        }
      });

      next.camera = {
        x: player.pos.x - SCREEN_WIDTH / 2,
        y: player.pos.y - SCREEN_HEIGHT / 2
      };

      return next;
    });
  }, [gameState, initLevel]);

  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      update();
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [update]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { player, enemies, smokes, objects, camera } = gameState;

    ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Draw Map
    for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
      for (let x = 0; x < MAP_WIDTH_TILES; x++) {
        const tile = mapRef.current[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        if (px + TILE_SIZE < camera.x || px > camera.x + SCREEN_WIDTH ||
            py + TILE_SIZE < camera.y || py > camera.y + SCREEN_HEIGHT) continue;

        if (tile.type === 'WALL') {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        } else {
          const shade = Math.floor(tile.elevation * 100);
          ctx.fillStyle = `rgb(${40 + shade}, ${120 - shade/2}, ${40})`;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          if (Math.floor(tile.elevation * 10) % 2 === 0) {
             ctx.strokeStyle = 'rgba(255,255,255,0.03)';
             ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }

    // Draw Smokes
    smokes.forEach(s => {
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, 30, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220, 220, 220, ${s.lifetime / SMOKE_LIFETIME * 0.6})`;
      ctx.fill();
    });

    // Draw Objects
    objects.forEach(obj => {
      if (obj.type === ItemType.FLAG) {
        // Draw Flag
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(obj.pos.x - 5, obj.pos.y + 15);
        ctx.lineTo(obj.pos.x - 5, obj.pos.y - 15);
        ctx.lineTo(obj.pos.x + 15, obj.pos.y - 8);
        ctx.lineTo(obj.pos.x - 5, obj.pos.y);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(obj.pos.x, obj.pos.y, 12, 0, Math.PI * 2);
        if (obj.type === ItemType.FUEL) ctx.fillStyle = '#fbbf24';
        else ctx.fillStyle = '#94a3b8';
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(obj.type === ItemType.FUEL ? 'F' : 'S', obj.pos.x, obj.pos.y + 4);
      }
    });

    // Draw Enemies
    enemies.forEach(enemy => {
      ctx.save();
      ctx.translate(enemy.pos.x, enemy.pos.y);
      ctx.rotate(enemy.angle);
      ctx.fillStyle = enemy.isStunned ? '#64748b' : '#ef4444';
      ctx.fillRect(-18, -12, 36, 24);
      ctx.fillStyle = 'black';
      ctx.fillRect(-14, -15, 8, 4); ctx.fillRect(6, -15, 8, 4);
      ctx.fillRect(-14, 11, 8, 4); ctx.fillRect(6, 11, 8, 4);
      ctx.restore();
    });

    // Draw Player
    ctx.save();
    ctx.translate(player.pos.x, player.pos.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(-18, -12, 36, 24);
    ctx.fillStyle = '#93c5fd';
    ctx.fillRect(6, -8, 8, 16);
    ctx.fillStyle = 'black';
    ctx.fillRect(-14, -15, 8, 4); ctx.fillRect(6, -15, 8, 4);
    ctx.fillRect(-14, 11, 8, 4); ctx.fillRect(6, 11, 8, 4);
    ctx.restore();

    ctx.restore();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black overflow-hidden text-white p-4 font-mono">
      {/* HUD */}
      <div className="w-full max-w-[800px] grid grid-cols-3 gap-4 mb-4 items-center">
        <div className="bg-gray-900 p-2 border-l-4 border-blue-500">
          <div className="text-[10px] text-blue-400">LEVEL {gameState?.level}</div>
          <div className="text-xl font-bold">{gameState?.player.score.toLocaleString()}</div>
        </div>
        
        <div className="flex flex-col items-center">
          <div className="text-[10px] text-red-500 animate-pulse mb-1">
            FLAGS: {gameState?.flagsCollected} / {gameState?.flagsTotal}
          </div>
          <div className="w-full bg-gray-800 h-3 border border-gray-700">
            <div 
              className="h-full bg-yellow-500 transition-all duration-300" 
              style={{ width: `${gameState?.player.fuel || 0}%` }}
            />
          </div>
        </div>

        <div className="text-right bg-gray-900 p-2 border-r-4 border-red-500">
          <div className="text-[10px] text-gray-400">BEST SCORE</div>
          <div className="text-xl">000,000</div>
        </div>
      </div>

      <div className="relative border-4 border-gray-800 rounded-sm shadow-2xl bg-black overflow-hidden">
        <canvas 
          ref={canvasRef} 
          width={SCREEN_WIDTH} 
          height={SCREEN_HEIGHT}
          className="block"
        />

        {!gameStarted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10 text-center">
            <h1 className="text-5xl text-blue-500 mb-8 font-black tracking-tighter">RALLY BANGGU</h1>
            <div className="grid grid-cols-2 gap-8 mb-10 text-left text-sm max-w-lg">
              <div className="space-y-2">
                <p className="text-red-400 font-bold underline">목표:</p>
                <p>맵에 흩어진 모든 <span className="text-red-500">깃발</span>을 모으세요.</p>
                <p>깃발을 모두 모으면 다음 레벨!</p>
              </div>
              <div className="space-y-2">
                <p className="text-blue-400 font-bold underline">조작:</p>
                <p>방향키: 운전</p>
                <p>스페이스: 연막 (적 기절)</p>
              </div>
            </div>
            <button 
              onClick={startGame}
              className="px-12 py-5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-2xl border-b-8 border-blue-800 active:translate-y-2 active:border-b-0 transition-all"
            >
              INSERT COIN
            </button>
          </div>
        )}

        {gameState?.isLevelTransition && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-900/60 backdrop-blur-sm z-30 animate-in fade-in duration-500">
            <div className="bg-white text-blue-900 p-8 transform -rotate-2 shadow-2xl">
              <h2 className="text-6xl font-black italic">LEVEL CLEAR!</h2>
              <p className="text-xl text-center mt-2 font-bold">GET READY FOR LEVEL {gameState.level + 1}</p>
            </div>
          </div>
        )}

        {gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/90 z-40">
            <h2 className="text-7xl font-black text-white mb-4 animate-bounce">GAME OVER</h2>
            <div className="text-2xl mb-10 text-red-200">TOTAL SCORE: {gameState?.player.score}</div>
            <button 
              onClick={startGame}
              className="px-10 py-4 bg-white text-red-900 hover:bg-gray-200 transition-all text-xl font-black uppercase tracking-widest"
            >
              TRY AGAIN (R)
            </button>
          </div>
        )}

        {gameStarted && !gameOver && !gameState?.isLevelTransition && (
          <div className="absolute bottom-4 left-4 right-4 bg-black/60 border border-gray-700 p-3 text-xs leading-tight">
            <span className="text-blue-400 font-bold mr-2">AI TIP:</span> {advice}
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-8 text-[10px] text-gray-500 uppercase font-bold tracking-widest">
        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500"></div> PLAYER</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500"></div> ENEMY</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-yellow-500"></div> FUEL</span>
        <span className="flex items-center gap-1"><div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[10px] border-b-red-500"></div> FLAG</span>
      </div>
    </div>
  );
};

export default App;
