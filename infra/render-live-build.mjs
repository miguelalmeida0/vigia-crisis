import { spawn } from 'node:child_process';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`)));
  });
}

// Keep the deploy reproducible without altering the canonical product lockfiles.
// The console build imports esbuild but its package does not declare it. Install
// the exact reviewed version directly into the console package, where Node's ESM
// resolver expects to find it, until that dependency debt is fixed upstream.
await run('npm', ['ci', '--ignore-scripts']);
await run('npm', ['--prefix', 'apps/operator-console', 'ci', '--ignore-scripts']);
await run('npm', ['--prefix', 'apps/operator-console', 'install', '--no-save', '--package-lock=false', '--ignore-scripts', 'esbuild@0.28.2']);
await run('npm', ['--prefix', 'apps/operator-console', 'run', 'build']);
