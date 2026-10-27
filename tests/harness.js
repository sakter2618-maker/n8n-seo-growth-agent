// Runs an n8n Code node's source exactly as n8n would, with fake $input and $('Node') data.
// This lets the same files that are pasted into n8n be tested on any computer with Node.js.
const fs = require('fs');
const path = require('path');

function runNode(file, { input = [], nodes = {}, executionId = 'test' } = {}) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'nodes', file), 'utf8');
  const wrap = arr => ({ all: () => arr.map(j => ({ json: j })), first: () => ({ json: arr[0] }) });
  const $input = wrap(input);
  const $ = name => {
    if (!(name in nodes)) throw new Error(`Node '${name}' hasn't been executed`);
    return wrap(nodes[name]);
  };
  const out = new Function('$input', '$', '$execution', 'module', code)($input, $, { id: executionId }, undefined);
  return out.map(i => i.json);
}
module.exports = { runNode };
