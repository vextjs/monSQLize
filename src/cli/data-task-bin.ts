import type { DataTaskService } from '../../types/data-tasks';
import { runCli } from './data-task';

// The published bin sits at dist/cjs/cli/data-task.cjs and reuses the package's
// CJS root bundle instead of embedding a second copy of the complete runtime.
const MonSQLize = require('../index.cjs') as { dataTasks: DataTaskService };

runCli(process.argv.slice(2), MonSQLize.dataTasks).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
