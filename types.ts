
export enum ItemType {
  SMOKE = 'SMOKE',
  SPEED = 'SPEED',
  FUEL = 'FUEL',
  SHIELD = 'SHIELD',
  FLAG = 'FLAG'
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface Entity {
  pos: Vector2D;
  vel: Vector2D;
  angle: number;
  radius: number;
}

export interface Player extends Entity {
  speed: number;
  fuel: number;
  maxFuel: number;
  score: number;
  items: ItemType[];
  isInvincible: boolean;
  smokeActive: boolean;
}

export interface Enemy extends Entity {
  speed: number;
  isStunned: boolean;
  stunTimer: number;
}

export interface GameObject {
  pos: Vector2D;
  type: ItemType | 'WALL' | 'DECOR';
  id: string;
}

export interface MapTile {
  elevation: number; // 0.0 (valley) to 1.0 (peak)
  type: 'ROAD' | 'WALL' | 'GRASS';
}

export interface GameState {
  player: Player;
  enemies: Enemy[];
  objects: GameObject[];
  smokes: { pos: Vector2D; lifetime: number }[];
  camera: Vector2D;
  isGameOver: boolean;
  level: number;
  flagsTotal: number;
  flagsCollected: number;
  isLevelTransition: boolean;
}
