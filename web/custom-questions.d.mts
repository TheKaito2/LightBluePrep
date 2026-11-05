import type { Plugin } from 'vite'

export const CUSTOM_DIR: string
export function loadCustom(dir?: string): { questions: { stub: Record<string, unknown>; question: Record<string, unknown> }[]; errors: string[] }
export function customQuestions(dir?: string): Plugin
