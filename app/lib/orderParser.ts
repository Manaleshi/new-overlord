export interface ParsedOrder {
  raw: string
  repeat: boolean        // @ prefix
  conditional: number    // number of - prefixes
  alternative: boolean   // + prefix
  dayRestriction?: number // D10 prefix
  duration?: number      // number prefix like "10 STUDY"
  command: string        // MOVE, STUDY, WORK, etc
  args: string[]         // arguments after command
}

export interface ParsedUnitOrders {
  unitCode: string
  orders: ParsedOrder[]
}

export interface ParsedFactionOrders {
  factionCode: string
  password: string
  turnNumber?: number
  factionOrders: ParsedOrder[]
  unitOrders: ParsedUnitOrders[]
  errors: string[]
}

export function parseOrderFile(text: string): ParsedFactionOrders {
  const result: ParsedFactionOrders = {
    factionCode: '',
    password: '',
    factionOrders: [],
    unitOrders: [],
    errors: [],
  }

  const lines = text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith(';')) // strip blank lines and comments

  let foundGame = false
  let foundEnd = false
  let currentUnit: ParsedUnitOrders | null = null

  for (const line of lines) {
    const upper = line.toUpperCase()

    // #GAME line
    if (upper.startsWith('#GAME')) {
      const parts = line.split(/\s+/)
      if (parts.length < 3) {
        result.errors.push(`Invalid #GAME line: ${line}`)
        continue
      }
      result.factionCode = parts[1].toUpperCase()
      result.password = parts[2]
      if (parts[3] && !isNaN(parseInt(parts[3]))) {
        result.turnNumber = parseInt(parts[3])
      }
      foundGame = true
      continue
    }

    // #END line
    if (upper.startsWith('#END')) {
      foundEnd = true
      break
    }

    if (!foundGame) continue

    // UNIT line — switch current unit context
    if (upper.startsWith('UNIT ')) {
      const parts = line.split(/\s+/)
      if (parts.length < 2) {
        result.errors.push(`Invalid UNIT line: ${line}`)
        continue
      }
      currentUnit = { unitCode: parts[1].toUpperCase(), orders: [] }
      result.unitOrders.push(currentUnit)
      continue
    }

    // Parse order line
    const parsed = parseOrderLine(line)
    if (!parsed) {
      result.errors.push(`Could not parse order: ${line}`)
      continue
    }

    if (currentUnit) {
      currentUnit.orders.push(parsed)
    } else {
      result.factionOrders.push(parsed)
    }
  }

  if (!foundGame) result.errors.push('Missing #GAME line')
  if (!foundEnd) result.errors.push('Missing #END line')

  return result
}

function parseOrderLine(line: string): ParsedOrder | null {
  let remaining = line.trim()
  if (!remaining) return null

  const order: ParsedOrder = {
    raw: line,
    repeat: false,
    conditional: 0,
    alternative: false,
    command: '',
    args: [],
  }

  // Strip @ repeat prefix
  if (remaining.startsWith('@')) {
    order.repeat = true
    remaining = remaining.slice(1).trim()
  }

  // Strip + alternative prefix
  if (remaining.startsWith('+')) {
    order.alternative = true
    remaining = remaining.slice(1).trim()
  }

  // Count and strip - conditional prefixes
  while (remaining.startsWith('-')) {
    order.conditional++
    remaining = remaining.slice(1).trim()
  }

  // Check for day restriction Dnn
  const dayMatch = remaining.match(/^D(\d+)\s+/i)
  if (dayMatch) {
    order.dayRestriction = parseInt(dayMatch[1])
    remaining = remaining.slice(dayMatch[0].length).trim()
  }

  // Check for duration prefix (number before command)
  const durationMatch = remaining.match(/^(\d+)\s+/)
  if (durationMatch) {
    order.duration = parseInt(durationMatch[1])
    remaining = remaining.slice(durationMatch[0].length).trim()
  }

  // Split into command and args
  const parts = remaining.split(/\s+/)
  if (parts.length === 0 || !parts[0]) return null

  order.command = parts[0].toUpperCase()
  order.args = parts.slice(1)

  return order
}

export function formatSyntaxCheck(parsed: ParsedFactionOrders): string {
  const lines: string[] = []

  if (parsed.errors.length > 0) {
    lines.push('SYNTAX ERRORS:')
    parsed.errors.forEach(e => lines.push(`  ERROR: ${e}`))
    lines.push('')
  }

  lines.push(`Faction: ${parsed.factionCode}`)
  if (parsed.turnNumber) lines.push(`Turn: ${parsed.turnNumber}`)
  lines.push('')

  if (parsed.factionOrders.length > 0) {
    lines.push('Faction orders:')
    parsed.factionOrders.forEach(o => {
      lines.push(`  ${o.command} ${o.args.join(' ')}`)
    })
    lines.push('')
  }

  parsed.unitOrders.forEach(u => {
    lines.push(`Unit ${u.unitCode}:`)
    u.orders.forEach(o => {
      const prefix = [
        o.repeat ? '@' : '',
        o.alternative ? '+' : '',
        '-'.repeat(o.conditional),
        o.dayRestriction ? `D${o.dayRestriction} ` : '',
        o.duration ? `${o.duration} ` : '',
      ].join('')
      lines.push(`  ${prefix}${o.command} ${o.args.join(' ')}`.trimEnd())
    })
    lines.push('')
  })

  return lines.join('\n')
}