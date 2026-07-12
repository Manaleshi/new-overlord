'use client'

import { useEffect, useRef, useState } from 'react'

type Exit = {
  direction: string
  dest_loc_code: string
  dest_terrain: string
  dest_name: string
  walk_days: number | null
  ride_days: number | null
  fly_days: number
  sail_days: number | null
  impassable: boolean
  sailing_only: boolean
}

type InnerLocation = {
  id: string
  name: string
  type: string
  population: number
  economics: {
    wages: number
    taxes: number
    entertainment: number
    market: boolean
    market_days: number[]
    recruits?: {
      followers: { amount: number; price: number }
      leaders: { amount: number; price: number }
      heroes: { amount: number; price: number }
    }
  }
}

type Location = {
  loc_code: string
  terrain_type: string
  population: number
  geographic_name?: string
  grid_x?: number
  grid_y?: number
  economics?: {
    wages: number
    taxes: number
    entertainment: number
    market: boolean
    market_days: number[]
    recruits?: {
      followers: { amount: number; price: number }
      leaders: { amount: number; price: number }
      heroes: { amount: number; price: number }
    }
  }
  resources?: {
    population_center?: InnerLocation
    is_imperial_land?: boolean
    is_imperial_city?: boolean
    exits?: Exit[]
    natural_resources?: {
      item: string
      tag: string
      amount: number
      tokens_per_day: number
      tokens_per_unit: number
      hidden: boolean
      required_skill: string | null
    }[]
  }
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
  cx: number, cy: number, size: number,
  fillColor: string, strokeColor: string, strokeWidth: number
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

function getHexAtPoint(mouseX: number, mouseY: number, locations: Location[]): Location | null {
  let closest: Location | null = null
  let closestDist = Infinity
  for (const loc of locations) {
    const x = loc.grid_x ?? 0
    const y = loc.grid_y ?? 0
    const { px, py } = hexCenter(x, y)
    const dist = Math.sqrt((mouseX - px) ** 2 + (mouseY - py) ** 2)
    if (dist < closestDist) {
      closestDist = dist
      closest = loc
    }
  }
  return closestDist < HEX_SIZE * 1.2 ? closest : null
}

function RecruitPanel({ recruits }: { recruits: InnerLocation['economics']['recruits'] }) {
  if (!recruits) return null
  const none = recruits.followers.amount === 0 && recruits.leaders.amount === 0 && recruits.heroes.amount === 0
  return (
    <div className="mb-3 border-t pt-2">
      <p className="font-semibold text-gray-700 mb-1">Recruits Available</p>
      {recruits.followers.amount > 0 && (
        <p className="text-gray-600">Followers: <span className="font-medium">{recruits.followers.amount}</span> @ ${recruits.followers.price}/each</p>
      )}
      {recruits.leaders.amount > 0 && (
        <p className="text-gray-600">Leaders: <span className="font-medium">{recruits.leaders.amount}</span> @ ${recruits.leaders.price}/each</p>
      )}
      {recruits.heroes.amount > 0 && (
        <p className="text-yellow-600 font-semibold">⭐ Hero available @ ${recruits.heroes.price}</p>
      )}
      {none && <p className="text-gray-400 italic">No recruits available</p>}
    </div>
  )
}

function EconomicsPanel({ econ }: { econ: NonNullable<Location['economics']> }) {
  return (
    <div className="mb-3 border-t pt-2 space-y-0.5">
      <p className="font-semibold text-gray-700 mb-1">Economics</p>
      <p>Wages: <span className="font-medium">${econ.wages}/figure</span></p>
      <p>Taxes: <span className="font-medium">${econ.taxes.toLocaleString()}</span></p>
      <p>Entertainment: <span className="font-medium">${econ.entertainment.toLocaleString()}</span></p>
      {econ.market && <p>Market days: <span className="font-medium">{econ.market_days?.join(' & ')}</span></p>}
    </div>
  )
}

export default function WorldMap({ locations }: { locations: Location[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selected, setSelected] = useState<Location | null>(null)
  const [mapData, setMapData] = useState<Location[]>(locations)
  const [hoveredCode, setHoveredCode] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'outer' | 'inner'>('outer')

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
      const x = loc.grid_x ?? 0
      const y = loc.grid_y ?? 0
      const { px, py } = hexCenter(x, y)
      const color = TERRAIN_COLORS[loc.terrain_type] ?? '#888'
      const isSelected = selected?.loc_code === loc.loc_code
      const isHovered = hoveredCode === loc.loc_code

      drawHex(ctx, px, py, HEX_SIZE - 0.5, color,
        isSelected ? '#ffffff' : isHovered ? '#dddddd' : '#1a1a1a',
        isSelected ? 2 : isHovered ? 1.5 : 0.5
      )

      const popCenter = loc.resources?.population_center
      if (popCenter) {
        const isImperial = popCenter.type === 'imperial'
        const dotSize = isImperial ? 5
          : popCenter.type === 'city' ? 3
          : popCenter.type === 'town' ? 2 : 1.5
        const dotColor = isImperial ? '#FFD700'
          : popCenter.type === 'city' ? '#ff0000'
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
    const loc = getHexAtPoint(e.clientX - rect.left, e.clientY - rect.top, mapData)
    setHoveredCode(loc?.loc_code ?? null)
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const loc = getHexAtPoint(e.clientX - rect.left, e.clientY - rect.top, mapData)
    if (loc) {
      setSelected(loc)
      setViewMode('outer')
    }
  }

  function changeTerrain(locCode: string, newTerrain: string) {
    setMapData(prev => prev.map(loc =>
      loc.loc_code === locCode ? { ...loc, terrain_type: newTerrain } : loc
    ))
    if (selected?.loc_code === locCode) {
      setSelected(prev => prev ? { ...prev, terrain_type: newTerrain } : null)
    }
  }

  const inner = selected?.resources?.population_center

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

      <div className="w-72 shrink-0 overflow-y-auto" style={{ maxHeight: '85vh' }}>
        {selected ? (
          <div className="border rounded p-4 bg-white shadow text-sm">

            {inner && (
              <div className="flex mb-3 border rounded overflow-hidden">
                <button
                  onClick={() => setViewMode('outer')}
                  className={`flex-1 px-2 py-1 text-xs font-semibold ${viewMode === 'outer' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  Outer
                </button>
                <button
                  onClick={() => setViewMode('inner')}
                  className={`flex-1 px-2 py-1 text-xs font-semibold ${viewMode === 'inner' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {inner.name}
                </button>
              </div>
            )}

            {viewMode === 'outer' || !inner ? (
              <>
                <h3 className="font-bold text-lg mb-0.5">{selected.loc_code}</h3>
                <p className="text-gray-400 text-xs mb-1">{selected.geographic_name}</p>
                <p className="text-gray-600 mb-1">{TERRAIN_LABELS[selected.terrain_type]}</p>
                <p className="text-gray-500 mb-2">Population: {selected.population.toLocaleString()}</p>

                {selected.resources?.is_imperial_land && (
                  <div className="mb-2 p-1 bg-yellow-100 rounded text-xs text-yellow-800 font-semibold">
                    ⚜️ Imperial Lands
                  </div>
                )}

                {selected.economics && <EconomicsPanel econ={selected.economics} />}
                <RecruitPanel recruits={selected.economics?.recruits} />

                {selected.resources?.natural_resources && selected.resources.natural_resources.length > 0 && (
                  <div className="mb-3 border-t pt-2">
                    <p className="font-semibold text-gray-700 mb-1">Resources</p>
                    {selected.resources.natural_resources.map((r: any) => (
                      <div key={r.tag + r.item} className="flex justify-between items-center mb-0.5">
                        <span className={r.hidden ? 'text-purple-500 italic' : 'text-gray-600'}>
                          {r.item} [{r.tag}]{r.hidden ? ' *' : ''}
                        </span>
                        <span className="font-medium">{r.amount}</span>
                      </div>
                    ))}
                    {selected.resources.natural_resources.some((r: any) => r.hidden) && (
                      <p className="text-purple-400 text-xs mt-1">* requires skill to harvest</p>
                    )}
                  </div>
                )}

                {selected.resources?.exits && selected.resources.exits.length > 0 && (
                  <div className="mb-3 border-t pt-2">
                    <p className="font-semibold text-gray-700 mb-1">Exits</p>
                    {selected.resources.exits.map((exit: Exit) => (
                      <div key={exit.direction} className="mb-1.5 text-xs">
                        <span className="font-semibold text-gray-800">{exit.direction}</span>
                        <span className="text-gray-400 ml-1">{exit.dest_loc_code}</span>
                        <span className="text-gray-600 ml-1">{exit.dest_name}</span>
                        <span className="text-gray-400 ml-1 capitalize">({exit.dest_terrain})</span>
                        <br />
                        {exit.impassable && <span className="text-red-500 ml-2">— impassable</span>}
                        {exit.sailing_only && <span className="text-blue-500 ml-2">— {exit.sail_days}d sailing only</span>}
                        {!exit.impassable && !exit.sailing_only && (
                          <span className="text-gray-500 ml-2">walk {exit.walk_days}d / ride {exit.ride_days}d / fly 4d</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t pt-2">
                  <p className="font-semibold text-gray-700 mb-1">Change Terrain:</p>
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
              </>
            ) : (
              <>
                <h3 className="font-bold text-lg mb-0.5">{inner.name}</h3>
                <p className="text-gray-400 text-xs mb-1">[{inner.id}]</p>
                <p className="text-gray-500 capitalize mb-1">{inner.type}</p>
                <p className="text-gray-500 mb-2">Population: {inner.population.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mb-3 italic">Inner location of {selected.loc_code} — 1 day to enter/leave</p>

                <EconomicsPanel econ={inner.economics} />
                <RecruitPanel recruits={inner.economics.recruits} />

                <div className="border-t pt-2 text-xs text-gray-500">
                  <p className="font-semibold text-gray-700 mb-1">Resources</p>
                  <p className="italic">No natural resources — harvested from outer location.</p>
                </div>
              </>
            )}
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
            <div className="flex items-center gap-2 text-xs mb-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#FFD700' }} />Imperial City
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}