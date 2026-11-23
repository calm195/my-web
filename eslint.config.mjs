import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['node_modules/**', 'frontend/**', 'backend/**', 'var/**', 'prototype/**'] },
  js.configs.recommended,
  { languageOptions: { globals: globals.node } },
  { files: ['tests/e2e/**'], languageOptions: { globals: globals.browser } },
]
