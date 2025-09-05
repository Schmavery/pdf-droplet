// infer-callsites.js
// Proof-of-concept: scan project, collect callsite arg types, propose JSDoc param types.
// WARNING: --apply will edit files. Commit or use a branch before running with --apply.

const { Project, SyntaxKind } = require("ts-morph");
const path = require("path");

const apply = process.argv.includes("--apply");

// Adjust this glob or pass your tsconfig.json path to Project if you have one
const project = new Project({
  // use your tsconfig if you have one:
  // tsConfigFilePath: "tsconfig.json"
  // Or use file glob:
  compilerOptions: {
    allowJs: true,
    checkJs: false,
    target: 3, // ES2015
    // enable other strict options if desired
  },
  skipFileDependencyResolution: false,
});

project.addSourceFilesAtPaths("**/*.{js,jsx,ts,tsx}");
const checker = project.getTypeChecker();

function uniq(arr) {
  return Array.from(new Set(arr));
}

function typeToString(type) {
  try {
    // ts-morph type object has getText or getSymbol; here's simple:
    return checker.getTypeText(type, undefined, /*flags*/ undefined);
  } catch (e) {
    // fallback
    return String(type);
  }
}

function getParamName(paramNode, idx) {
  if (!paramNode) return `arg${idx}`;
  const nameNode = paramNode.getNameNode();
  return nameNode ? nameNode.getText() : `arg${idx}`;
}

function buildJSDocComment(params, returns) {
  let lines = ["/**", " * Inferred by infer-callsites (best-effort)"];
  for (const p of params) {
    lines.push(` * @param {${p.type}} ${p.name}`);
  }
  if (returns) lines.push(` * @returns {${returns}}`);
  lines.push(" */");
  return lines.join("\n");
}

function getCallExpressionArgsTypes(callExpr) {
  // For a call expression, get resolved signature and param types at this callsite
  try {
    const sig = checker.getResolvedSignature(callExpr.compilerNode);
    if (sig) {
      const params = sig.getParameters();
      // for each parameter symbol, get its type at the call node
      return params.map((paramSym, i) => {
        const paramType = checker.getTypeOfSymbolAtLocation(
          paramSym,
          callExpr.compilerNode
        );
        return typeToString(paramType);
      });
    }
  } catch (e) {
    // fallback: inspect arguments individually
  }

  // fallback: inspect each argument expression directly
  return callExpr.getArguments().map((arg) => {
    const t = checker.getTypeAtLocation(arg.compilerNode);
    return typeToString(t);
  });
}

function collectCallsiteArgTypesForFunction(fn) {
  // fn: FunctionDeclaration | VariableDeclaration(with function) | ArrowFunction | FunctionExpression
  const name = fn.getSymbol() ? fn.getSymbol().getName() : null;

  const identifier =
    fn.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) ||
    fn.getFirstAncestorByKind(SyntaxKind.VariableDeclaration) ||
    fn.getFirstAncestorByKind(SyntaxKind.PropertyAssignment) ||
    fn;

  // Try to get a symbol for the function definition so we can find references
  const symbol = fn.getSymbol() || (identifier && identifier.getSymbol());
  if (!symbol) return null;

  const refs = symbol.findReferences();
  // map param index -> set of observed types
  const perParamTypes = new Map();
  let returnTypes = new Set();

  for (const ref of refs) {
    for (const refEntry of ref.getReferences()) {
      const node = refEntry.getNode();
      // parent might be a CallExpression (identifier used as callee)
      const maybeCall =
        node.getParentIfKind(SyntaxKind.CallExpression) ||
        node
          .getParentIfKind(SyntaxKind.PropertyAccessExpression)
          ?.getParentIfKind(SyntaxKind.CallExpression);
      if (!maybeCall) continue;
      const callExpr = maybeCall;
      // resolved signature approach (recommended)
      try {
        const sig = checker.getResolvedSignature(callExpr.compilerNode);
        if (sig) {
          const params = sig.getParameters();
          for (let i = 0; i < params.length; ++i) {
            const paramSym = params[i];
            const t = checker.getTypeOfSymbolAtLocation(
              paramSym,
              callExpr.compilerNode
            );
            const tstr = typeToString(t);
            if (!perParamTypes.has(i)) perParamTypes.set(i, new Set());
            perParamTypes.get(i).add(tstr);
          }
          // deduce return type for this call
          const ret = sig.getReturnType();
          if (ret) {
            returnTypes.add(typeToString(ret));
          }
          continue;
        }
      } catch (e) {
        // fallthrough
      }

      // fallback: look at argument expressions
      const args = callExpr.getArguments();
      for (let i = 0; i < args.length; ++i) {
        const t = checker.getTypeAtLocation(args[i].compilerNode);
        const tstr = typeToString(t);
        if (!perParamTypes.has(i)) perParamTypes.set(i, new Set());
        perParamTypes.get(i).add(tstr);
      }
    }
  }

  return {
    symbolName: symbol.getName(),
    perParamTypes,
    returnTypes,
    fn,
  };
}

function proposeTypeStringFromSet(setOfStrings) {
  if (!setOfStrings || setOfStrings.size === 0) return "any";
  const arr = Array.from(setOfStrings).filter(Boolean);
  if (arr.length === 1) return arr[0];
  // prefer to collapse identical-looking union pieces
  return arr.join(" | ");
}

function suggestForFunction(fn) {
  const info = collectCallsiteArgTypesForFunction(fn);
  if (!info) return null;
  const { perParamTypes, returnTypes } = info;
  const params = fn.getParameters();
  const suggestions = [];

  for (let i = 0; i < Math.max(params.length, perParamTypes.size); ++i) {
    const paramNode = params[i];
    const name = getParamName(paramNode, i);
    const typeset = perParamTypes.has(i) ? perParamTypes.get(i) : new Set();
    const suggestion = proposeTypeStringFromSet(typeset);
    suggestions.push({ name, type: suggestion });
  }

  const returns = returnTypes.size
    ? proposeTypeStringFromSet(returnTypes)
    : null;
  return { name: info.symbolName, suggestions, returns, fnNode: fn };
}

function findAllFunctions() {
  const files = project.getSourceFiles();
  const out = [];
  for (const file of files) {
    // Function declarations
    const funcDecls = file.getFunctions();
    for (const f of funcDecls) out.push(f);

    // exported const foo = (a, b) => { } or const foo = function(...) {}
    const vars = file.getVariableDeclarations();
    for (const v of vars) {
      const init = v.getInitializer();
      if (!init) continue;
      if (
        init.getKindName().includes("Function") ||
        init.getKind() === SyntaxKind.ArrowFunction
      ) {
        out.push(init);
      }
    }

    // Class methods
    const classes = file.getClasses();
    for (const c of classes) {
      for (const m of c.getMethods()) out.push(m);
    }
  }
  return out;
}

// Main pass
const fns = findAllFunctions();

const suggestions = [];
for (const fn of fns) {
  const s = suggestForFunction(fn);
  if (s && s.suggestions.length > 0) suggestions.push(s);
}

if (suggestions.length === 0) {
  console.log(
    "No suggestions found (maybe no callsites or project too small)."
  );
  process.exit(0);
}

for (const s of suggestions) {
  console.log("Function:", s.name);
  for (const p of s.suggestions) {
    console.log(`  @param ${p.name}: ${p.type}`);
  }
  if (s.returns) console.log(`  @returns ${s.returns}`);
  console.log("");
}

// If apply, write JSDoc above each function
if (apply) {
  console.log("Applying JSDoc comments to files (editing)...");
  for (const s of suggestions) {
    try {
      const fnNode = s.fnNode;
      // build JSDoc
      const jsdoc = buildJSDocComment(s.suggestions, s.returns);
      // Insert the JSDoc above the function by replacing the function node text with comment + function
      // (This is blunt but simple.)
      const original = fnNode.getText();
      const newText = `${jsdoc}\n${original}`;
      fnNode.replaceWithText(newText);
    } catch (e) {
      console.error(
        "Failed to apply JSDoc for",
        s.name,
        e && e.stack ? e.stack : e
      );
    }
  }
  // Save changed files
  project.saveSync();
  console.log("Done. Files updated. Please review changes.");
} else {
  console.log(
    "Run with --apply to automatically insert suggested JSDoc comments above functions."
  );
}
