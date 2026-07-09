'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'lela_include_dummy'

interface DummyDataContextValue {
  includeDummy: boolean
  setIncludeDummy: (value: boolean) => void
}

const DummyDataContext = createContext<DummyDataContextValue | null>(null)

export function DummyDataProvider({ children }: { children: ReactNode }) {
  const [includeDummy, setIncludeDummyState] = useState(false)

  useEffect(() => {
    setIncludeDummyState(window.localStorage.getItem(STORAGE_KEY) === '1')
  }, [])

  function setIncludeDummy(value: boolean) {
    setIncludeDummyState(value)
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  }

  return (
    <DummyDataContext.Provider value={{ includeDummy, setIncludeDummy }}>
      {children}
    </DummyDataContext.Provider>
  )
}

export function useDummyData(): DummyDataContextValue {
  const ctx = useContext(DummyDataContext)
  if (!ctx) throw new Error('useDummyData must be used within a DummyDataProvider')
  return ctx
}

/** Appends `dummy=1` to a fetch URL when the toggle is on — for GET requests read by API routes. */
export function withDummyParam(url: string, includeDummy: boolean): string {
  if (!includeDummy) return url
  return url.includes('?') ? `${url}&dummy=1` : `${url}?dummy=1`
}
