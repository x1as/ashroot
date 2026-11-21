// npm run deploy: build, then publish dist/ to the `gh-pages` branch of origin.
// Uses only git (no extra packages). GitHub Pages serves that branch at https://<user>.github.io/<repo>/
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });
const root = process.cwd();
sh('node tools/build.mjs', root);
const remote = execSync('git remote get-url origin', { cwd: root }).toString().trim();
const dist = path.join(root, 'dist');
fs.rmSync(path.join(dist, '.git'), { recursive: true, force: true });
sh('git init -q -b gh-pages', dist);
sh('git add -A', dist);
sh('git -c user.name="x1as" -c user.email="x1as@users.noreply.github.com" commit -q -m "Deploy Ashroot"', dist);
sh(`git push -f ${remote} gh-pages`, dist);
fs.rmSync(path.join(dist, '.git'), { recursive: true, force: true });
console.log('Deployed to gh-pages');
