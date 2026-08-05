const path = require('path');
const fs = require('fs');

const MAX_ARTIFACT_BYTES = Number(process.env.ARTIFACT_MAX_BYTES) || 10 * 1024 * 1024;

/** Copy generated artifact into specs/ (tracked) for reuse. */
function persistArtifact(cwd, generatedPath, destName) {
  const safeName = path.basename(destName || 'artifact.txt');
  const specsDir = path.join(cwd, 'specs');
  fs.mkdirSync(specsDir, { recursive: true });
  const src = path.resolve(generatedPath);
  const size = fs.statSync(src).size;
  if (size > MAX_ARTIFACT_BYTES) {
    throw new Error(`Artefato excede o limite de ${MAX_ARTIFACT_BYTES} bytes (${size}).`);
  }
  const dest = path.join(specsDir, safeName);
  fs.copyFileSync(src, dest);
  return dest;
}

module.exports = { persistArtifact };
