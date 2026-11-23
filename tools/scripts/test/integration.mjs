import { managedTest } from './lifecycle.mjs'
import { runIntegration } from '../../tests/integration/p1.mjs'

await managedTest('integration', (s, signal) => runIntegration(s, signal))
