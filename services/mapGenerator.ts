
import { MapTile } from '../types';
import { MAP_WIDTH_TILES, MAP_HEIGHT_TILES } from '../constants';

export const generateMap = (): MapTile[][] => {
  const map: MapTile[][] = [];
  
  // Perlin-ish noise for elevation
  const getElevation = (x: number, y: number) => {
    return (Math.sin(x * 0.2) + Math.cos(y * 0.2) + Math.sin((x + y) * 0.1) + 2) / 4;
  };

  for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
    const row: MapTile[] = [];
    for (let x = 0; x < MAP_WIDTH_TILES; x++) {
      // Create a grid-like maze pattern
      let type: 'ROAD' | 'WALL' | 'GRASS' = 'ROAD';
      
      // Borders
      if (x === 0 || y === 0 || x === MAP_WIDTH_TILES - 1 || y === MAP_HEIGHT_TILES - 1) {
        type = 'WALL';
      } else if (x % 4 === 0 && y % 4 === 0) {
        // Blocks of obstacles
        type = 'WALL';
      }

      row.push({
        elevation: getElevation(x, y),
        type
      });
    }
    map.push(row);
  }
  
  return map;
};
