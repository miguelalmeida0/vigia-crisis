import { spawn } from 'node:child_process';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`)));
  });
}

// Keep the deploy reproducible without altering the canonical product lockfiles.
// The console build currently imports esbuild but its package does not declare it;
// pin the same version used by the reviewed portfolio-demo build until that debt is
// corrected in the main integration line.
await run('npm', ['ci', '--ignore-scripts']);
await run('npm', ['--prefix', 'apps/operator-console', 'ci', '--ignore-scripts']);
await run('npm', ['install', '--no-save', '--package-lock=false', '--ignore-scripts', 'esbuild@0.28.2']);
await run('npm', ['--prefix', 'apps/operator-console', 'run', 'build']);
