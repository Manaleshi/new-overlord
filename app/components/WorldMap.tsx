'use client'

import { useState, useCallback } from 'react'

type Location = {
  loc_code: string
  terrain_type: string
  population: number
}

const TERRAIN_COLORS: Record<string, string> = {
  plains: '#90c45a',
  forest: '#2d6e2d',
  mountains: '#8b7355',
  ocean: '#1a6b9e',
  desert: '#d4a843',
  swamp: '#4a6741',
  hills: '#a0845c',
}

const TERRAIN_LABELS: Record<string, string> = {
  plains: '🌾 Plains',
  forest: '🌲 Forest',
  mountains: '⛰️ Mountains',
  ocean: '🌊 Ocean',
  desert: '🏜️ Desert',
  swamp: '🌿 Swamp',
  hills: '🏔️ Hills',
}

const ALL_TERRAINS = ['plains', 'forest', 'mountains', 'ocean', 'desert', 'swamp', 'hills']

export default function WorldMap({ locations }: { locations: Location[] }) {
  const [selected, setSelected] = useState<Location | null>(null)
  const [mapData, setMapData] = useState<Location[]>(locations)
  const [hoveredCode, setHoveredCode] = useState<string | null>(null)

  const hexSize = 18
  const hexWidth = hexSize * 2
  const hexHeight = Math.sqrt(3) * hexSize

  function getHexPosition(locCode: string) {
    const x = parseInt(locCode.slice(1, 3))
    const y = parseInt(locCode.slice(3, 5))
    const px = x * hexWidth * 0.75 + hexSize
    const py = y * hexHeight + (x % 2 === 1 ? hexHeight / 2 : 0) + hexHeight / 2
    return { px, py }
  }

  function hexPoints(cx: number, cy: number, size: number) {
    const points = []
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30)
      points.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`)
    }
    return points.join(' ')
  }

  function changeTerrain(locCode: string, newTerrain: string) {
    setMapData(prev => prev.map(loc =>
      loc.loc_code === locCode
        ? { ...loc, terrain_type: newTerrain }
        : loc
    ))
    if (selected?.loc_code === locCode) {
      setSelected(prev => prev ? { ...prev, terrain_type: newTerrain } : null)
    }
  }

  const maxX = 20 * hexWidth * 0.75 + hexSize * 2
  const maxY = 21 * hexHeight + hexHeight

  return (
    <div className="flex gap-4">
      <div className="overflow-auto border rounded bg-gray-900" style={{ maxHeight: '600px' }}>
        <svg width={maxX} height={maxY}>
          {mapData.map((loc) => {
            const { px, py } = getHexPosition(loc.loc_code)
            const color = TERRAIN_COLORS[loc.terrain_type] ?? '#888'
            const isSelected = selected?.loc_code === loc.loc_code
            const isHovered = hoveredCode === loc.loc_code
            const size = isSelected ? hexSize - 1 : hexSize - 1

            return (
              <g
                key={loc.loc_code}
                onClick={() => setSelected(loc)}
                onMouseEnter={() => setHoveredCode(loc.loc_code)}
                onMouseLeave={() => setHoveredCode(null)}
                style={{ cursor: 'pointer' }}
              >
                <polygon
                  points={hexPoints(px, py, size)}
                  fill={color}
                  stroke={isSelected ? '#ffffff' : isHovered ? '#dddddd' : '#1a1a1a'}
                  strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 0.5}
                  opacity={isHovered && !isSelected ? 0.85 : 1}
                />
              </g>
            )
          })}
        </svg>
      </div>

      <div className="w-64 shrink-0">
        {selected ? (
          <div className="border rounded p-4 bg-white shadow">
            <h3 className="font-bold text-lg mb-1">{selected.loc_code}</h3>
            <p className="text-gray-600 mb-3">{TERRAIN_LABELS[selected.terrain_type]}</p>
            <p className="text-sm text-gray-500 mb-4">Population: {selected.population.toLocaleString()}</p>

            <div>
              <p className="text-sm font-semibold mb-2">Change Terrain:</p>
              <div className="grid grid-cols-2 gap-1">
                {ALL_TERRAINS.map(terrain => (
                  <button
                    key={terrain}
                    onClick={() => changeTerrain(selected.loc_code, terrain)}
                    className={`text-xs px-2 py-1 rounded border ${
                      selected.terrain_type === terrain
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {TERRAIN_LABELS[terrain]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="border rounded p-4 bg-gray-50 text-gray-400 text-sm">
            Click any hex to see details and edit terrain.
          </div>
        )}

        <div className="mt-4 border rounded p-3 bg-white">
          <p className="text-sm font-semibold mb-2">Legend</p>
          {ALL_TERRAINS.map(terrain => (
            <div key={terrain} className="flex items-center gap-2 text-xs mb-1">
              <div
                className="w-4 h-4 rounded-sm shrink-0"
                style={{ backgroundColor: TERRAIN_COLORS[terrain] }}
              />
              {TERRAIN_LABELS[terrain]}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}