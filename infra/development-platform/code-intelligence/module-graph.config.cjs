const path = require('node:path');
const { options } = require(path.resolve('.dependency-cruiser.cjs'));

// Standard dependency-cruiser reporting configuration. No audit rules are run.
module.exports = {
  forbidden: [],
  options: {
    ...options,
    tsPreCompilationDeps: true,
    tsConfig: { fileName: process.env.XGS_GRAPH_TSCONFIG },
    includeOnly: { path: process.env.XGS_GRAPH_SCOPE_PATTERN },
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: {
      conditionNames: ['import', 'require', 'node', 'default'],
      exportsFields: ['exports'],
    },
  },
};
