// postcss.config.js  — CommonJS-синтаксис, чтобы Node без "type": "module" не плевался
module.exports = {
  plugins: [
    require('tailwindcss'),
    require('autoprefixer'),
  ],
};
