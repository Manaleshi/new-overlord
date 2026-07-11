const PREFIXES = [
  'Al', 'Aus', 'Bel', 'Bor', 'Cal', 'Dar', 'Dun', 'El', 'Ern', 'Fal',
  'Gar', 'Gol', 'Grim', 'Hal', 'Ior', 'Ith', 'Kal', 'Ker', 'Kol', 'Lan',
  'Lar', 'Lith', 'Mal', 'Mar', 'Mor', 'Nal', 'Ner', 'Nor', 'Orn', 'Oth',
  'Pel', 'Ral', 'Ran', 'Ril', 'Rol', 'Sal', 'Sar', 'Sel', 'Sil', 'Tal',
  'Tar', 'Thal', 'Tor', 'Ul', 'Val', 'Var', 'Vel', 'Vol', 'Wyn', 'Zan'
]

const SUFFIXES = [
  'an', 'ar', 'as', 'ath', 'en', 'er', 'eth', 'in', 'ion', 'ir',
  'is', 'on', 'or', 'os', 'oth', 'un', 'us', 'yn', 'ys', 'ath'
]

const TERRAIN_SUFFIXES: Record<string, string[]> = {
  plains:    ['Plains', 'Fields', 'Vale', 'Grasslands', 'Flats', 'Reach'],
  forest:    ['Forest', 'Wood', 'Woods', 'Thicket', 'Glen', 'Woodland'],
  mountains: ['Mountains', 'Peaks', 'Range', 'Heights', 'Crags', 'Spine'],
  ocean:     ['Sea', 'Deep', 'Waters', 'Expanse', 'Gulf', 'Bay'],
  desert:    ['Desert', 'Wastes', 'Sands', 'Barrens', 'Flats', 'Expanse'],
  swamp:     ['Swamp', 'Marsh', 'Mire', 'Bog', 'Fens', 'Wetlands'],
  hills:     ['Hills', 'Downs', 'Moors', 'Highlands', 'Rises', 'Knolls'],
}

const SETTLEMENT_SUFFIXES = [
  'haven', 'ford', 'wick', 'mere', 'holm', 'bury', 'ton', 'field',
  'gate', 'keep', 'fall', 'moor', 'crest', 'vale', 'port', 'bridge',
  'wood', 'stone', 'hill', 'watch', 'mark', 'hold', 'cross', 'reach'
]

function generateBaseName(usedNames: Set<string>): string {
  let attempts = 0
  while (attempts < 100) {
    const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)]
    const suffix = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)]
    const name = prefix + suffix
    if (!usedNames.has(name)) {
      usedNames.add(name)
      return name
    }
    attempts++
  }
  // Fallback with number if exhausted
  const name = PREFIXES[Math.floor(Math.random() * PREFIXES.length)] + attempts
  usedNames.add(name)
  return name
}

export function generateRegionName(terrain: string, usedNames: Set<string>): string {
  const base = generateBaseName(usedNames)
  const suffixes = TERRAIN_SUFFIXES[terrain] ?? ['Region']
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)]
  return `${base} ${suffix}`
}

export function generateSettlementName(baseName: string | null, usedNames: Set<string>): string {
  if (baseName) {
    // Use the region's base name as the settlement name
    if (!usedNames.has(baseName)) {
      usedNames.add(baseName)
      return baseName
    }
  }
  // Generate a unique settlement name
  let attempts = 0
  while (attempts < 100) {
    const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)]
    const suffix = SETTLEMENT_SUFFIXES[Math.floor(Math.random() * SETTLEMENT_SUFFIXES.length)]
    const name = prefix + suffix
    if (!usedNames.has(name)) {
      usedNames.add(name)
      return name
    }
    attempts++
  }
  return 'Unnamed'
}