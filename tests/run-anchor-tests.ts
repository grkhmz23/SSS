import { execSync } from 'node:child_process';

execSync('pnpm --filter @stbr/integration-tests test:anchor', {
  stdio: 'inherit',
});
