// Neutralize the 'server-only' import guard so handler code can run under tsx.
const Module = require("node:module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "server-only") {
    return require.resolve("./_empty.cjs");
  }
  return origResolve.call(this, request, ...args);
};
