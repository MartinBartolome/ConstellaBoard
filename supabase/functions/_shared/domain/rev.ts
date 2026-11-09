import type { Rev } from './types.ts'

/** Vergleicht zwei Revisionen. >0 wenn a neuer ist als b. */
export function compareRev(a: Rev, b: Rev): number {
  if (a.t !== b.t) return a.t - b.t
  return a.c < b.c ? -1 : a.c > b.c ? 1 : 0
}

export function maxRev(a: Rev | undefined, b: Rev | undefined): Rev | undefined {
  if (!a) return b
  if (!b) return a
  return compareRev(a, b) >= 0 ? a : b
}

/** Lamport-Uhr eines Clients. */
export class LamportClock {
  private t = 0
  constructor(readonly clientId: string) {}

  next(): Rev {
    this.t += 1
    return { t: this.t, c: this.clientId }
  }

  /** Beim Empfang fremder Revisionen aufrufen. */
  observe(rev: Rev): void {
    if (rev.t > this.t) this.t = rev.t
  }

  get time(): number {
    return this.t
  }
}
