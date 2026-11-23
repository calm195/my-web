import { managedTest } from './lifecycle.mjs'
import { runIntegration } from '../../tests/integration/site-and-session.mjs'

await managedTest('integration', (s, signal) => runIntegration(s, signal))
