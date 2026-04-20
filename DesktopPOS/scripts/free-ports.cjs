const { execSync } = require("node:child_process");

const TARGET_PORTS = [3010, 3313];

function killPort(port) {
  const cmd =
    `powershell -NoProfile -Command "` +
    `$pids = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ` +
    `Select-Object -ExpandProperty OwningProcess -Unique; ` +
    `if ($pids) { $pids | ForEach-Object { try { Stop-Process -Id $_ -Force -ErrorAction Stop; Write-Output $_ } catch {} } }"`; 
  try {
    const out = execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const killed = out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s));
    for (const pid of killed) {
      console.log(`[DesktopPOS] Port ${port} libéré (PID ${pid}).`);
    }
  } catch {
    // Port already free or requires no action.
  }
}

for (const port of TARGET_PORTS) killPort(port);
