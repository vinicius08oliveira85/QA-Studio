// Envia um comando ao keeper e imprime o resultado.
// Uso: node scripts/cpm-send.js '<json do comando>'
//   ex.: node scripts/cpm-send.js '{"type":"dump"}'
//        node scripts/cpm-send.js '{"type":"click","label":"Atendimento"}'
const path = require('path');
const fs = require('fs');

const WORK = path.join(__dirname, '..', '.freebuff');
const CMD_FILE = path.join(WORK, 'cpm-cmd.json');
const OUT_FILE = path.join(WORK, 'cpm-out.json');

const raw = process.argv.slice(2).join(' ');
let cmd;
try {
  cmd = JSON.parse(raw);
} catch {
  console.error('JSON inválido:', raw.slice(0, 200));
  process.exit(1);
}

fs.mkdirSync(WORK, { recursive: true });
fs.rmSync(OUT_FILE, { force: true });
fs.writeFileSync(CMD_FILE, JSON.stringify(cmd), 'utf8');

// Espera a resposta (até 90s).
const deadline = Date.now() + 90_000;
(async () => {
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    if (fs.existsSync(OUT_FILE)) {
      const out = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
      console.log(JSON.stringify(out, null, 1));
      fs.rmSync(OUT_FILE, { force: true });
      process.exit(0);
    }
  }
  console.error('TIMEOUT aguardando resposta do keeper');
  process.exit(1);
})();
