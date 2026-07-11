'use client'

import { useEffect, useRef, useState } from 'react'

type Location = {
  loc_code: string
  terrain_type: string
  population: number
  geographic_name?: string
  population_center?: {
    name: string
    type: string
    population: number
  } | null
}

const TERRAIN_COLORS: Record<string, string> = {
  plains: '#d4c84a',
  forest: '#2d6e2d',
  mountains: '#8B4513',
  ocean: '#1a6b9e',
  desert: '#d4a843',
  swamp: '#7a8c6e',
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

const HEX_SIZE = 10

function hexCenter(x: number, y: number) {
  const w = HEX_SIZE * 2
  const h = Math.sqrt(3) * HEX_SIZE
  const px = x * w * 0.75 + HEX_SIZE
  const py = y * h + (x % 2 === 1 ? h / 2 : 0) + h / 2
  return { px, py }
}

function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  fillColor: string,
  strokeColor: string,
  strokeWidth: number
) {
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    const x = cx + size * Math.cos(angle)
    const y = cy + size * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = fillColor
  ctx.fill()
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = strokeWidth
  ctx.stroke()
}

function getHexAtPoint(
  mouseX: number,
  mouseY: number,
  locations: Location[]
): Location | null {
  let closest: Location | null = null
  let closestDist = Infinity

  for (const loc of locations) {
    const x = parseInt(loc.loc_code.slice(1, 3))
    const y = parseInt(loc.loc_code.slice(3, 5))
    const { px, py } = hexCenter(x, y)
    const dist = Math.sqrt((mouseX - px) ** 2 + (mouseY - py) ** 2)
    if (dist < closestDist) {
      closestDist = dist
      closest = loc
    }
  }

  return closestDist < HEX_SIZE * 1.2 ? closest : null
}

export default function WorldMap({ locations }: { locations: Location[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selected, setSelected] = useState<Location | null>(null)
  const [mapData, setMapData] = useState<Location[]>(locations)
  const [hoveredCode, setHoveredCode] = useState<string | null>(null)

  const w = HEX_SIZE * 2
  const h = Math.sqrt(3) * HEX_SIZE
  const canvasWidth = 50 * w * 0.75 + HEX_SIZE * 2
  const canvasHeight = 50 * h + h * 2

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const loc of mapData) {
      const x = parseInt(loc.loc_code.slice(1, 3))
      const y = parseInt(loc.loc_code.slice(3, 5))
      const { px, py } = hexCenter(x, y)
      const color = TERRAIN_COLORS[loc.terrain_type] ?? '#888'
      const isSelected = selected?.loc_code === loc.loc_code
      const isHovered = hoveredCode === loc.loc_code

      drawHex(
        ctx, px, py, HEX_SIZE - 0.5,
        color,
        isSelected ? '#ffffff' : isHovered ? '#dddddd' : '#1a1a1a',
        isSelected ? 2 : isHovered ? 1.5 : 0.5
      )

      // Draw population center dot
      const popCenter = loc.resources?.population_center
      if (popCenter) {
        const dotSize = popCenter.type === 'city' ? 3
          : popCenter.type === 'town' ? 2 : 1.5
        const dotColor = popCenter.type === 'city' ? '#ff0000'
          : popCenter.type === 'town' ? '#ffaa00' : '#ffffff'
        ctx.beginPath()
        ctx.arc(px, py, dotSize, 0, Math.PI * 2)
        ctx.fillStyle = dotColor
        ctx.fill()
      }
    }
  }, [mapData, selected, hoveredCode])

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const loc = getHexAtPoint(mouseX, mouseY, mapData)
    setHoveredCode(loc?.loc_code ?? null)
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const loc = getHexAtPoint(mouseX, mouseY, mapData)
    if (loc) setSelected(loc)
  }

  function changeTerrain(locCode: string, newTerrain: string) {
    setMapData(prev => prev.map(loc =>
      loc.loc_code === locCode ? { ...loc, terrain_type: newTerrain } : loc
    ))
    if (selected?.loc_code === locCode) {
      setSelected(prev => prev ? { ...prev, terrain_type: newTerrain } : null)
    }
  }

  return (
    <div className="flex gap-4">
      <div className="overflow-auto border rounded bg-gray-900" style={{ maxHeight: '85vh', maxWidth: '75vw' }}>
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          style={{ cursor: 'crosshair', display: 'block' }}
        />
      </div>

      <div className="w-64 shrink-0">
        {selected ? (
          <div className="border rounded p-4 bg-white shadow">
            <h3 className="font-bold text-lg mb-1">{selected.loc_code}</h3>
            <p className="text-sm text-gray-400 mb-1">{selected.geographic_name}</p>
            <p className="text-gray-600 mb-1">{TERRAIN_LABELS[selected.terrain_type]}</p>
            <p className="text-sm text-gray-500 mb-2">Population: {selected.population.toLocaleString()}</p>
            {selected.resources?.population_center && (
              <div className="mb-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                <p className="text-sm font-semibold">{selected.resources.population_center.name}</p>
                <p className="text-xs text-gray-500 capitalize">{selected.resources.population_center.type} — {selected.resources.population_center.population.toLocaleString()} pop</p>
              </div>
            )}
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
              <div className="w-4 h-4 rounded-sm shrink-0" style={{ backgroundColor: TERRAIN_COLORS[terrain] }} />
              {TERRAIN_LABELS[terrain]}
            </div>
          ))}
          <div className="mt-2 border-t pt-2">
            <div className="flex items-center gap-2 text-xs mb-1">
              <div className="w-3 h-3 rounded-full bg-white border border-gray-300" />Village
            </div>
            <div className="flex items-center gap-2 text-xs mb-1">
              <div className="w-3 h-3 rounded-full bg-yellow-400" />Town
            </div>
            <div className="flex items-center gap-2 text-xs mb-1">
              <div className="w-3 h-3 rounded-full bg-red-500" />City
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}