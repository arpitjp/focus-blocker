#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { minify } = require('terser');

const DIST_DIR = 'dist';
const FILES_TO_MINIFY = [
  'background.js',
  'popup.js',
  'blocked.js',
  'content-blocker.js',
  'offscreen.js'
];
const FILES_TO_COPY = [
  'manifest.json',
  'popup.html',
  'popup.css',
  'blocked.html',
  'offscreen.html',
  'icon16.png',
  'icon48.png',
  'icon128.png'
];

async function build() {
  const args = process.argv.slice(2);
  const bumpType = args[0] || 'patch'; // patch, minor, major

  console.log('🚀 Starting build...\n');

  // 1. Bump version
  console.log('📦 Bumping version...');
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const [major, minor, patch] = manifest.version.split('.').map(Number);
  
  let newVersion;
  if (bumpType === 'major') {
    newVersion = `${major + 1}.0.0`;
  } else if (bumpType === 'minor') {
    newVersion = `${major}.${minor + 1}.0`;
  } else {
    newVersion = `${major}.${minor}.${patch + 1}`;
  }
  
  manifest.version = newVersion;
  fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  console.log(`   Version: ${newVersion}`);

  // 2. Clean and create dist directory
  console.log('\n🧹 Cleaning dist...');
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
  }
  fs.mkdirSync(DIST_DIR);

  // 3. Minify JS files
  console.log('\n🔧 Minifying JavaScript...');
  for (const file of FILES_TO_MINIFY) {
    if (!fs.existsSync(file)) {
      console.log(`   ⚠️  Skipping ${file} (not found)`);
      continue;
    }
    const code = fs.readFileSync(file, 'utf8');
    try {
      const result = await minify(code, {
        compress: {
          drop_console: true,
          drop_debugger: true
        },
        mangle: true
      });
      fs.writeFileSync(path.join(DIST_DIR, file), result.code);
      const savings = ((1 - result.code.length / code.length) * 100).toFixed(1);
      console.log(`   ✓ ${file} (-${savings}%)`);
    } catch (e) {
      console.error(`   ✗ ${file}: ${e.message}`);
      // Copy unminified on error
      fs.copyFileSync(file, path.join(DIST_DIR, file));
    }
  }

  // 4. Copy other files
  console.log('\n📄 Copying files...');
  for (const file of FILES_TO_COPY) {
    if (!fs.existsSync(file)) {
      console.log(`   ⚠️  Skipping ${file} (not found)`);
      continue;
    }
    fs.copyFileSync(file, path.join(DIST_DIR, file));
    console.log(`   ✓ ${file}`);
  }

  // 5. Create tar.gz
  console.log('\n📦 Creating archive...');
  const tarName = `focus-blocker-v${newVersion}.tar.gz`;
  execSync(`tar -czf ${tarName} -C ${DIST_DIR} .`, { stdio: 'inherit' });
  const tarSize = (fs.statSync(tarName).size / 1024).toFixed(1);
  console.log(`   ✓ ${tarName} (${tarSize} KB)`);

  // 6. Create zip for Chrome Web Store
  const zipName = `focus-blocker-v${newVersion}.zip`;
  execSync(`cd ${DIST_DIR} && zip -r ../${zipName} .`, { stdio: 'inherit' });
  const zipSize = (fs.statSync(zipName).size / 1024).toFixed(1);
  console.log(`   ✓ ${zipName} (${zipSize} KB)`);

  // 7. Git commit and push
  console.log('\n🚀 Committing and pushing...');
  try {
    execSync('git add -A', { stdio: 'inherit' });
    execSync(`git commit -m "build: v${newVersion}"`, { stdio: 'inherit' });
    execSync('git push', { stdio: 'inherit' });
    console.log('   ✓ Pushed to GitHub');
  } catch (e) {
    console.log('   ⚠️  Git push failed or nothing to commit');
  }

  console.log(`\n✅ Build complete! v${newVersion}`);
  console.log(`   📦 ${tarName}`);
  console.log(`   📦 ${zipName}`);
}

build().catch(console.error);

