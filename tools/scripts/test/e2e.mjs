import { managedTest } from './lifecycle.mjs'
import { runE2E } from '../../tests/e2e/site-and-session.mjs'

await managedTest('e2e', (s, signal) => runE2E(s, signal))
