// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MistakeFields } from './MistakeFields'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => { vi.useFakeTimers(); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

const chip = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('.mlog-tags .chip')]
  .find((c) => c.textContent?.startsWith(name))!
const fine = () => host.querySelector('.mlog-fine')!.textContent
const hint = () => host.querySelector('.mlog-hint')!.textContent

describe('MistakeFields', () => {
  it('confirms a resolved save for 2 seconds, and never a failed one', async () => {
    const onSave = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'))
    act(() => root.render(<MistakeFields mistake={null} onSave={onSave} fine="Saved automatically." />))
    expect(fine()).toBe('Saved automatically.')
    expect(hint()).toBe('Pick as many as fit.')

    await act(async () => { chip('Careless').click() })
    expect(onSave).toHaveBeenLastCalledWith(['silly'], null)
    expect(hint()).toBe("Careless: Knew it, slipped anyway")
    expect(fine()).toBe('Saved')
    act(() => { vi.advanceTimersByTime(2000) })
    expect(fine()).toBe('Saved automatically.')

    await act(async () => { chip('Other').click() })
    expect(fine()).toBe('Saved automatically.')
  })
})
