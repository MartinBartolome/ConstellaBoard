import { useEffect, useState } from 'react'
import type { FigureTemplate } from '../domain/library'

/**
 * Liest den Satz einer Figur mit der Sprachausgabe des Geräts vor
 * (Web Speech API). Aus Datenschutzgründen nur mit Stimmen, die lokal auf dem
 * Gerät laufen (`localService`): Online-Stimmen (z. B. „Google Deutsch" in
 * Chrome) würden den Text an einen fremden Server schicken.
 * Die Stimmlage richtet sich grob nach der Figur.
 */

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined' ? window.speechSynthesis : null
}

export function localGermanVoice(): SpeechSynthesisVoice | null {
  const voices = synth()?.getVoices().filter((v) => v.localService && v.lang?.toLowerCase().startsWith('de')) ?? []
  return voices.find((v) => v.lang === 'de-CH') ?? voices[0] ?? null
}

export function canSpeak(): boolean {
  return localGermanVoice() !== null
}

/** Ob vorgelesen werden kann; aktualisiert sich, sobald der Browser die Stimmen geladen hat. */
export function useCanSpeak(): boolean {
  const [ok, setOk] = useState(canSpeak)
  useEffect(() => {
    const s = synth()
    if (!s) return
    const update = () => setOk(canSpeak())
    update()
    s.addEventListener?.('voiceschanged', update)
    return () => s.removeEventListener?.('voiceschanged', update)
  }, [])
  return ok
}

export function speak(text: string, tpl?: FigureTemplate): boolean {
  const s = synth()
  const voice = localGermanVoice()
  if (!s || !voice || !text.trim()) return false
  s.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice
  u.lang = voice.lang
  u.rate = 0.92
  u.pitch = pitchFor(tpl)
  s.speak(u)
  return true
}

export function pitchFor(tpl?: FigureTemplate): number {
  switch (tpl?.category) {
    case 'kind':
      return 1.45
    case 'baby':
      return 1.6
    case 'frau':
      return 1.15
    case 'mann':
      return 0.8
    default:
      return 1
  }
}
