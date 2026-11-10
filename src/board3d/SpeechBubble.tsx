import { memo } from 'react'
import { getTemplate } from '../domain/library'
import type { Figure } from '../domain/types'
import { speak, useCanSpeak } from '../lib/speak'

/**
 * Sprechblase über einer Figur mit ihrem einprägsamen Satz.
 * Antippen liest den Satz vor (sofern das Gerät eine Sprachausgabe hat).
 */
export const SpeechBubble = memo(function SpeechBubble({ f }: { f: Figure }) {
  const text = f.speech ?? ''
  const audible = useCanSpeak()
  return (
    <button
      type="button"
      data-testid="speech-bubble"
      className={`speech-bubble mb-1.5 ${audible ? 'pointer-events-auto cursor-pointer' : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        speak(text, getTemplate(f.type))
      }}
      tabIndex={audible ? 0 : -1}
      aria-label={audible ? `Vorlesen: ${text}` : text}
      title={audible ? 'Antippen zum Vorlesen' : undefined}
    >
      «{text}»
    </button>
  )
})
