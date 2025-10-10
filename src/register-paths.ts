const tsconfigPaths = require('tsconfig-paths')
tsconfigPaths.register({
  baseUrl: __dirname, // dist at runtime
  paths: { '*': ['*'] }, // resolve 'utils/...' from dist
})
