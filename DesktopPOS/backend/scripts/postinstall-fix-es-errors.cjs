const fs = require("node:fs");
const path = require("node:path");

function ensureFile(filePath, content) {
  if (fs.existsSync(filePath)) return;
  fs.writeFileSync(filePath, content, "utf8");
}

function main() {
  const root = process.cwd();
  const pkgDir = path.join(root, "node_modules", "es-errors");
  if (!fs.existsSync(pkgDir)) return;

  const indexPath = path.join(pkgDir, "index.js");
  if (!fs.existsSync(indexPath)) {
    ensureFile(
      indexPath,
      "'use strict';\nmodule.exports = Error;\n",
    );
  }

  const files = [
    { name: "type.js", code: "'use strict';\nmodule.exports = TypeError;\n" },
    { name: "range.js", code: "'use strict';\nmodule.exports = RangeError;\n" },
    { name: "syntax.js", code: "'use strict';\nmodule.exports = SyntaxError;\n" },
    { name: "eval.js", code: "'use strict';\nmodule.exports = EvalError;\n" },
    { name: "ref.js", code: "'use strict';\nmodule.exports = ReferenceError;\n" },
    { name: "uri.js", code: "'use strict';\nmodule.exports = URIError;\n" },
  ];

  for (const f of files) {
    ensureFile(path.join(pkgDir, f.name), f.code);
  }
}

try {
  main();
} catch (e) {
  console.warn("[postinstall] es-errors repair skipped:", e?.message || e);
}
