import { useEffect, useMemo } from 'react'
import { BoardEditor } from '../board/BoardEditor'
import { FULL_PERMISSIONS } from '../board/editor'
import { BoardStore } from '../state/boardStore'
import { Link } from '../lib/router'
import { LogoMark } from '../components/Logo'

/**
 * Übungsbrett: läuft vollständig im Browser, ohne Server.
 * Nichts wird gespeichert – beim Schliessen des Tabs ist das Brett weg.
 */
export function LocalBoardPage() {
  const store = useMemo(() => new BoardStore(), [])
  useEffect(() => {
    document.title = 'Übungsbrett – ConstellaBoard'
  }, [])
  return (
    <BoardEditor
      store={store}
      perms={FULL_PERMISSIONS}
      headerLeft={
        <>
          <Link to="/" className="rounded-xl p-1 hover:bg-paper-2">
            <LogoMark size={32} />
          </Link>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Übungsbrett</div>
            <div className="hidden truncate text-xs text-ink-3 sm:block">Nur in diesem Browser · wird nicht gespeichert</div>
          </div>
        </>
      }
    />
  )
}
