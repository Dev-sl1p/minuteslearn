const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Execute application source with explicit dependencies only. A missing mock
// fails immediately, so tests cannot connect to the configured production DB.
function loadSource(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const moduleRecord = { exports: {} };
  vm.runInNewContext(output, {
    module: moduleRecord, exports: moduleRecord.exports, Buffer, Date, URL, URLSearchParams, Request, Response, AbortSignal,
    TextEncoder, console, crypto: require('node:crypto').webcrypto, process: { env: {} },
    require(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === 'node:crypto' || id === 'crypto') return require('node:crypto');
      throw new Error(`Unmocked dependency ${id} in ${file}`);
    }, ...globals,
  }, { filename: file });
  return moduleRecord.exports;
}

function reactHarness() {
  let cursor = 0;
  let effects = [];
  const slots = [];
  const same = (a, b) => a?.length === b?.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useMemo(fn, deps) { return react.useCallback(fn, deps)(); },
    useEffect(fn, deps) { const i = cursor++; effects.push({ fn, deps, changed: !same(slots[i], deps) }); slots[i] = deps; },
    memo(fn) { return fn; },
  };
  return { react, slots, render(component, props) { cursor = 0; effects = []; const tree = component(props); return { tree, effects: [...effects] }; } };
}
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' };
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return undefined;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; }
}
module.exports = { loadSource, reactHarness, jsx, find };
