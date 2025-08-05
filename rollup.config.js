import { babel } from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default {
  input: 'client.mjs',
  output: {
    file: 'dist/thinbus-srp-legacy.js',
    format: 'umd',
    name: 'ThinbusSRP',
    globals: {
      'crypto-js/sha256': 'CryptoJS.SHA256'
    }
  },
  external: ['crypto-js/sha256'],
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: false
    }),
    babel({
      babelHelpers: 'bundled',
      exclude: 'node_modules/**'
    }),
    terser({
      format: {
        comments: false
      }
    })
  ]
};