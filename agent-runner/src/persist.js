const path = require('path');
const fs = require('fs');

/** Copy generated artifact into specs/ (tracked) for reuse. */
function persistArtifact(cwd, generatedPath, destName) {
  const specsDir = path.join(cwd, 'specs');
  fs.mkdirSync(specsDir, { recursive: true });
  const dest = path.join(specsDir, destName);
  fs.copyFileSync(generatedPath, dest);
  return dest;
}

module.exports = { persistArtifact };
