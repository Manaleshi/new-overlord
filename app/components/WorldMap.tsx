'use client'

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

export default function WorldMap({ locations }: { locations: Location[] }) {
  const hexSize = 16
  const hexWidth = hexSize * 2
  const hexHeight = Math.sqrt(3) * hexSize

  function getHexPosition(locCode: string) {
    const x = parseInt(locCode.slice(1, 3))
    const y = parseInt(locCode.slice(3, 5))
    const px = x * hexWidth * 0.75
    const py = y * hexHeight + (x % 2 === 1 ? hexHeight / 2 : 0)
    return { px, py }
  }

  function hexPoints(cx: number, cy: number) {
    const points = []
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30)
      points.push(`${cx + hexSize * Math.cos(angle)},${cy + hexSize * Math.sin(angle)}`)
    }
    return points.join(' ')
  }

  const maxX = 20 * hexWidth * 0.75 + hexSize
  const maxY = 20 * hexHeight + hexHeight

  return (
    <div className="overflow-auto border rounded p-2 bg-gray-900">
      <svg width={maxX} height={maxY}>
        {locations.map((loc) => {
          const { px, py } = getHexPosition(loc.loc_code)
          const color = TERRAIN_COLORS[loc.terrain_type] ?? '#888'
          return (
            <g key={loc.loc_code}>
              <polygon
                points={hexPoints(px + hexSize, py + hexHeight / 2)}
                fill={color}
                stroke="#1a1a1a"
                strokeWidth="0.5"
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}